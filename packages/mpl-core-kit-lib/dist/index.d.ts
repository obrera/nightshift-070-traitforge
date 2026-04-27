export interface MplCoreAttribute {
  trait_type: string;
  value: string;
  rarityWeight?: number;
  supplyCap?: number | null;
}

export interface MplCoreCollectionRef {
  name: string;
  family: string;
  key: string;
}

export interface MplCoreMetadataInput {
  name: string;
  symbol: string;
  description: string;
  image: string;
  external_url?: string;
  collection: MplCoreCollectionRef;
  attributes: MplCoreAttribute[];
}

export interface MplCoreMetadata {
  name: string;
  symbol: string;
  description: string;
  image: string;
  external_url?: string;
  attributes: Array<Required<MplCoreAttribute>>;
  properties: {
    category: "image";
    files: Array<{
      uri: string;
      type: string;
    }>;
  };
  collection: MplCoreCollectionRef;
}

export interface MintQuoteBreakdown {
  label: string;
  lamports: number;
}

export interface MintQuote {
  collectionSlug: string;
  lamports: number;
  sol: number;
  breakdown: MintQuoteBreakdown[];
}

export declare function lamportsToSol(lamports: number): number;
export declare function solToLamports(sol: number): number;
export declare function normalizeAttribute(
  slot: string,
  value: string,
  rarityWeight?: number,
  supplyCap?: number | null
): Required<MplCoreAttribute>;
export declare function buildMplCoreMetadata(
  input: MplCoreMetadataInput
): MplCoreMetadata;
export declare function createMintQuote(input: {
  collectionSlug: string;
  rarityScore: number;
  traitCount: number;
}): MintQuote;
export declare function createSimulatedMintAddress(seed: string): string;
