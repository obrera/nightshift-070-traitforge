import type {
  ActivityRecord,
  AppState,
  AssetRecord,
  CollectionSchema,
  DraftRecord,
  MintRecord,
  SessionRecord,
  UserRecord
} from "../shared/contracts.js";
import { createSeedState } from "./seed.js";

type LegacyAssetRecord = AssetRecord & {
  mintIntentId?: string;
  ownerUserId?: string;
};

type LegacyMintRecord = Partial<MintRecord> & {
  simulatedAddress?: string;
};

type LegacyAppState = {
  version?: number;
  users?: UserRecord[];
  sessions?: SessionRecord[];
  collections?: CollectionSchema[];
  drafts?: DraftRecord[];
  assets?: LegacyAssetRecord[];
  mints?: MintRecord[];
  mintIntents?: LegacyMintRecord[];
  activity?: ActivityRecord[];
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRealMintRecord(record: LegacyMintRecord): record is MintRecord {
  return (
    record.status === "minted" &&
    typeof record.assetAddress === "string" &&
    typeof record.signature === "string" &&
    typeof record.collectionAddress === "string" &&
    typeof record.recipientOwnerAddress === "string" &&
    typeof record.assetId === "string" &&
    typeof record.collectionSlug === "string" &&
    typeof record.userId === "string" &&
    typeof record.createdAt === "string" &&
    record.cluster === "devnet" &&
    !!record.explorerUrls &&
    typeof record.metadataUrl === "string" &&
    typeof record.imageUrl === "string"
  );
}

function migrateLegacyState(state: LegacyAppState): AppState {
  const migratedMints = (state.mints ?? state.mintIntents ?? []).filter(
    isRealMintRecord
  );
  const mintIds = new Set(migratedMints.map((entry) => entry.id));

  const assets = (state.assets ?? [])
    .filter((asset) => {
      const mintId = asset.mintId ?? asset.mintIntentId;
      return !mintId || mintIds.has(mintId);
    })
    .map<AssetRecord>((asset) => ({
      id: asset.id,
      requesterUserId: asset.requesterUserId ?? asset.ownerUserId ?? "",
      collectionSlug: asset.collectionSlug,
      previewSvg: asset.previewSvg,
      metadata: asset.metadata,
      createdAt: asset.createdAt,
      recipientOwnerAddress: asset.recipientOwnerAddress,
      onChainAddress: asset.onChainAddress,
      metadataUrl: asset.metadataUrl,
      imageUrl: asset.imageUrl,
      sourceDraftId: asset.sourceDraftId,
      mintId: asset.mintId && mintIds.has(asset.mintId) ? asset.mintId : undefined
    }));

  const activity = (state.activity ?? []).filter((entry) => {
    const scope = entry.scope.toLowerCase();
    const message = entry.message.toLowerCase();
    return !scope.includes("simulator") && !message.includes("simulated");
  });

  return {
    version: 2,
    users: state.users ?? createSeedState().users,
    sessions: state.sessions ?? [],
    collections: (state.collections ?? createSeedState().collections).map(
      (collection) => ({
        ...collection,
        devnetCollection: collection.devnetCollection
      })
    ),
    drafts: state.drafts ?? [],
    assets,
    mints: migratedMints,
    activity
  };
}

export function normalizeState(raw: unknown): AppState {
  if (!isObject(raw)) {
    return createSeedState();
  }

  return migrateLegacyState(raw as LegacyAppState);
}
