import type { FastifyInstance } from "fastify";
import { getAddress, isAddress } from "viem";
import { z } from "zod";
import { chainById, isSet } from "../config/chains.js";
import { prisma } from "../db/client.js";
import { HttpError } from "../http-error.js";
import { live } from "../live/hub.js";
import { encodeCall, readContractValue } from "../shared/call.js";
import { guardianAbi, vaultAbi } from "../shared/load-abi.js";
import { formatNativeAmount, liveVaultWei } from "../vaults.js";
import { SYSTEM_WALLET } from "../protocols/store.js";
import { sessionOf } from "./auth.js";

export function registerProtocols(app: FastifyInstance): void {
  app.post("/protocols", async (request) => {
    const session = sessionOf(request.headers.cookie);
    const body = z.object({
      name: z.string().min(1),
      chainId: z.union([z.literal(56), z.literal(8453)]),
      vaultAddress: z.string(),
    }).parse(request.body);
    const chain = chainById(body.chainId);
    if (!chain || !isSet(chain.deployment.guardian)) {
      throw new HttpError("Guardian address is missing from the deployment file", 400);
    }
    const vault = getAddress(body.vaultAddress);
    const guardian = getAddress(chain.deployment.guardian);
    const caller = getAddress(session.wallet);
    let registered = false;
    let isAdmin = false;
    let pauserRoleGranted = false;
    try {
      registered = await readContractValue<boolean>(chain.http(), guardian, guardianAbi, "protectedVault", [vault]);
      const adminRole = await readContractValue<string>(chain.http(), vault, vaultAbi, "DEFAULT_ADMIN_ROLE");
      const pauserRole = await readContractValue<string>(chain.http(), vault, vaultAbi, "PAUSER_ROLE");
      isAdmin = await readContractValue<boolean>(chain.http(), vault, vaultAbi, "hasRole", [adminRole, caller]);
      pauserRoleGranted = await readContractValue<boolean>(chain.http(), vault, vaultAbi, "hasRole", [pauserRole, guardian]);
    } catch {
      throw new HttpError("Could not read DEFAULT_ADMIN_ROLE on this vault", 400);
    }
    if (!isAdmin) {
      return {
        protocol: null,
        guardianAddress: guardian,
        isAdmin: false,
        protectedVault: registered,
        pauserRoleGranted,
        transactions: [],
      };
    }
    const existing = await prisma.protocol.findUnique({
      where: { chainId_vaultAddress: { chainId: chain.id, vaultAddress: vault } },
      include: { owner: true },
    });
    const ownerId = !existing || existing.owner.walletAddress === SYSTEM_WALLET ? session.sub : existing.ownerId;
    const status = registered ? (existing?.status === "paused" ? "paused" : "protected") : (existing?.status ?? "pending");
    const protocol = await prisma.protocol.upsert({
      where: { chainId_vaultAddress: { chainId: chain.id, vaultAddress: vault } },
      create: {
        ownerId: session.sub,
        name: body.name,
        chainId: chain.id,
        vaultAddress: vault,
        guardianAddress: guardian,
        status,
      },
      update: { name: body.name, guardianAddress: guardian, ownerId, status },
    });
    live("protocol:updated", { id: protocol.id, chainId: protocol.chainId, status: protocol.status });
    return {
      protocol,
      guardianAddress: guardian,
      isAdmin: true,
      protectedVault: registered,
      pauserRoleGranted,
      transactions: registered
        ? []
        : [
            {
              name: "registerVault",
              to: guardian,
              data: encodeCall(guardianAbi, "registerVault", [vault]),
              required: true,
            },
          ],
    };
  });

  app.get("/protocols", async () => {
    const rows = await prisma.protocol.findMany({ orderBy: { createdAt: "desc" }, include: { owner: true } });
    return { protocols: await Promise.all(rows.map((row) => withLive(row))) };
  });

  app.get("/protocols/:id", async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const query = z.object({ chainId: z.coerce.number().optional() }).parse(request.query);
    if (isAddress(params.id)) {
      if (query.chainId !== 56 && query.chainId !== 8453) {
        throw new HttpError("A vault address lookup needs chainId 56 or 8453", 400);
      }
      const row = await prisma.protocol.findUnique({
        where: { chainId_vaultAddress: { chainId: query.chainId, vaultAddress: getAddress(params.id) } },
        include: { owner: true },
      });
      if (!row) throw new HttpError("Protocol not found", 404);
      return withLive(row);
    }
    const row = await prisma.protocol.findUnique({ where: { id: params.id }, include: { owner: true } });
    if (!row || (query.chainId != null && row.chainId !== query.chainId)) throw new HttpError("Protocol not found", 404);
    return withLive(row);
  });
}

async function withLive(row: {
  id: string;
  name: string;
  chainId: number;
  vaultAddress: string;
  guardianAddress: string;
  status: string;
  createdAt: Date;
  owner: { walletAddress: string; name: string; org: string; role: string };
}) {
  const chain = chainById(row.chainId);
  let paused = false;
  let vaultBalanceWei = "0";
  let admin: string | null = null;
  let protectedVault = false;
  let pauserRoleGranted = false;
  if (chain && isSet(row.vaultAddress)) {
    const client = chain.http();
    const vault = getAddress(row.vaultAddress);
    const wei = await liveVaultWei(chain, vault);
    vaultBalanceWei = wei.toString();
    paused = await readContractValue<boolean>(client, vault, vaultAbi, "paused");
    if (isSet(row.guardianAddress)) {
      const guardian = getAddress(row.guardianAddress);
      protectedVault = await readContractValue<boolean>(client, guardian, guardianAbi, "protectedVault", [vault]);
      const pauserRole = await readContractValue<string>(client, vault, vaultAbi, "PAUSER_ROLE");
      pauserRoleGranted = await readContractValue<boolean>(client, vault, vaultAbi, "hasRole", [pauserRole, guardian]);
      if (protectedVault) {
        admin = getAddress(await readContractValue<string>(client, guardian, guardianAbi, "vaultAdmin", [vault]));
      }
    }
  }
  return {
    id: row.id,
    name: row.name,
    chainId: row.chainId,
    vaultAddress: row.vaultAddress,
    guardianAddress: row.guardianAddress,
    status: paused ? "paused" : row.status,
    createdAt: row.createdAt.toISOString(),
    owner: row.owner,
    tvlNative: formatNativeAmount(BigInt(vaultBalanceWei)),
    nativeSymbol: chain?.native ?? "",
    live: {
      paused,
      vaultBalanceWei,
      protectedVault,
      pauserRoleGranted,
      admin,
    },
  };
}
