import { assertSharedAbis, placeholderAbiWarning } from "./shared/load-abi.js";
import { env } from "./config/env.js";
import { prisma } from "./db/client.js";
import { log } from "./log.js";
import { buildServer } from "./api/server.js";
import { installProcessGuards } from "./shared/watcher-guard.js";
import { startWatchers } from "./watchers/index.js";
import { startChainHeads } from "./warroom/heads.js";

installProcessGuards();
assertSharedAbis();
const abiWarning = placeholderAbiWarning();
if (abiWarning) log.warn(abiWarning);
const watchOnly = process.argv.includes("--watch-only");

await prisma.$connect();
const app = await buildServer({ watchOnly });
await app.listen({ port: env.PORT, host: "127.0.0.1" });
startWatchers();
startChainHeads();
log.info(
  {
    port: env.PORT,
    watchOnly,
    cre: env.CRE_MODE,
    evidenceQueue: "after-simulation",
    pauseConfirmed: "before-explanation",
    strikeScan: "head-and-poll",
  },
  "SENTINEL mainnet API listening",
);

const shutdown = async () => {
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
