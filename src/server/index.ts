import { buildMplCoreMetadata, createSimulatedMintAddress } from "@obrera/mpl-core-kit-lib";
import express, { type NextFunction, type Request, type Response } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ActivityRecord,
  AppState,
  AssetRecord,
  AuthRequest,
  CollectionSchema,
  CreateMintRequest,
  DraftRecord,
  SaveDraftRequest,
  UserRecord
} from "../shared/contracts.js";
import { FileDatabase } from "./db.js";
import {
  buildAnalytics,
  buildMetadataDiff,
  composeDraft,
  computeUsageStats,
  getCollectionBySlug,
  listCollections,
  quoteDraft
} from "./logic.js";
import {
  clearCookieHeader,
  createId,
  hashPassword,
  nowUtc,
  parseCookies,
  sanitizeUser,
  setCookieHeader,
  verifyPassword
} from "./utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..", "..");
const publicDir = path.resolve(rootDir, "dist", "public");
const cookieName = "tf_session";
const sessionMaxAgeSeconds = 60 * 60 * 24 * 14;
const dataPath =
  process.env.TRAITFORGE_DATA_PATH ??
  path.resolve(rootDir, "data", "traitforge-db.json");

const db = new FileDatabase(dataPath);
const app = express();

app.use(express.json({ limit: "2mb" }));

function getSessionUser(state: AppState, request: Request): UserRecord | null {
  const sessionId = parseCookies(request)[cookieName];
  if (!sessionId) {
    return null;
  }

  const now = Date.now();
  const session = state.sessions.find(
    (entry) =>
      entry.id === sessionId && new Date(entry.expiresAt).getTime() > now
  );
  if (!session) {
    return null;
  }

  return state.users.find((entry) => entry.id === session.userId) ?? null;
}

function getParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function asyncRoute(
  handler: (request: Request, response: Response, next: NextFunction) => Promise<void>
) {
  return (request: Request, response: Response, next: NextFunction) => {
    void handler(request, response, next).catch(next);
  };
}

async function requireUser(request: Request, response: Response) {
  const state = await db.read();
  const user = getSessionUser(state, request);
  if (!user) {
    response.status(401).json({ error: "Authentication required." });
    return null;
  }

  return { state, user };
}

async function requireOperator(request: Request, response: Response) {
  const auth = await requireUser(request, response);
  if (!auth) {
    return null;
  }

  if (auth.user.role !== "operator") {
    response.status(403).json({ error: "Operator access required." });
    return null;
  }

  return auth;
}

function makeActivity(
  user: UserRecord,
  kind: ActivityRecord["kind"],
  scope: string,
  message: string
): ActivityRecord {
  return {
    id: createId("activity"),
    actorUserId: user.id,
    actorDisplayName: user.displayName,
    kind,
    scope,
    message,
    createdAt: nowUtc()
  };
}

function validateAuthPayload(payload: Partial<AuthRequest>) {
  const username = payload.username?.trim().toLowerCase() ?? "";
  const password = payload.password ?? "";
  const displayName = payload.displayName?.trim() || username;

  if (!username || username.length < 3) {
    throw new Error("Username must be at least 3 characters.");
  }

  if (!password || password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  return {
    username,
    password,
    displayName
  };
}

function draftsForUser(state: AppState, user: UserRecord | null): DraftRecord[] {
  if (!user) {
    return [];
  }

  if (user.role === "operator") {
    return [...state.drafts].sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt)
    );
  }

  return state.drafts
    .filter((draft) => draft.userId === user.id)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function mintIntentsForUser(state: AppState, user: UserRecord | null) {
  const intents =
    user?.role === "operator"
      ? state.mintIntents
      : state.mintIntents.filter((entry) => entry.userId === user?.id);

  return [...intents].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt)
  );
}

app.get(
  "/api/health",
  asyncRoute(async (_request, response) => {
    response.json({ ok: true });
  })
);

app.get(
  "/api/auth/session",
  asyncRoute(async (request, response) => {
    const state = await db.read();
    const user = getSessionUser(state, request);
    response.json({
      user: user ? sanitizeUser(user) : null
    });
  })
);

app.post(
  "/api/auth/register",
  asyncRoute(async (request, response) => {
    const payload = validateAuthPayload(request.body as Partial<AuthRequest>);
    const sessionId = createId("sess");

    const user = await db.update((state) => {
      if (state.users.some((entry) => entry.username === payload.username)) {
        throw new Error("Username is already in use.");
      }

      const createdAt = nowUtc();
      const createdUser: UserRecord = {
        id: createId("user"),
        username: payload.username,
        displayName: payload.displayName,
        role: "creator",
        passwordHash: hashPassword(payload.password),
        createdAt
      };

      state.users.push(createdUser);
      state.sessions.push({
        id: sessionId,
        userId: createdUser.id,
        createdAt,
        expiresAt: new Date(
          Date.now() + sessionMaxAgeSeconds * 1000
        ).toISOString()
      });
      state.activity.unshift(
        makeActivity(
          createdUser,
          "creator",
          "Auth",
          "Created a local TraitForge account."
        )
      );
      return createdUser;
    });

    response.setHeader(
      "Set-Cookie",
      setCookieHeader(cookieName, sessionId, sessionMaxAgeSeconds)
    );
    response.status(201).json({
      user: sanitizeUser(user)
    });
  })
);

app.post(
  "/api/auth/login",
  asyncRoute(async (request, response) => {
    const payload = validateAuthPayload(request.body as Partial<AuthRequest>);
    const sessionId = createId("sess");

    const user = await db.update((state) => {
      const existing = state.users.find(
        (entry) => entry.username === payload.username
      );
      if (!existing || !verifyPassword(payload.password, existing.passwordHash)) {
        throw new Error("Invalid username or password.");
      }

      state.sessions = state.sessions.filter(
        (entry) =>
          entry.userId !== existing.id ||
          new Date(entry.expiresAt).getTime() > Date.now()
      );
      state.sessions.push({
        id: sessionId,
        userId: existing.id,
        createdAt: nowUtc(),
        expiresAt: new Date(
          Date.now() + sessionMaxAgeSeconds * 1000
        ).toISOString()
      });
      state.activity.unshift(
        makeActivity(existing, "creator", "Auth", "Logged into TraitForge.")
      );

      return existing;
    });

    response.setHeader(
      "Set-Cookie",
      setCookieHeader(cookieName, sessionId, sessionMaxAgeSeconds)
    );
    response.json({
      user: sanitizeUser(user)
    });
  })
);

app.post(
  "/api/auth/logout",
  asyncRoute(async (request, response) => {
    const sessionId = parseCookies(request)[cookieName];
    if (sessionId) {
      await db.update((state) => {
        state.sessions = state.sessions.filter((entry) => entry.id !== sessionId);
      });
    }

    response.setHeader("Set-Cookie", clearCookieHeader(cookieName));
    response.json({ ok: true });
  })
);

app.get(
  "/api/bootstrap",
  asyncRoute(async (request, response) => {
    const state = await db.read();
    const user = getSessionUser(state, request);
    response.json({
      session: {
        user: user ? sanitizeUser(user) : null
      },
      collections: listCollections(state),
      drafts: draftsForUser(state, user),
      mintIntents: mintIntentsForUser(state, user).slice(0, 8),
      activity: [...state.activity]
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, 16)
    });
  })
);

app.get(
  "/api/collections/:slug/schema",
  asyncRoute(async (request, response) => {
    const state = await db.read();
    const collection = getCollectionBySlug(state, getParam(request.params.slug));
    response.json({
      collection,
      usage: computeUsageStats(state, collection)
    });
  })
);

app.post(
  "/api/drafts/render",
  asyncRoute(async (request, response) => {
    const state = await db.read();
    const payload = request.body as { collectionSlug: string; selections: Record<string, string>; name?: string };
    const result = composeDraft(
      state,
      payload.collectionSlug,
      payload.selections ?? {},
      payload.name
    );
    response.json(result);
  })
);

app.get(
  "/api/drafts",
  asyncRoute(async (request, response) => {
    const auth = await requireUser(request, response);
    if (!auth) {
      return;
    }

    response.json({
      drafts: draftsForUser(auth.state, auth.user)
    });
  })
);

app.get(
  "/api/drafts/:shareId",
  asyncRoute(async (request, response) => {
    const state = await db.read();
    const draft = state.drafts.find((entry) => entry.shareId === request.params.shareId);
    if (!draft) {
      response.status(404).json({ error: "Draft not found." });
      return;
    }

    const asset = draft.previewAssetId
      ? state.assets.find((entry) => entry.id === draft.previewAssetId)
      : undefined;

    response.json({
      draft,
      asset
    });
  })
);

app.post(
  "/api/drafts",
  asyncRoute(async (request, response) => {
    const auth = await requireUser(request, response);
    if (!auth) {
      return;
    }

    const payload = request.body as SaveDraftRequest;
    const draft = await db.update((state) => {
      const composition = quoteDraft(
        state,
        payload.collectionSlug,
        payload.selections,
        payload.title
      );
      const now = nowUtc();
      const existing = payload.draftId
        ? state.drafts.find((entry) => entry.id === payload.draftId)
        : undefined;

      if (existing && existing.userId !== auth.user.id && auth.user.role !== "operator") {
        throw new Error("You can only update your own drafts.");
      }

      let previewAssetId = existing?.previewAssetId;
      if (!previewAssetId) {
        previewAssetId = createId("asset");
        state.assets.push({
          id: previewAssetId,
          ownerUserId: auth.user.id,
          collectionSlug: payload.collectionSlug,
          previewSvg: composition.preview.svg,
          metadata: buildMplCoreMetadata(composition.preview.metadataInput),
          createdAt: now,
          sourceDraftId: existing?.id ?? payload.draftId ?? createId("draftref")
        });
      } else {
        const asset = state.assets.find((entry) => entry.id === previewAssetId);
        if (asset) {
          asset.previewSvg = composition.preview.svg;
          asset.metadata = buildMplCoreMetadata(composition.preview.metadataInput);
        }
      }

      if (existing) {
        existing.title = payload.title;
        existing.collectionSlug = payload.collectionSlug;
        existing.selections = composition.selections;
        existing.rarity = composition.rarity;
        existing.conflicts = composition.conflicts;
        existing.previewAssetId = previewAssetId;
        existing.lastQuote = composition.quote;
        existing.updatedAt = now;
        state.activity.unshift(
          makeActivity(
            auth.user,
            "creator",
            "Draft Save",
            `Updated draft ${existing.title}.`
          )
        );
        return existing;
      }

      const created: DraftRecord = {
        id: createId("draft"),
        shareId: `${payload.title
          .toLowerCase()
          .replaceAll(/[^a-z0-9]+/g, "-")
          .replaceAll(/^-|-$/g, "")}-${Math.random().toString(36).slice(2, 6)}`,
        title: payload.title,
        userId: auth.user.id,
        collectionSlug: payload.collectionSlug,
        selections: composition.selections,
        rarity: composition.rarity,
        conflicts: composition.conflicts,
        previewAssetId,
        lastQuote: composition.quote,
        createdAt: now,
        updatedAt: now
      };

      const previewAsset = state.assets.find((entry) => entry.id === previewAssetId);
      if (previewAsset) {
        previewAsset.sourceDraftId = created.id;
      }

      state.drafts.unshift(created);
      state.activity.unshift(
        makeActivity(
          auth.user,
          "creator",
          "Draft Save",
          `Saved draft ${created.title}.`
        )
      );
      return created;
    });

    response.status(201).json({ draft });
  })
);

app.post(
  "/api/mints/quote",
  asyncRoute(async (request, response) => {
    const state = await db.read();
    const payload = request.body as { collectionSlug: string; selections: Record<string, string>; name?: string };
    response.json(
      quoteDraft(state, payload.collectionSlug, payload.selections ?? {}, payload.name)
    );
  })
);

app.post(
  "/api/mints/create",
  asyncRoute(async (request, response) => {
    const auth = await requireUser(request, response);
    if (!auth) {
      return;
    }

    const payload = request.body as CreateMintRequest;
    const created = await db.update((state) => {
      const collection = getCollectionBySlug(state, payload.collectionSlug);
      const quoted = quoteDraft(
        state,
        payload.collectionSlug,
        payload.selections,
        payload.name ?? `${collection.name} Mint`
      );

      if (quoted.conflicts.length > 0) {
        throw new Error("Resolve conflicts before mint creation.");
      }

      const now = nowUtc();
      const assetId = createId("asset");
      const mintId = createId("mint");
      const asset: AssetRecord = {
        id: assetId,
        ownerUserId: auth.user.id,
        collectionSlug: payload.collectionSlug,
        previewSvg: quoted.preview.svg,
        metadata: buildMplCoreMetadata(quoted.preview.metadataInput),
        createdAt: now,
        sourceDraftId: payload.draftId,
        mintIntentId: mintId
      };
      const mintIntent = {
        id: mintId,
        userId: auth.user.id,
        collectionSlug: payload.collectionSlug,
        draftId: payload.draftId,
        assetId,
        quote: quoted.quote,
        simulatedAddress: createSimulatedMintAddress(
          `${payload.collectionSlug}:${auth.user.id}:${now}`
        ),
        status: "minted" as const,
        createdAt: now
      };

      state.assets.unshift(asset);
      state.mintIntents.unshift(mintIntent);

      if (payload.draftId) {
        const draft = state.drafts.find((entry) => entry.id === payload.draftId);
        if (draft && (draft.userId === auth.user.id || auth.user.role === "operator")) {
          draft.lastQuote = quoted.quote;
          draft.updatedAt = now;
        }
      }

      state.activity.unshift(
        makeActivity(
          auth.user,
          "mint",
          "Mint Simulator",
          `Created mint intent ${mintIntent.simulatedAddress}.`
        )
      );

      return { asset, mintIntent };
    });

    response.status(201).json(created);
  })
);

app.get(
  "/api/assets/:id",
  asyncRoute(async (request, response) => {
    const state = await db.read();
    const asset = state.assets.find((entry) => entry.id === request.params.id);
    if (!asset) {
      response.status(404).json({ error: "Asset not found." });
      return;
    }

    response.json(asset);
  })
);

app.get(
  "/api/admin/collections/:slug/analytics",
  asyncRoute(async (request, response) => {
    const auth = await requireOperator(request, response);
    if (!auth) {
      return;
    }

    const analytics = buildAnalytics(auth.state, getParam(request.params.slug));
    response.json({
      ...analytics,
      recentMintIntents: auth.state.mintIntents
        .filter((entry) => entry.collectionSlug === getParam(request.params.slug))
        .slice(0, 8)
    });
  })
);

app.put(
  "/api/admin/collections/:slug/schema",
  asyncRoute(async (request, response) => {
    const auth = await requireOperator(request, response);
    if (!auth) {
      return;
    }

    const payload = request.body as { collection: CollectionSchema };
    if (payload.collection.slug !== getParam(request.params.slug)) {
      throw new Error("Collection slug mismatch.");
    }

    const collection = await db.update((state) => {
      const index = state.collections.findIndex(
        (entry) => entry.slug === getParam(request.params.slug)
      );
      if (index === -1) {
        throw new Error("Collection not found.");
      }

      state.collections[index] = payload.collection;
      state.activity.unshift(
        makeActivity(
          auth.user,
          "operator",
          "Schema Lab",
          `Updated schema for ${payload.collection.name}.`
        )
      );
      return state.collections[index];
    });

    response.json({
      collection
    });
  })
);

app.post(
  "/api/admin/collections/:slug/metadata-diff",
  asyncRoute(async (request, response) => {
    const auth = await requireOperator(request, response);
    if (!auth) {
      return;
    }

    response.json(
      buildMetadataDiff(
        auth.state,
        getParam(request.params.slug),
        request.body.base ?? {},
        request.body.compare ?? {}
      )
    );
  })
);

if (existsSync(publicDir)) {
  app.use(express.static(publicDir));

  app.use((request, response, next) => {
    if (request.path.startsWith("/api/")) {
      next();
      return;
    }

    response.sendFile(path.join(publicDir, "index.html"));
  });
}

app.use(
  (
    error: unknown,
    _request: Request,
    response: Response,
    _next: NextFunction
  ) => {
    const message =
      error instanceof Error ? error.message : "Unexpected server error.";
    response.status(400).json({ error: message });
  }
);

const port = Number(process.env.PORT ?? 3001);
await db.init();

app.listen(port, () => {
  console.log(`TraitForge server listening on http://localhost:${port}`);
});
