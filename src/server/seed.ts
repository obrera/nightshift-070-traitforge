import { buildMplCoreMetadata } from "../shared/mpl.js";
import type {
  ActivityRecord,
  AppState,
  AssetRecord,
  CollectionSchema,
  DraftRecord,
  UserRecord
} from "../shared/contracts.js";
import { composeDraft, quoteDraft } from "./logic.js";
import { hashPassword } from "./utils.js";

function buildCollection(): CollectionSchema {
  return {
    slug: "relay-operators",
    name: "Relay Operators",
    symbol: "RLY070",
    description:
      "A server-authored MPL Core collection of night-market transmitters, aura rigs, and field companions.",
    themeNote: "Wizard-tuned collectibles with caps, conflicts, and rarity pressure.",
    collectionKey: "relay_ops_070",
    targetSupply: 128,
    mintedCount: 0,
    defaultTraitSelection: {
      backdrop: "abyss-bloom",
      core: "alloy-husk",
      aura: "quiet-halo",
      sigil: "trace-knot",
      companion: "ember-finch"
    },
    slots: [
      {
        id: "backdrop",
        label: "Backdrop",
        description: "Signal field and scene atmosphere.",
        required: true,
        values: [
          {
            id: "abyss-bloom",
            label: "Abyss Bloom",
            description: "Low-noise bloom with cool telemetry scatter.",
            rarityWeight: 4.2,
            supplyCap: 36,
            preview: {
              fill: "#091321",
              accent: "#3edaff",
              shape: "grid",
              pattern: "dots",
              label: "Abyss Bloom"
            }
          },
          {
            id: "rust-grid",
            label: "Rust Grid",
            description: "Copper-fleck lattice for mechanical silhouettes.",
            rarityWeight: 3.6,
            supplyCap: 28,
            preview: {
              fill: "#221112",
              accent: "#ff8c57",
              shape: "grid",
              pattern: "lattice",
              label: "Rust Grid"
            }
          },
          {
            id: "monsoon-terminal",
            label: "Monsoon Terminal",
            description: "Wet scanlines and dense harbor lumens.",
            rarityWeight: 2.5,
            supplyCap: 22,
            preview: {
              fill: "#0b2230",
              accent: "#83ffe4",
              shape: "grid",
              pattern: "scanlines",
              label: "Monsoon Terminal"
            }
          },
          {
            id: "sunline-vault",
            label: "Sunline Vault",
            description: "Burnt-gold freight corridor for rare silhouettes.",
            rarityWeight: 1.3,
            supplyCap: 12,
            preview: {
              fill: "#37210b",
              accent: "#ffcb6a",
              shape: "grid",
              pattern: "pulse",
              label: "Sunline Vault"
            }
          }
        ]
      },
      {
        id: "core",
        label: "Core",
        description: "Primary body shell for the collectible.",
        required: true,
        values: [
          {
            id: "alloy-husk",
            label: "Alloy Husk",
            description: "Heavy relay shell with broad readability.",
            rarityWeight: 4.1,
            supplyCap: 34,
            preview: {
              fill: "#9ec6d9",
              accent: "#d5f3ff",
              shape: "shard",
              pattern: "noise",
              label: "Alloy Husk"
            }
          },
          {
            id: "glass-vector",
            label: "Glass Vector",
            description: "Prismatic frame with clean contour edges.",
            rarityWeight: 2.8,
            supplyCap: 22,
            preview: {
              fill: "#45b8ff",
              accent: "#baf6ff",
              shape: "shard",
              pattern: "scanlines",
              label: "Glass Vector"
            },
            conflicts: [
              {
                slotId: "backdrop",
                valueId: "rust-grid",
                reason: "Rust Grid overpowers the Glass Vector contour read."
              }
            ]
          },
          {
            id: "echo-silk",
            label: "Echo Silk",
            description: "Thin membrane body with soft iridescent motion.",
            rarityWeight: 2.1,
            supplyCap: 18,
            preview: {
              fill: "#d54e8d",
              accent: "#ffc6df",
              shape: "shard",
              pattern: "pulse",
              label: "Echo Silk"
            },
            conflicts: [
              {
                slotId: "companion",
                valueId: "audit-drone",
                reason: "Audit Drone interferes with the Echo Silk signal mesh."
              }
            ]
          },
          {
            id: "null-prism",
            label: "Null Prism",
            description: "Collapsed light body reserved for high-rarity builds.",
            rarityWeight: 1.1,
            supplyCap: 8,
            preview: {
              fill: "#c8d3de",
              accent: "#f7fafc",
              shape: "shard",
              pattern: "dots",
              label: "Null Prism"
            },
            conflicts: [
              {
                slotId: "backdrop",
                valueId: "sunline-vault",
                reason: "Sunline glare collapses the Null Prism silhouette."
              }
            ]
          }
        ]
      },
      {
        id: "aura",
        label: "Aura",
        description: "Energy field and ring layer.",
        required: true,
        values: [
          {
            id: "quiet-halo",
            label: "Quiet Halo",
            description: "Low-noise ring with clean inspection contrast.",
            rarityWeight: 3.8,
            supplyCap: 32,
            preview: {
              fill: "#1c2f47",
              accent: "#75d8ff",
              shape: "ring",
              pattern: "pulse",
              label: "Quiet Halo"
            },
            conflicts: [
              {
                slotId: "sigil",
                valueId: "debt-glyph",
                reason: "Debt Glyph injects visual debt into Quiet Halo's clean read."
              }
            ]
          },
          {
            id: "overclock-static",
            label: "Overclock Static",
            description: "High-frequency ring with electric chatter.",
            rarityWeight: 2.7,
            supplyCap: 22,
            preview: {
              fill: "#163941",
              accent: "#56ffe0",
              shape: "ring",
              pattern: "scanlines",
              label: "Overclock Static"
            }
          },
          {
            id: "monsoon-loop",
            label: "Monsoon Loop",
            description: "Deep tide loop with reflective transit haze.",
            rarityWeight: 2.2,
            supplyCap: 18,
            preview: {
              fill: "#0d4650",
              accent: "#8df8ff",
              shape: "ring",
              pattern: "lattice",
              label: "Monsoon Loop"
            }
          },
          {
            id: "crown-of-pins",
            label: "Crown of Pins",
            description: "Needle halo reserved for top-end combinations.",
            rarityWeight: 1.2,
            supplyCap: 8,
            preview: {
              fill: "#3e1c19",
              accent: "#ffd58c",
              shape: "ring",
              pattern: "dots",
              label: "Crown of Pins"
            },
            conflicts: [
              {
                slotId: "companion",
                valueId: "proxy-moss",
                reason: "Proxy Moss diffuses Crown of Pins into unreadable foliage."
              }
            ]
          }
        ]
      },
      {
        id: "sigil",
        label: "Sigil",
        description: "Front-plane operator signature.",
        required: true,
        values: [
          {
            id: "trace-knot",
            label: "Trace Knot",
            description: "Anchored path knot for stable operators.",
            rarityWeight: 4.0,
            supplyCap: 36,
            preview: {
              fill: "#11304f",
              accent: "#7bc9ff",
              shape: "sigil",
              pattern: "lattice",
              label: "Trace Knot"
            }
          },
          {
            id: "pulse-rune",
            label: "Pulse Rune",
            description: "Accelerated rune with strong mid-tier pull.",
            rarityWeight: 3.0,
            supplyCap: 24,
            preview: {
              fill: "#183238",
              accent: "#78ffe1",
              shape: "sigil",
              pattern: "pulse",
              label: "Pulse Rune"
            }
          },
          {
            id: "archive-seal",
            label: "Archive Seal",
            description: "Stamped seal from the relay archive floor.",
            rarityWeight: 1.9,
            supplyCap: 14,
            preview: {
              fill: "#40271a",
              accent: "#ffcf93",
              shape: "sigil",
              pattern: "scanlines",
              label: "Archive Seal"
            }
          },
          {
            id: "debt-glyph",
            label: "Debt Glyph",
            description: "Severe glyph for narrow legendary combinations.",
            rarityWeight: 1.0,
            supplyCap: 6,
            preview: {
              fill: "#301713",
              accent: "#ff9680",
              shape: "sigil",
              pattern: "dots",
              label: "Debt Glyph"
            },
            conflicts: [
              {
                slotId: "aura",
                valueId: "quiet-halo",
                reason: "Quiet Halo cannot carry the Debt Glyph without visual clipping."
              }
            ]
          }
        ]
      },
      {
        id: "companion",
        label: "Companion",
        description: "Secondary orbiting entity.",
        required: true,
        values: [
          {
            id: "audit-drone",
            label: "Audit Drone",
            description: "Strict inspector companion with bright telemetry.",
            rarityWeight: 2.7,
            supplyCap: 16,
            preview: {
              fill: "#143554",
              accent: "#88d3ff",
              shape: "companion",
              pattern: "scanlines",
              label: "Audit Drone"
            },
            conflicts: [
              {
                slotId: "core",
                valueId: "echo-silk",
                reason: "Audit Drone causes turbulence against Echo Silk."
              }
            ]
          },
          {
            id: "ember-finch",
            label: "Ember Finch",
            description: "Warm relay bird for balanced silhouettes.",
            rarityWeight: 3.9,
            supplyCap: 28,
            preview: {
              fill: "#432014",
              accent: "#ffb16a",
              shape: "companion",
              pattern: "dots",
              label: "Ember Finch"
            }
          },
          {
            id: "proxy-moss",
            label: "Proxy Moss",
            description: "Low-hover organic proxy with rare spread.",
            rarityWeight: 1.7,
            supplyCap: 10,
            preview: {
              fill: "#143227",
              accent: "#8af2a4",
              shape: "companion",
              pattern: "lattice",
              label: "Proxy Moss"
            },
            conflicts: [
              {
                slotId: "aura",
                valueId: "crown-of-pins",
                reason: "Proxy Moss swallows the Crown of Pins halo edge."
              }
            ]
          },
          {
            id: "no-companion",
            label: "No Companion",
            description: "Empty orbit for stripped-down operator silhouettes.",
            rarityWeight: 4.6,
            supplyCap: 48,
            preview: {
              fill: "#091119",
              accent: "#4b6172",
              shape: "companion",
              pattern: "noise",
              label: "No Companion"
            }
          }
        ]
      }
    ]
  };
}

function buildUsers(): UserRecord[] {
  return [
    {
      id: "user_obrera",
      username: "obrera",
      displayName: "Obrera",
      role: "operator",
      passwordHash: hashPassword("nightshift070!"),
      createdAt: "2026-04-27T00:10:00Z"
    },
    {
      id: "user_pilot",
      username: "pilot",
      displayName: "Pilot North",
      role: "creator",
      passwordHash: hashPassword("pilotpass!"),
      createdAt: "2026-04-27T00:16:00Z"
    },
    {
      id: "user_marina",
      username: "marina",
      displayName: "Marina Vale",
      role: "creator",
      passwordHash: hashPassword("relaypass!"),
      createdAt: "2026-04-27T00:18:00Z"
    }
  ];
}

function activity(
  id: string,
  actorUserId: string,
  actorDisplayName: string,
  kind: ActivityRecord["kind"],
  scope: string,
  message: string,
  createdAt: string
): ActivityRecord {
  return {
    id,
    actorUserId,
    actorDisplayName,
    kind,
    scope,
    message,
    createdAt
  };
}

export function createSeedState(): AppState {
  const collection = buildCollection();
  const users = buildUsers();
  const baseState: AppState = {
    version: 2,
    users,
    sessions: [],
    collections: [collection],
    drafts: [],
    assets: [],
    mints: [],
    activity: []
  };

  const obreraDraftComposition = quoteDraft(
    baseState,
    collection.slug,
    {
      backdrop: "abyss-bloom",
      core: "null-prism",
      aura: "overclock-static",
      sigil: "debt-glyph",
      companion: "proxy-moss"
    },
    "Inspection Bloom"
  );
  const obreraPreviewAsset: AssetRecord = {
    id: "asset_draft_inspection_bloom",
    requesterUserId: "user_obrera",
    collectionSlug: collection.slug,
    previewSvg: obreraDraftComposition.preview.svg,
    metadata: buildMplCoreMetadata(obreraDraftComposition.preview.metadataInput),
    createdAt: "2026-04-27T00:41:00Z",
    sourceDraftId: "draft_inspection_bloom"
  };
  const obreraDraft: DraftRecord = {
    id: "draft_inspection_bloom",
    shareId: "inspection-bloom",
    title: "Inspection Bloom",
    userId: "user_obrera",
    collectionSlug: collection.slug,
    selections: obreraDraftComposition.selections,
    rarity: obreraDraftComposition.rarity,
    conflicts: obreraDraftComposition.conflicts,
    previewAssetId: obreraPreviewAsset.id,
    lastQuote: obreraDraftComposition.quote,
    createdAt: "2026-04-27T00:41:00Z",
    updatedAt: "2026-04-27T00:43:00Z"
  };

  const pilotDraftComposition = quoteDraft(
    baseState,
    collection.slug,
    {
      backdrop: "sunline-vault",
      core: "null-prism",
      aura: "quiet-halo",
      sigil: "trace-knot",
      companion: "audit-drone"
    },
    "Sunline Audit"
  );
  const pilotPreviewAsset: AssetRecord = {
    id: "asset_draft_sunline_audit",
    requesterUserId: "user_pilot",
    collectionSlug: collection.slug,
    previewSvg: pilotDraftComposition.preview.svg,
    metadata: buildMplCoreMetadata(pilotDraftComposition.preview.metadataInput),
    createdAt: "2026-04-27T00:46:00Z",
    sourceDraftId: "draft_sunline_audit"
  };
  const pilotDraft: DraftRecord = {
    id: "draft_sunline_audit",
    shareId: "sunline-audit",
    title: "Sunline Audit",
    userId: "user_pilot",
    collectionSlug: collection.slug,
    selections: pilotDraftComposition.selections,
    rarity: pilotDraftComposition.rarity,
    conflicts: pilotDraftComposition.conflicts,
    previewAssetId: pilotPreviewAsset.id,
    lastQuote: pilotDraftComposition.quote,
    createdAt: "2026-04-27T00:46:00Z",
    updatedAt: "2026-04-27T00:47:00Z"
  };

  const activityFeed = [
    activity(
      "activity_1",
      "user_obrera",
      "Obrera",
      "operator",
      "Schema Lab",
      "Adjusted Crown of Pins cap from 10 to 8 and tightened Debt Glyph to 6.",
      "2026-04-27T00:24:00Z"
    ),
    activity(
      "activity_2",
      "user_obrera",
      "Obrera",
      "operator",
      "Collection Publish",
      "Published Relay Operators schema with five trait slots and live conflict guards.",
      "2026-04-27T00:29:00Z"
    ),
    activity(
      "activity_4",
      "user_obrera",
      "Obrera",
      "operator",
      "Metadata Diff",
      "Reviewed Inspection Bloom against Sunline Audit to confirm sigil drift.",
      "2026-04-27T00:43:30Z"
    ),
    activity(
      "activity_5",
      "user_pilot",
      "Pilot North",
      "creator",
      "Draft Save",
      "Saved Sunline Audit with a known Null Prism conflict for later cleanup.",
      "2026-04-27T00:47:00Z"
    )
  ];

  return {
    ...baseState,
    drafts: [obreraDraft, pilotDraft],
    assets: [obreraPreviewAsset, pilotPreviewAsset],
    mints: [],
    activity: activityFeed
  };
}
