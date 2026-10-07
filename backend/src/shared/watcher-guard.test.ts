import assert from "node:assert/strict";
import test from "node:test";
import { isWatcherFailure, socketBackoffMs } from "./watcher-guard.js";

test("a missing block in heads is a watcher failure", () => {
  const error = new TypeError("Cannot read properties of undefined (reading 'number')");
  error.stack = "TypeError: Cannot read properties of undefined (reading 'number')\n    at onBlock (C:/proj/src/warroom/heads.ts:42:15)";
  assert.equal(isWatcherFailure(error), true);
});

test("a socket close is a watcher failure", () => {
  const error = new Error("WebSocket request failed");
  error.name = "SocketClosedError";
  assert.equal(isWatcherFailure(error), true);
});

test("an api error is not a watcher failure", () => {
  const error = new Error("db down");
  error.stack = "Error: db down\n    at handler (C:/proj/src/api/reads.ts:10:5)";
  assert.equal(isWatcherFailure(error), false);
});

test("socket backoff doubles and caps at 30s", () => {
  assert.equal(socketBackoffMs(0), 1_000);
  assert.equal(socketBackoffMs(1), 2_000);
  assert.equal(socketBackoffMs(3), 8_000);
  assert.equal(socketBackoffMs(5), 30_000);
  assert.equal(socketBackoffMs(9), 30_000);
});
