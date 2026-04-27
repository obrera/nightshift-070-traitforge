import {
  buildMplCoreMetadata,
  createMintQuote
} from "@obrera/mpl-core-kit-lib";
import type {
  AppState,
  CollectionSchema,
  ConflictHit,
  MetadataDiffResponse,
  MintQuoteResponse,
  PreviewArtifact,
  RarityReport,
  TraitSelection,
  TraitSlotDefinition,
  TraitUsageStat,
  TraitValueDefinition
} from "../shared/contracts.js";
import { clamp } from "./utils.js";

interface DraftComposition {
  selections: TraitSelection;
  preview: PreviewArtifact;
  rarity: RarityReport;
  conflicts: ConflictHit[];
  usage: TraitUsageStat[];
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function percentEncodeSvg(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export function listCollections(state: AppState): CollectionSchema[] {
  return state.collections.map((collection) => hydrateCollection(state, collection));
}

export function hydrateCollection(
  state: AppState,
  collection: CollectionSchema
): CollectionSchema {
  const mintedCount = state.assets.filter(
    (asset) => asset.collectionSlug === collection.slug && asset.mintIntentId
  ).length;

  return {
    ...collection,
    mintedCount
  };
}

export function getCollectionBySlug(
  state: AppState,
  slug: string
): CollectionSchema {
  const collection = state.collections.find((entry) => entry.slug === slug);
  if (!collection) {
    throw new Error(`Unknown collection: ${slug}`);
  }

  return hydrateCollection(state, collection);
}

function getSlot(collection: CollectionSchema, slotId: string): TraitSlotDefinition {
  const slot = collection.slots.find((entry) => entry.id === slotId);
  if (!slot) {
    throw new Error(`Unknown trait slot: ${slotId}`);
  }
  return slot;
}

function getValue(
  collection: CollectionSchema,
  slotId: string,
  valueId: string
): TraitValueDefinition {
  const slot = getSlot(collection, slotId);
  const value = slot.values.find((entry) => entry.id === valueId);
  if (!value) {
    throw new Error(`Unknown value ${valueId} for slot ${slotId}`);
  }
  return value;
}

export function normalizeSelections(
  collection: CollectionSchema,
  raw: TraitSelection
): TraitSelection {
  const selections: TraitSelection = {};

  for (const slot of collection.slots) {
    const candidate =
      raw[slot.id] ??
      collection.defaultTraitSelection[slot.id] ??
      slot.values[0]?.id;

    if (!candidate) {
      if (slot.required) {
        throw new Error(`Slot ${slot.label} has no selectable value.`);
      }
      continue;
    }

    const value = slot.values.find((entry) => entry.id === candidate);
    if (!value) {
      throw new Error(`Invalid selection for ${slot.label}.`);
    }

    selections[slot.id] = value.id;
  }

  return selections;
}

export function computeUsageStats(
  state: AppState,
  collection: CollectionSchema
): TraitUsageStat[] {
  const mintedAssets = state.assets.filter(
    (asset) => asset.collectionSlug === collection.slug && asset.mintIntentId
  );
  const usageMap = new Map<string, number>();

  for (const asset of mintedAssets) {
    for (const attribute of asset.metadata.attributes) {
      const key = `${attribute.trait_type}:${attribute.value}`;
      usageMap.set(key, (usageMap.get(key) ?? 0) + 1);
    }
  }

  return collection.slots.flatMap((slot) =>
    slot.values.map((value) => {
      const used = usageMap.get(`${slot.label}:${value.label}`) ?? 0;
      return {
        slotId: slot.id,
        slotLabel: slot.label,
        valueId: value.id,
        valueLabel: value.label,
        used,
        cap: value.supplyCap,
        remaining: Math.max(0, value.supplyCap - used)
      };
    })
  );
}

export function detectConflicts(
  collection: CollectionSchema,
  selections: TraitSelection
): ConflictHit[] {
  const hits: ConflictHit[] = [];
  const seen = new Set<string>();

  for (const slot of collection.slots) {
    const valueId = selections[slot.id];
    if (!valueId) {
      continue;
    }

    const value = getValue(collection, slot.id, valueId);
    for (const conflict of value.conflicts ?? []) {
      if (selections[conflict.slotId] !== conflict.valueId) {
        continue;
      }

      const key = [slot.id, value.id, conflict.slotId, conflict.valueId]
        .sort()
        .join(":");

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      hits.push({
        slotId: slot.id,
        slotLabel: slot.label,
        valueId: value.id,
        valueLabel: value.label,
        reason: conflict.reason
      });
    }
  }

  return hits;
}

export function computeRarity(
  state: AppState,
  collection: CollectionSchema,
  selections: TraitSelection
): RarityReport {
  const usage = computeUsageStats(state, collection);
  const usageMap = new Map(
    usage.map((entry) => [`${entry.slotId}:${entry.valueId}`, entry])
  );

  const breakdown = collection.slots.map((slot) => {
    const selectedValue = getValue(collection, slot.id, selections[slot.id]);
    const totalWeight = slot.values.reduce(
      (sum, value) => sum + value.rarityWeight,
      0
    );
    const probability = selectedValue.rarityWeight / totalWeight;
    const usageEntry = usageMap.get(`${slot.id}:${selectedValue.id}`);
    const capPressure =
      usageEntry && usageEntry.cap > 0 ? usageEntry.used / usageEntry.cap : 0;
    const contribution = -Math.log(probability) * 10 * (1 + capPressure);

    return {
      slotId: slot.id,
      slotLabel: slot.label,
      valueId: selectedValue.id,
      valueLabel: selectedValue.label,
      rarityWeight: selectedValue.rarityWeight,
      capPressure: Number(capPressure.toFixed(2)),
      contribution: Number(contribution.toFixed(2))
    };
  });

  const minScore = collection.slots.reduce((sum, slot) => {
    const maxWeight = Math.max(...slot.values.map((value) => value.rarityWeight));
    const totalWeight = slot.values.reduce(
      (accumulator, value) => accumulator + value.rarityWeight,
      0
    );
    return sum + -Math.log(maxWeight / totalWeight) * 10;
  }, 0);

  const maxScore = collection.slots.reduce((sum, slot) => {
    const minWeight = Math.min(...slot.values.map((value) => value.rarityWeight));
    const totalWeight = slot.values.reduce(
      (accumulator, value) => accumulator + value.rarityWeight,
      0
    );
    return sum + -Math.log(minWeight / totalWeight) * 10;
  }, 0);

  const score = breakdown.reduce((sum, entry) => sum + entry.contribution, 0);
  const percentile = Math.round(
    clamp(((score - minScore) / Math.max(1, maxScore - minScore)) * 100, 0, 99)
  );

  let label: RarityReport["label"] = "Common";
  if (percentile >= 80) {
    label = "Legendary";
  } else if (percentile >= 60) {
    label = "Epic";
  } else if (percentile >= 35) {
    label = "Rare";
  }

  return {
    score: Number(score.toFixed(2)),
    percentile,
    label,
    breakdown
  };
}

function renderPattern(layerId: string, fill: string, accent: string, pattern: string) {
  switch (pattern) {
    case "dots":
      return `<pattern id="${layerId}" width="28" height="28" patternUnits="userSpaceOnUse"><rect width="28" height="28" fill="${fill}" opacity="0.16"/><circle cx="8" cy="8" r="2" fill="${accent}" opacity="0.8"/><circle cx="18" cy="20" r="1.5" fill="${accent}" opacity="0.6"/></pattern>`;
    case "scanlines":
      return `<pattern id="${layerId}" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="${fill}" opacity="0.14"/><path d="M0 4h16M0 12h16" stroke="${accent}" stroke-width="1" opacity="0.55"/></pattern>`;
    case "lattice":
      return `<pattern id="${layerId}" width="26" height="26" patternUnits="userSpaceOnUse"><rect width="26" height="26" fill="${fill}" opacity="0.12"/><path d="M0 13h26M13 0v26M0 0l26 26M26 0L0 26" stroke="${accent}" stroke-width="0.8" opacity="0.45"/></pattern>`;
    case "pulse":
      return `<pattern id="${layerId}" width="32" height="32" patternUnits="userSpaceOnUse"><rect width="32" height="32" fill="${fill}" opacity="0.12"/><circle cx="16" cy="16" r="7" stroke="${accent}" stroke-width="1.2" fill="none" opacity="0.65"/><circle cx="16" cy="16" r="13" stroke="${accent}" stroke-width="0.6" fill="none" opacity="0.4"/></pattern>`;
    default:
      return `<pattern id="${layerId}" width="22" height="22" patternUnits="userSpaceOnUse"><rect width="22" height="22" fill="${fill}" opacity="0.1"/><path d="M0 22L22 0" stroke="${accent}" stroke-width="1" opacity="0.4"/></pattern>`;
  }
}

function renderShape(
  layer: TraitValueDefinition["preview"],
  patternId: string,
  index: number
): string {
  const xShift = index * 8;
  switch (layer.shape) {
    case "grid":
      return `<rect x="${110 + xShift}" y="120" width="680" height="960" rx="48" fill="url(#${patternId})" stroke="${layer.accent}" stroke-width="2.5" opacity="0.92"/>`;
    case "orb":
      return `<circle cx="450" cy="${510 + index * 12}" r="${190 - index * 10}" fill="${layer.fill}" opacity="0.24"/><circle cx="450" cy="${510 + index * 12}" r="${162 - index * 10}" fill="url(#${patternId})" stroke="${layer.accent}" stroke-width="3" opacity="0.88"/>`;
    case "shard":
      return `<path d="M450 180L620 ${330 + index * 10}L560 910L350 1020L230 410Z" fill="${layer.fill}" opacity="0.22"/><path d="M450 180L620 ${330 + index * 10}L560 910L350 1020L230 410Z" fill="url(#${patternId})" stroke="${layer.accent}" stroke-width="3" opacity="0.9"/>`;
    case "ring":
      return `<circle cx="450" cy="540" r="${248 - index * 8}" fill="none" stroke="${layer.accent}" stroke-width="16" opacity="0.24"/><circle cx="450" cy="540" r="${214 - index * 8}" fill="none" stroke="url(#${patternId})" stroke-width="38" opacity="0.68"/>`;
    case "sigil":
      return `<path d="M450 285L525 420L680 438L565 548L598 705L450 628L302 705L335 548L220 438L375 420Z" fill="url(#${patternId})" stroke="${layer.accent}" stroke-width="3.5" opacity="0.85"/>`;
    case "companion":
      return `<g opacity="0.92"><circle cx="654" cy="334" r="66" fill="${layer.fill}" opacity="0.22"/><circle cx="654" cy="334" r="54" fill="url(#${patternId})" stroke="${layer.accent}" stroke-width="3"/><path d="M614 335h80M654 295v80" stroke="${layer.accent}" stroke-width="2.5" opacity="0.75"/></g>`;
  }
}

export function renderPreview(
  collection: CollectionSchema,
  selections: TraitSelection,
  name = collection.name
): PreviewArtifact {
  const layers = collection.slots.map((slot) =>
    getValue(collection, slot.id, selections[slot.id])
  );
  const background = layers[0]?.preview ?? {
    fill: "#111827",
    accent: "#39d0ff",
    pattern: "dots",
    shape: "grid",
    label: "Fallback"
  };

  const defs = layers
    .map((value, index) =>
      renderPattern(`pattern-${index}`, value.preview.fill, value.preview.accent, value.preview.pattern)
    )
    .join("");
  const shapes = layers
    .map((value, index) =>
      renderShape(value.preview, `pattern-${index}`, index)
    )
    .join("");
  const labels = layers
    .map(
      (value, index) => `<g transform="translate(630 ${188 + index * 74})">
        <rect width="190" height="44" rx="20" fill="#07111b" opacity="0.7"/>
        <text x="18" y="18" fill="#7fcfff" font-size="11" letter-spacing="1.8" font-family="IBM Plex Mono, monospace">${escapeXml(
          collection.slots[index]?.label.toUpperCase() ?? "TRAIT"
        )}</text>
        <text x="18" y="32" fill="#f7f9ff" font-size="14" font-family="Avenir Next, Segoe UI, sans-serif">${escapeXml(
          value.label
        )}</text>
      </g>`
    )
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 1200">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${background.fill}"/>
        <stop offset="100%" stop-color="#030711"/>
      </linearGradient>
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="18" result="blur"/>
        <feMerge>
          <feMergeNode in="blur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
      ${defs}
    </defs>
    <rect width="900" height="1200" fill="url(#bg)"/>
    <circle cx="690" cy="150" r="180" fill="${background.accent}" opacity="0.14" filter="url(#glow)"/>
    <circle cx="180" cy="1020" r="220" fill="${background.fill}" opacity="0.22" filter="url(#glow)"/>
    <rect x="68" y="74" width="764" height="1052" rx="54" fill="#02060d" opacity="0.52" stroke="#203447" stroke-width="1.5"/>
    ${shapes}
    <rect x="118" y="906" width="522" height="138" rx="32" fill="#07111b" opacity="0.78"/>
    <text x="142" y="948" fill="#7fcfff" font-size="14" letter-spacing="2.8" font-family="IBM Plex Mono, monospace">${escapeXml(
      collection.symbol
    )} / MPL CORE PREVIEW</text>
    <text x="142" y="994" fill="#f7f9ff" font-size="40" font-family="Avenir Next, Segoe UI, sans-serif">${escapeXml(
      name
    )}</text>
    <text x="142" y="1032" fill="#aec9dd" font-size="18" font-family="Avenir Next, Segoe UI, sans-serif">${escapeXml(
      collection.themeNote
    )}</text>
    ${labels}
  </svg>`;

  const dataUri = percentEncodeSvg(svg);
  const metadataInput = {
    name,
    symbol: collection.symbol,
    description: `${collection.description} Rendered through TraitForge with server-authored trait layering.`,
    image: dataUri,
    external_url: `https://traitforge070.colmena.dev/collections/${collection.slug}`,
    collection: {
      name: collection.name,
      family: "TraitForge",
      key: collection.collectionKey
    },
    attributes: collection.slots.map((slot) => {
      const value = getValue(collection, slot.id, selections[slot.id]);
      return {
        trait_type: slot.label,
        value: value.label,
        rarityWeight: value.rarityWeight,
        supplyCap: value.supplyCap
      };
    })
  };

  return {
    svg,
    dataUri,
    metadataInput
  };
}

export function composeDraft(
  state: AppState,
  collectionSlug: string,
  rawSelections: TraitSelection,
  name?: string
): DraftComposition {
  const collection = getCollectionBySlug(state, collectionSlug);
  const selections = normalizeSelections(collection, rawSelections);
  const preview = renderPreview(collection, selections, name);
  const conflicts = detectConflicts(collection, selections);
  const rarity = computeRarity(state, collection, selections);
  const usage = computeUsageStats(state, collection);

  return {
    selections,
    preview,
    conflicts,
    rarity,
    usage
  };
}

export function quoteDraft(
  state: AppState,
  collectionSlug: string,
  rawSelections: TraitSelection,
  name?: string
): MintQuoteResponse {
  const draft = composeDraft(state, collectionSlug, rawSelections, name);
  const quote = createMintQuote({
    collectionSlug,
    rarityScore: draft.rarity.score,
    traitCount: Object.keys(draft.selections).length
  });
  const warnings: string[] = [];

  if (draft.conflicts.length > 0) {
    warnings.push("Resolve trait conflicts before treating this quote as mint-ready.");
  }
  if (draft.rarity.label === "Legendary") {
    warnings.push("Legendary combinations carry an elevated scarcity premium.");
  }
  if (draft.usage.some((entry) => entry.remaining > 0 && entry.remaining <= 2)) {
    warnings.push("One or more selected traits are within two mints of their supply cap.");
  }

  return {
    ...draft,
    quote,
    warnings
  };
}

export function createMetadataForSelections(
  collection: CollectionSchema,
  selections: TraitSelection,
  name?: string
) {
  const preview = renderPreview(collection, selections, name);
  return buildMplCoreMetadata(preview.metadataInput);
}

export function buildMetadataDiff(
  state: AppState,
  collectionSlug: string,
  base: TraitSelection,
  compare: TraitSelection
): MetadataDiffResponse {
  const collection = getCollectionBySlug(state, collectionSlug);
  const baseSelections = normalizeSelections(collection, base);
  const compareSelections = normalizeSelections(collection, compare);
  const baseMetadata = buildMplCoreMetadata(
    renderPreview(collection, baseSelections, `${collection.name} Base`).metadataInput
  );
  const compareMetadata = buildMplCoreMetadata(
    renderPreview(collection, compareSelections, `${collection.name} Compare`).metadataInput
  );

  const changedAttributes = collection.slots.flatMap((slot) => {
    const before = getValue(collection, slot.id, baseSelections[slot.id]).label;
    const after = getValue(collection, slot.id, compareSelections[slot.id]).label;
    if (before === after) {
      return [];
    }

    return [
      {
        slotId: slot.id,
        trait: slot.label,
        before,
        after
      }
    ];
  });

  return {
    baseMetadata,
    compareMetadata,
    changedAttributes
  };
}

export function buildAnalytics(
  state: AppState,
  collectionSlug: string
): {
  usage: TraitUsageStat[];
  rarityBuckets: Array<{ label: string; count: number }>;
} {
  const collection = getCollectionBySlug(state, collectionSlug);
  const usage = computeUsageStats(state, collection);
  const buckets = [
    { label: "Common", count: 0 },
    { label: "Rare", count: 0 },
    { label: "Epic", count: 0 },
    { label: "Legendary", count: 0 }
  ];

  for (const draft of state.drafts.filter(
    (entry) => entry.collectionSlug === collectionSlug
  )) {
    const bucket = buckets.find((entry) => entry.label === draft.rarity.label);
    if (bucket) {
      bucket.count += 1;
    }
  }

  for (const mint of state.mintIntents.filter(
    (entry) => entry.collectionSlug === collectionSlug
  )) {
    const asset = state.assets.find((entry) => entry.id === mint.assetId);
    if (!asset) {
      continue;
    }

    const score = asset.metadata.attributes.reduce((sum, attribute) => {
      return sum + (attribute.rarityWeight ?? 1);
    }, 0);

    if (score <= 9) {
      buckets[3].count += 1;
    } else if (score <= 12) {
      buckets[2].count += 1;
    } else if (score <= 15) {
      buckets[1].count += 1;
    } else {
      buckets[0].count += 1;
    }
  }

  return {
    usage,
    rarityBuckets: buckets
  };
}
