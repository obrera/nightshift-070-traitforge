const LAMPORTS_PER_SOL = 1_000_000_000;

export function lamportsToSol(lamports) {
  return Number((lamports / LAMPORTS_PER_SOL).toFixed(4));
}

export function solToLamports(sol) {
  return Math.round(sol * LAMPORTS_PER_SOL);
}

export function normalizeAttribute(slot, value, rarityWeight, supplyCap) {
  return {
    trait_type: slot,
    value,
    rarityWeight,
    supplyCap
  };
}

export function buildMplCoreMetadata(input) {
  const attributes = input.attributes.map((attribute) =>
    normalizeAttribute(
      attribute.trait_type,
      attribute.value,
      attribute.rarityWeight ?? 1,
      attribute.supplyCap ?? null
    )
  );

  return {
    name: input.name,
    symbol: input.symbol,
    description: input.description,
    image: input.image,
    external_url: input.external_url,
    attributes,
    properties: {
      category: "image",
      files: [
        {
          uri: input.image,
          type: "image/svg+xml"
        }
      ]
    },
    collection: {
      name: input.collection.name,
      family: input.collection.family,
      key: input.collection.key
    }
  };
}

export function createMintQuote({ collectionSlug, rarityScore, traitCount }) {
  const baseLamports = 19000000;
  const rarityPremium = Math.round(rarityScore * 1400000);
  const traitLoad = traitCount * 1800000;
  const lamports = baseLamports + rarityPremium + traitLoad;
  return {
    collectionSlug,
    lamports,
    sol: lamportsToSol(lamports),
    breakdown: [
      { label: "MPL Core asset account", lamports: 11000000 },
      { label: "Metadata render", lamports: 5000000 },
      { label: "Rarity premium", lamports: rarityPremium },
      { label: "Trait layering", lamports: traitLoad }
    ]
  };
}

export function createSimulatedMintAddress(seed) {
  const hash = Array.from(seed).reduce((acc, char, index) => {
    return (acc + char.charCodeAt(0) * (index + 17)) % 0xffffffff;
  }, 0);
  return `TFG${hash.toString(16).padStart(8, "0").toUpperCase()}DEVNET`;
}
