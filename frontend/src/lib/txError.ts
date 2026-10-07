import { BaseError, ContractFunctionRevertedError } from "viem";

const known: Record<string, string> = {
  NotVaultAdmin: "NotVaultAdmin: this wallet is not the vault admin.",
  PauserRoleMissing: "PauserRoleMissing: the Guardian does not have PAUSER_ROLE yet.",
};

export function explainTxError(error: unknown) {
  if (error instanceof BaseError) {
    const reverted = error.walk((item) => item instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName || reverted.reason || "";
      if (name && known[name]) return known[name];
      if (name) return `Transaction reverted: ${name}.`;
    }
    if (/reject|denied|user rejected/i.test(error.shortMessage)) return "Transaction rejected in the wallet.";
    return error.shortMessage || error.message;
  }
  if (error instanceof Error) {
    if (error.message.includes("NotVaultAdmin")) return known.NotVaultAdmin;
    if (error.message.includes("PauserRoleMissing")) return known.PauserRoleMissing;
    if (/reject|denied|user rejected/i.test(error.message)) return "Transaction rejected in the wallet.";
    return error.message;
  }
  return "Transaction failed.";
}
