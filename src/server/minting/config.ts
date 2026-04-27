import { createKeyPairSignerFromBytes } from "@solana/kit";
import { existsSync, readFileSync } from "node:fs";
import {
  normalizePublicBaseUrl
} from "./metadata.js";

const DEFAULT_DEVNET_RPC_URL = "https://api.devnet.solana.com";
const SIGNER_ENV = "TRAITFORGE_DEVNET_SIGNER_KEYPAIR";

export interface DevnetMintingConfig {
  cluster: "devnet";
  publicBaseUrl: string;
  rpcUrl: string;
  wsUrl: string;
  signer: Awaited<ReturnType<typeof createKeyPairSignerFromBytes>>;
}

let cachedConfig: Promise<DevnetMintingConfig> | null = null;

function deriveWsUrl(rpcUrl: string): string {
  const url = new URL(rpcUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

function isIntegerArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) => Number.isInteger(entry) && entry >= 0 && entry <= 255
    )
  );
}

function parseSignerBytes(rawValue: string): Uint8Array {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    throw new Error(
      `${SIGNER_ENV} is empty. Provide a 64-byte Solana keypair JSON array or a path to a keypair file.`
    );
  }

  const candidate = existsSync(trimmed)
    ? readFileSync(trimmed, "utf8")
    : trimmed;

  if (candidate.startsWith("base64:")) {
    return Uint8Array.from(Buffer.from(candidate.slice(7), "base64"));
  }

  if (candidate.startsWith("[")) {
    const parsed = JSON.parse(candidate) as unknown;
    if (!isIntegerArray(parsed)) {
      throw new Error(
        `${SIGNER_ENV} JSON must be an array of byte values between 0 and 255.`
      );
    }
    return Uint8Array.from(parsed);
  }

  if (candidate.includes(",")) {
    const parts = candidate.split(",").map((entry) => Number(entry.trim()));
    if (!isIntegerArray(parts)) {
      throw new Error(
        `${SIGNER_ENV} comma-separated values must all be integers between 0 and 255.`
      );
    }
    return Uint8Array.from(parts);
  }

  throw new Error(
    `${SIGNER_ENV} must be a keypair JSON array, comma-separated byte list, base64:<value>, or a filesystem path to one of those formats.`
  );
}

async function loadMintingConfig(): Promise<DevnetMintingConfig> {
  const publicBaseUrl = process.env.TRAITFORGE_PUBLIC_BASE_URL?.trim();
  const signerKeypair = process.env[SIGNER_ENV]?.trim();

  if (!publicBaseUrl || !signerKeypair) {
    throw new Error(
      "Devnet minting is not configured. Set TRAITFORGE_PUBLIC_BASE_URL and TRAITFORGE_DEVNET_SIGNER_KEYPAIR before minting."
    );
  }

  const rpcUrl = process.env.TRAITFORGE_DEVNET_RPC_URL?.trim() || DEFAULT_DEVNET_RPC_URL;
  const signerBytes = parseSignerBytes(signerKeypair);
  if (signerBytes.length !== 64) {
    throw new Error(
      `${SIGNER_ENV} must resolve to exactly 64 bytes from a Solana keypair file. Received ${signerBytes.length} bytes.`
    );
  }

  return {
    cluster: "devnet",
    publicBaseUrl: normalizePublicBaseUrl(publicBaseUrl),
    rpcUrl,
    wsUrl: process.env.TRAITFORGE_DEVNET_WS_URL?.trim() || deriveWsUrl(rpcUrl),
    signer: await createKeyPairSignerFromBytes(signerBytes)
  };
}

export function getDevnetMintingConfig(): Promise<DevnetMintingConfig> {
  cachedConfig ??= loadMintingConfig();
  return cachedConfig;
}
