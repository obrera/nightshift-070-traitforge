import {
  fetchCollectionV1,
  getCreateCollectionV2Instruction,
  getCreateV2Instruction
} from "@obrera/mpl-core-kit-lib";
import {
  type Address,
  address,
  appendTransactionMessageInstructions,
  assertIsTransactionMessageWithSingleSendingSigner,
  createSolanaRpc,
  createTransactionMessage,
  devnet,
  generateKeyPairSigner,
  getBase58Decoder,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signAndSendTransactionMessageWithSigners,
  type TransactionSendingSigner
} from "@solana/kit";
import type { CreateMintPlan } from "../shared/contracts";

export async function executeWalletMint(args: {
  collectionName: string;
  mintPlan: CreateMintPlan;
  rpcUrl: string;
  walletSigner: TransactionSendingSigner<string>;
}) {
  const rpc = createSolanaRpc(devnet(args.rpcUrl));

  let collectionAddress: Address | undefined;
  let collectionSigner: Awaited<ReturnType<typeof generateKeyPairSigner>> | undefined;

  if (args.mintPlan.collection.mode === "existing") {
    collectionAddress = address(args.mintPlan.collection.address);
    await fetchCollectionV1(rpc, collectionAddress);
  } else {
    collectionSigner = await generateKeyPairSigner();
    collectionAddress = collectionSigner.address;
  }

  const assetSigner = await generateKeyPairSigner();
  const instructions = collectionSigner
    ? [
        getCreateCollectionV2Instruction({
          collection: collectionSigner,
          name: args.collectionName,
          payer: args.walletSigner,
          updateAuthority: args.walletSigner.address,
          uri: args.mintPlan.collection.metadataUrl
        }),
        getCreateV2Instruction({
          asset: assetSigner,
          authority: args.walletSigner,
          collection: collectionAddress,
          name: args.mintPlan.mintName,
          owner: args.walletSigner.address,
          payer: args.walletSigner,
          uri: args.mintPlan.assetMetadataUrl
        })
      ]
    : [
        getCreateV2Instruction({
          asset: assetSigner,
          authority: args.walletSigner,
          collection: collectionAddress,
          name: args.mintPlan.mintName,
          owner: args.walletSigner.address,
          payer: args.walletSigner,
          uri: args.mintPlan.assetMetadataUrl
        })
      ];

  const { value: latestBlockhash } = await rpc
    .getLatestBlockhash({ commitment: "confirmed" })
    .send();

  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (current) => setTransactionMessageFeePayerSigner(args.walletSigner, current),
    (current) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, current),
    (current) => appendTransactionMessageInstructions(instructions, current)
  );

  assertIsTransactionMessageWithSingleSendingSigner(message);

  const signatureBytes = await signAndSendTransactionMessageWithSigners(message);

  return {
    assetAddress: assetSigner.address,
    collectionAddress: collectionAddress ?? "",
    signature: getBase58Decoder().decode(signatureBytes)
  };
}
