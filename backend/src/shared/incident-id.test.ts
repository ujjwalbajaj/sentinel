import assert from "node:assert/strict";
import test from "node:test";
import type { Hex } from "viem";
import { incidentId } from "./incident-id.js";

const txHash = `0x${"11".repeat(32)}` as Hex;

test("incidentId matches the contracts repo vector for chain 56", () => {
  assert.equal(
    incidentId(56, txHash),
    "0x9240ffc6acd796b72393694832cc4d0758061fe286eb2435f31124d826f2bfef",
  );
});
