import { getAddress, type Hex } from "viem";
import { isSet, type ChainRuntime } from "../config/chains.js";
import { prisma } from "../db/client.js";

export const SYSTEM_WALLET = "0x0000000000000000000000000000000000000001";

export async function ensureProtocol(chain: ChainRuntime) {
  const vault = chain.deployment.vault;
  const guardian = chain.deployment.guardian;
  if (!isSet(vault) || !isSet(guardian)) return null;
  const vaultAddress = getAddress(vault);
  const guardianAddress = getAddress(guardian);
  const name = chain.id === 56 ? "NovaLend" : "VaultX";
  const adminAddress = isSet(chain.deployment.vaultAdmin) ? getAddress(chain.deployment.vaultAdmin) : "";
  const owner = await prisma.user.upsert({
    where: { walletAddress: SYSTEM_WALLET },
    create: { walletAddress: SYSTEM_WALLET, name: "SENTINEL", org: "SENTINEL", role: "system" },
    update: {},
  });
  return prisma.protocol.upsert({
    where: { chainId_vaultAddress: { chainId: chain.id, vaultAddress } },
    create: {
      ownerId: owner.id,
      name,
      chainId: chain.id,
      vaultAddress,
      guardianAddress,
      adminAddress,
      status: "protected",
    },
    update: { name, guardianAddress, adminAddress },
  });
}

export function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

export function asHex(value: string): Hex {
  return getAddress(value);
}
