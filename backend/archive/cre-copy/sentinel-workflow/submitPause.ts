import {
  bytesToHex,
  EVMClient,
  getNetwork,
  hexToBase64,
  type Runtime,
} from "@chainlink/cre-sdk";
import { encodeAbiParameters, type Hex } from "viem";

export interface PauseConfig {
  gasLimit: string;
  guardians: Record<string, string>;
}

/// Submits the guardian pause report through the CRE EVM write capability.
/// Layout matches Guardian._processReport: abi.encode(address, uint16, bytes32).
export function submitPause(
  runtime: Runtime<PauseConfig>,
  chainSelectorName: string,
  protocol: Hex,
  probability: number,
  alertId: Hex,
): string {
  const guardian = runtime.config.guardians[chainSelectorName];
  if (!guardian) {
    throw new Error(`No guardian configured for ${chainSelectorName}`);
  }
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName,
  });
  if (!network) {
    throw new Error(`Unknown CRE chain ${chainSelectorName}`);
  }

  const encoded = encodeAbiParameters(
    [{ type: "address" }, { type: "uint16" }, { type: "bytes32" }],
    [protocol, probability, alertId],
  );

  const report = runtime
    .report({
      encodedPayload: hexToBase64(encoded),
      encoderName: "evm",
      signingAlgo: "ecdsa",
      hashingAlgo: "keccak256",
    })
    .result();

  const evm = new EVMClient(network.chainSelector.selector);
  const write = evm
    .writeReport(runtime, {
      receiver: guardian,
      report,
      gasConfig: { gasLimit: runtime.config.gasLimit },
    })
    .result();

  const txHash = write.txHash ? bytesToHex(write.txHash) : "";
  runtime.log(`Guardian report status=${String(write.txStatus)} tx=${txHash}`);
  return txHash;
}
