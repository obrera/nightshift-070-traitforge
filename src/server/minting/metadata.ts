import type {
  CollectionSchema,
  TraitSelection
} from "../../shared/contracts.js";
import {
  buildMplCoreMetadata,
  type MplCoreMetadata
} from "../../shared/mpl.js";
import { renderPreview } from "../logic.js";

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function normalizePublicBaseUrl(value: string): string {
  const normalized = trimTrailingSlash(value.trim());
  const url = new URL(normalized);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(
      "TRAITFORGE_PUBLIC_BASE_URL must use http:// or https://."
    );
  }
  return trimTrailingSlash(url.toString());
}

export function getCollectionPublicUrls(publicBaseUrl: string, collectionSlug: string) {
  const base = normalizePublicBaseUrl(publicBaseUrl);
  return {
    metadataUrl: `${base}/api/collections/${collectionSlug}/metadata.json`,
    imageUrl: `${base}/api/collections/${collectionSlug}/preview.svg`
  };
}

export function getAssetPublicUrls(publicBaseUrl: string, assetId: string) {
  const base = normalizePublicBaseUrl(publicBaseUrl);
  return {
    metadataUrl: `${base}/api/assets/${assetId}/metadata.json`,
    imageUrl: `${base}/api/assets/${assetId}/preview.svg`
  };
}

export function buildCollectionMetadataDocument(
  collection: CollectionSchema,
  publicBaseUrl: string
): MplCoreMetadata {
  const preview = renderPreview(
    collection,
    collection.defaultTraitSelection,
    collection.name
  );
  const urls = getCollectionPublicUrls(publicBaseUrl, collection.slug);

  return buildMplCoreMetadata({
    ...preview.metadataInput,
    name: collection.name,
    description: `${collection.description} Official TraitForge devnet collection metadata.`,
    image: urls.imageUrl,
    external_url: normalizePublicBaseUrl(publicBaseUrl)
  });
}

export function buildAssetArtifacts(args: {
  assetId: string;
  collection: CollectionSchema;
  name: string;
  publicBaseUrl: string;
  selections: TraitSelection;
}): {
  previewSvg: string;
  metadata: MplCoreMetadata;
  metadataUrl: string;
  imageUrl: string;
} {
  const preview = renderPreview(args.collection, args.selections, args.name);
  const urls = getAssetPublicUrls(args.publicBaseUrl, args.assetId);

  return {
    previewSvg: preview.svg,
    metadata: buildMplCoreMetadata({
      ...preview.metadataInput,
      image: urls.imageUrl,
      external_url: normalizePublicBaseUrl(args.publicBaseUrl)
    }),
    metadataUrl: urls.metadataUrl,
    imageUrl: urls.imageUrl
  };
}
