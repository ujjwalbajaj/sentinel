import {
  bytesToHex,
  EVMClient,
  getNetwork,
  hexToBase64,
  TxStatus,
  type Runtime,
} from "@chainlink/cre-sdk";
import { encodeAbiParameters, parseAbiParameters } from "viem";
import type { Config, Evidence } from "./types";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/**
 * abi.encode(address vault, uint8 score, bytes32 incidentId)
 * This viem version types uint8 as number. uint256 in the docs is bigint because of precision.
 */
export function encodeReport(vault: `0x${string}`, score: number, incidentId: `0x${string}`): `0x${string}` {
  if (!Number.isInteger(score) || score < 0 || score > 255) {
    throw new Error("score must be an integer from 0 to 255");
  }
  return encodeAbiParameters(parseAbiParameters("address vault, uint8 score, bytes32 incidentId"), [
    vault,
    score,
    incidentId,
  ]);
}

/**
 * Signs a pause report and writes it to Guardian.
 * Report request fields match the onchain-write guide: base64 payload, evm, ecdsa, keccak256.
 */
export function writePause(runtime: Runtime<Config>, config: Config, evidence: Evidence, score: number): string {
  const chain = config.chains[evidence.chain];
  // Encode before the guardian check so a missing address fails after viem has run.
  const encoded = encodeReport(evidence.vault, score, evidence.incidentId);
  runtime.log(`SENTINEL_REPORT ${JSON.stringify({ reportHex: encoded })}`);
  const guardian = chain?.guardian;
  if (!chain || !guardian || !ADDRESS.test(guardian)) {
    throw new Error(`No guardian configured for ${evidence.chain}`);
  }

  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: chain.chainSelectorName,
    isTestnet: false,
  });
  if (!network) {
    throw new Error(`Network not found: ${chain.chainSelectorName}`);
  }

  const evmClient = new EVMClient(network.chainSelector.selector);

  const report = runtime
    .report({
      encodedPayload: hexToBase64(encoded),
      encoderName: "evm",
      signingAlgo: "ecdsa",
      hashingAlgo: "keccak256",
    })
    .result();

  const writeResult = evmClient
    .writeReport(runtime, {
      receiver: guardian,
      report,
      gasConfig: { gasLimit: config.gasLimit },
    })
    .result();

  if (writeResult.txStatus === TxStatus.SUCCESS) {
    const txHash = bytesToHex(writeResult.txHash || new Uint8Array(32));
    runtime.log(`Transaction successful: ${txHash}`);
    return txHash;
  }

  if (writeResult.txStatus === TxStatus.REVERTED) {
    runtime.log(`Transaction reverted: ${writeResult.errorMessage || "Unknown error"}`);
    throw new Error(`Write failed: ${writeResult.errorMessage}`);
  }

  runtime.log(`Fatal error: ${writeResult.errorMessage || "Unknown error"}`);
  throw new Error(`Transaction failed with status: ${writeResult.txStatus}`);
}
