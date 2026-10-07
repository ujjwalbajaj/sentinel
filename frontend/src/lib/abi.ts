import type { Abi } from "viem";
import guardianJson from "@/shared/abi/Guardian.json";
import vaultJson from "@/shared/abi/Vault.json";
import vulnerableVaultJson from "@/shared/abi/VulnerableVault.json";

export const vaultAbi = vaultJson as Abi;
export const guardianAbi = guardianJson as Abi;
export const vulnerableVaultAbi = vulnerableVaultJson as Abi;
