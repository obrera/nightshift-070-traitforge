import {
  fetchAssetV1,
  fetchMaybeCollectionV1,
  getCreateCollectionV1Instruction,
  getCreateV1Instruction
} from "@obrera/mpl-core-kit-lib";
import {
  address,
  airdropFactory,
  appendTransactionMessageInstructions,
  assertIsAddress,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  devnet,
  generateKeyPairSigner,
  getSignatureFromTransaction,
  lamports,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners
} from "@solana/kit";
import type { CollectionSchema } from "../../shared/contracts.js";
import { lamportsToSol } from "../../shared/mpl.js";
import { nowUtc } from "../utils.js";
import { getDevnetMintingConfig } from "./config.js";
import {
  getCollectionPublicUrls
} from "./metadata.js";

const LOCAL_AIRDROP_LAMPORTS = 2_000_000_000n;
const MINT_BUFFER_LAMPORTS = 20_000_000n;
const COLLECTION_CREATION_BUFFER_LAMPORTS = 25_000_000n;

function isLocalMintingRun(publicBaseUrl: string): boolean {
  const hostname = new URL(publicBaseUrl).hostname;
  return (
    process.env.NODE_ENV !== "production" &&
    ["127.0.0.1", "0.0.0.0", "localhost"].includes(hostname)
  );
}

function createExplorerUrl(kind: "address" | "tx", value: string): string {
  return `https://explorer.solana.com/${kind}/${value}?cluster=devnet`;
}

export interface DevnetCollectionDeployment {
  address: string;
  explorerUrl: string;
  metadataUrl: string;
  imageUrl: string;
  createdAt: string;
  createdNow: boolean;
}

export interface DevnetMintResult {
  assetAddress: string;
  signature: string;
  recipientOwnerAddress: string;
  collectionAddress: string;
  explorerUrls: {
    asset: string;
    collection: string;
    transaction: string;
  };
}

export async function createDevnetMintingClient() {
  const config = await getDevnetMintingConfig();
  const rpc = createSolanaRpc(devnet(config.rpcUrl));
  const rpcSubscriptions = createSolanaRpcSubscriptions(devnet(config.wsUrl));
  const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({
    rpc,
    rpcSubscriptions
  });
  const airdrop = airdropFactory({
    rpc,
    rpcSubscriptions
  });

  async function sendInstructions(instructions: Parameters<typeof appendTransactionMessageInstructions>[0]) {
    const { value: latestBlockhash } = await rpc
      .getLatestBlockhash({ commitment: "confirmed" })
      .send();
    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (current) => setTransactionMessageFeePayerSigner(config.signer, current),
      (current) =>
        setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, current),
      (current) => appendTransactionMessageInstructions(instructions, current)
    );
    const transaction = await signTransactionMessageWithSigners(message);
    await sendAndConfirmTransaction(
      transaction as Parameters<typeof sendAndConfirmTransaction>[0],
      {
        commitment: "confirmed"
      }
    );
    return getSignatureFromTransaction(
      transaction as Parameters<typeof getSignatureFromTransaction>[0]
    );
  }

  async function ensureSignerBalance(
    minimumLamports: bigint
  ): Promise<{ balanceLamports: bigint; airdropAttempted: boolean }> {
    const { value } = await rpc
      .getBalance(config.signer.address, { commitment: "confirmed" })
      .send();
    let balanceLamports = BigInt(value);
    let airdropAttempted = false;

    if (balanceLamports >= minimumLamports) {
      return { balanceLamports, airdropAttempted };
    }

    if (isLocalMintingRun(config.publicBaseUrl)) {
      airdropAttempted = true;
      try {
        await airdrop({
          recipientAddress: config.signer.address,
          lamports: lamports(LOCAL_AIRDROP_LAMPORTS),
          commitment: "confirmed"
        });
        const refreshed = await rpc
          .getBalance(config.signer.address, { commitment: "confirmed" })
          .send();
        balanceLamports = BigInt(refreshed.value);
      } catch {
        // Keep the original balance and return a useful error below.
      }
    }

    if (balanceLamports < minimumLamports) {
      const airdropSuffix = airdropAttempted
        ? " A local devnet airdrop was attempted but the signer is still short on funds."
        : "";
      throw new Error(
        `Custodial devnet signer ${config.signer.address} is underfunded. Current balance: ${lamportsToSol(
          balanceLamports
        ).toFixed(4)} SOL. Needed roughly ${lamportsToSol(minimumLamports).toFixed(
          4
        )} SOL for this mint.${airdropSuffix}`
      );
    }

    return { balanceLamports, airdropAttempted };
  }

  return {
    config,
    signerAddress: config.signer.address,
    async assertReadyForMint(
      quoteLamports: number,
      willCreateCollection: boolean
    ) {
      const minimum =
        BigInt(quoteLamports) +
        MINT_BUFFER_LAMPORTS +
        (willCreateCollection ? COLLECTION_CREATION_BUFFER_LAMPORTS : 0n);
      return ensureSignerBalance(minimum);
    },
    async ensureCollection(
      collection: CollectionSchema
    ): Promise<DevnetCollectionDeployment> {
      if (collection.devnetCollection?.address) {
        const maybeCollection = await fetchMaybeCollectionV1(
          rpc,
          address(collection.devnetCollection.address)
        );
        if (maybeCollection.exists) {
          return {
            ...collection.devnetCollection,
            createdNow: false
          };
        }
      }

      const collectionSigner = await generateKeyPairSigner();
      const urls = getCollectionPublicUrls(config.publicBaseUrl, collection.slug);
      await sendInstructions([
        getCreateCollectionV1Instruction({
          collection: collectionSigner,
          name: collection.name,
          payer: config.signer,
          updateAuthority: config.signer.address,
          uri: urls.metadataUrl
        })
      ]);

      return {
        address: collectionSigner.address,
        explorerUrl: createExplorerUrl("address", collectionSigner.address),
        metadataUrl: urls.metadataUrl,
        imageUrl: urls.imageUrl,
        createdAt: nowUtc(),
        createdNow: true
      };
    },
    async mintAsset(args: {
      collectionAddress: string;
      metadataUrl: string;
      name: string;
      recipientOwnerAddress: string;
    }): Promise<DevnetMintResult> {
      try {
        assertIsAddress(args.recipientOwnerAddress);
      } catch {
        throw new Error("Recipient wallet address must be a valid Solana address.");
      }
      const recipientOwnerAddress = address(args.recipientOwnerAddress);
      const assetSigner = await generateKeyPairSigner();

      const signature = await sendInstructions([
        getCreateV1Instruction({
          asset: assetSigner,
          authority: config.signer,
          collection: address(args.collectionAddress),
          name: args.name,
          owner: recipientOwnerAddress,
          payer: config.signer,
          updateAuthority: config.signer.address,
          uri: args.metadataUrl
        })
      ]);

      const asset = await fetchAssetV1(rpc, assetSigner.address);

      return {
        assetAddress: asset.address,
        signature,
        recipientOwnerAddress: asset.data.owner,
        collectionAddress: args.collectionAddress,
        explorerUrls: {
          asset: createExplorerUrl("address", asset.address),
          collection: createExplorerUrl("address", args.collectionAddress),
          transaction: createExplorerUrl("tx", signature)
        }
      };
    }
  };
}
