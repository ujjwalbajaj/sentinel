import assert from "node:assert/strict";
import test from "node:test";
import { toFunctionSelector } from "viem";
import type { CallFrame } from "./trace.js";
import { reentrancyDetected, shouldInvestigate } from "./decide.js";

const vault = "0x1111111111111111111111111111111111111111";
const withdraw = toFunctionSelector("withdrawAll()");

test("an honest withdrawal of a prior deposit is not investigated", () => {
  assert.equal(
    shouldInvestigate({
      senderIsContract: false,
      mixerFunded: false,
      withdrawnWei: 1000n,
      depositedWei: 1000n,
    }),
    false,
  );
});

test("a contract caller, mixer funding, or an over-withdraw is investigated", () => {
  assert.equal(
    shouldInvestigate({ senderIsContract: true, mixerFunded: false, withdrawnWei: 1n, depositedWei: 1n }),
    true,
  );
  assert.equal(
    shouldInvestigate({ senderIsContract: false, mixerFunded: true, withdrawnWei: 1n, depositedWei: 1n }),
    true,
  );
  assert.equal(
    shouldInvestigate({ senderIsContract: false, mixerFunded: false, withdrawnWei: 2n, depositedWei: 1n }),
    true,
  );
});

test("nested vault withdraws are reentrancy", () => {
  const trace: CallFrame = {
    type: "CALL",
    to: "0x2222222222222222222222222222222222222222",
    input: "0x",
    calls: [
      {
        type: "CALL",
        from: "0x2222222222222222222222222222222222222222",
        to: vault,
        input: withdraw,
        calls: [
          {
            type: "CALL",
            from: vault,
            to: "0x2222222222222222222222222222222222222222",
            calls: [
              {
                type: "CALL",
                from: "0x2222222222222222222222222222222222222222",
                to: vault,
                input: withdraw,
              },
            ],
          },
        ],
      },
    ],
  };
  assert.equal(reentrancyDetected(trace, vault), true);
  assert.equal(
    reentrancyDetected({ type: "CALL", to: vault, input: withdraw, calls: [] }, vault),
    false,
  );
});
