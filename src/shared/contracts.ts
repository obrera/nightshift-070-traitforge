import type {
  MintQuote,
  MplCoreMetadata,
  MplCoreMetadataInput
} from "@obrera/mpl-core-kit-lib";

export type UserRole = "operator" | "creator";

export interface UserRecord {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  passwordHash: string;
  createdAt: string;
}

export interface UserSummary {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
}

export interface SessionRecord {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export interface TraitConflict {
  slotId: string;
  valueId: string;
  reason: string;
}

export interface TraitPreviewLayer {
  fill: string;
  accent: string;
  shape: "grid" | "orb" | "shard" | "ring" | "sigil" | "companion";
  pattern: "dots" | "scanlines" | "lattice" | "pulse" | "noise";
  label: string;
}

export interface TraitValueDefinition {
  id: string;
  label: string;
  description: string;
  rarityWeight: number;
  supplyCap: number;
  preview: TraitPreviewLayer;
  conflicts?: TraitConflict[];
}

export interface TraitSlotDefinition {
  id: string;
  label: string;
  description: string;
  required: boolean;
  values: TraitValueDefinition[];
}

export interface CollectionSchema {
  slug: string;
  name: string;
  symbol: string;
  description: string;
  themeNote: string;
  collectionKey: string;
  targetSupply: number;
  mintedCount: number;
  defaultTraitSelection: TraitSelection;
  slots: TraitSlotDefinition[];
}

export type TraitSelection = Record<string, string>;

export interface ConflictHit {
  slotId: string;
  slotLabel: string;
  valueId: string;
  valueLabel: string;
  reason: string;
}

export interface TraitUsageStat {
  slotId: string;
  slotLabel: string;
  valueId: string;
  valueLabel: string;
  used: number;
  cap: number;
  remaining: number;
}

export interface RarityBucket {
  label: string;
  count: number;
}

export interface RarityReport {
  score: number;
  percentile: number;
  label: "Common" | "Rare" | "Epic" | "Legendary";
  breakdown: Array<{
    slotId: string;
    slotLabel: string;
    valueId: string;
    valueLabel: string;
    rarityWeight: number;
    capPressure: number;
    contribution: number;
  }>;
}

export interface PreviewArtifact {
  svg: string;
  dataUri: string;
  metadataInput: MplCoreMetadataInput;
}

export interface DraftRecord {
  id: string;
  shareId: string;
  title: string;
  userId: string;
  collectionSlug: string;
  selections: TraitSelection;
  rarity: RarityReport;
  conflicts: ConflictHit[];
  previewAssetId?: string;
  lastQuote?: MintQuote;
  createdAt: string;
  updatedAt: string;
}

export interface AssetRecord {
  id: string;
  ownerUserId: string;
  collectionSlug: string;
  previewSvg: string;
  metadata: MplCoreMetadata;
  createdAt: string;
  sourceDraftId?: string;
  mintIntentId?: string;
}

export interface MintIntentRecord {
  id: string;
  userId: string;
  collectionSlug: string;
  draftId?: string;
  assetId: string;
  quote: MintQuote;
  simulatedAddress: string;
  status: "quoted" | "minted";
  createdAt: string;
}

export interface ActivityRecord {
  id: string;
  actorUserId: string;
  actorDisplayName: string;
  kind: "operator" | "creator" | "mint";
  scope: string;
  message: string;
  createdAt: string;
}

export interface AppState {
  version: number;
  users: UserRecord[];
  sessions: SessionRecord[];
  collections: CollectionSchema[];
  drafts: DraftRecord[];
  assets: AssetRecord[];
  mintIntents: MintIntentRecord[];
  activity: ActivityRecord[];
}

export interface AuthSession {
  user: UserSummary | null;
}

export interface CollectionSchemaResponse {
  collection: CollectionSchema;
  usage: TraitUsageStat[];
}

export interface RenderDraftRequest {
  collectionSlug: string;
  selections: TraitSelection;
  name?: string;
}

export interface RenderDraftResponse {
  selections: TraitSelection;
  preview: PreviewArtifact;
  rarity: RarityReport;
  conflicts: ConflictHit[];
  usage: TraitUsageStat[];
}

export interface MintQuoteRequest extends RenderDraftRequest {}

export interface MintQuoteResponse extends RenderDraftResponse {
  quote: MintQuote;
  warnings: string[];
}

export interface CreateMintRequest extends RenderDraftRequest {
  draftId?: string;
}

export interface CreateMintResponse {
  mintIntent: MintIntentRecord;
  asset: AssetRecord;
}

export interface SaveDraftRequest extends RenderDraftRequest {
  draftId?: string;
  title: string;
}

export interface SaveDraftResponse {
  draft: DraftRecord;
}

export interface DraftViewResponse {
  draft: DraftRecord;
  asset?: AssetRecord;
}

export interface MetadataDiffRequest {
  collectionSlug: string;
  base: TraitSelection;
  compare: TraitSelection;
}

export interface MetadataDiffResponse {
  baseMetadata: MplCoreMetadata;
  compareMetadata: MplCoreMetadata;
  changedAttributes: Array<{
    slotId: string;
    trait: string;
    before: string;
    after: string;
  }>;
}

export interface AdminSchemaUpdateRequest {
  collection: CollectionSchema;
}

export interface AnalyticsResponse {
  rarityBuckets: RarityBucket[];
  usage: TraitUsageStat[];
  recentMintIntents: MintIntentRecord[];
}

export interface DashboardResponse {
  session: AuthSession;
  collections: CollectionSchema[];
  drafts: DraftRecord[];
  mintIntents: MintIntentRecord[];
  activity: ActivityRecord[];
}

export interface AuthRequest {
  username: string;
  password: string;
  displayName?: string;
}
