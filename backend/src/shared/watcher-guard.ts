import { log } from "../log.js";

const WATCHER_FRAME =
  /[\\/]warroom[\\/]heads|[\\/]watchers[\\/]|[\\/]detector[\\/]|watchBlocks|watchContractEvent|watchBlockNumber|getSocketRpcClient|rpc[\\/]webSocket/;

export function socketBackoffMs(attempt: number): number {
  const step = Math.max(0, Math.min(attempt, 5));
  return Math.min(30_000, 1_000 * 2 ** step);
}

export function isWatcherFailure(error: unknown): boolean {
  if (error && typeof error === "object" && "name" in error) {
    const name = String((error as { name: unknown }).name);
    if (name === "SocketClosedError" || name === "WebSocketRequestError") return true;
  }
  const text = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
  return WATCHER_FRAME.test(text) || /SocketClosed|eth_subscribe|newHeads subscription/.test(text);
}

let installed = false;

export function installProcessGuards(): void {
  if (installed) return;
  installed = true;
  process.on("unhandledRejection", (reason) => {
    const watcher = isWatcherFailure(reason);
    log.error(
      {
        err: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
        watcher,
      },
      "unhandledRejection",
    );
    if (!watcher) process.exit(1);
  });
  process.on("uncaughtException", (error) => {
    const watcher = isWatcherFailure(error);
    log.error({ err: error.message, stack: error.stack, watcher }, "uncaughtException");
    if (!watcher) process.exit(1);
  });
}
