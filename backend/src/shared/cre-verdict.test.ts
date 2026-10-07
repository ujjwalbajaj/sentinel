import assert from "node:assert/strict";
import test from "node:test";
import { incidentLogSlice, parseSentinelReport, parseSentinelVerdict } from "./cre-client.js";

const verdictLine =
  '2026-10-01T05:58:43Z [USER LOG] SENTINEL_VERDICT {"incidentId":"0xabc","score":96,"threshold":80,"action":"pause","rules":[{"id":"reentrancy","label":"Reentrancy","points":30,"hit":true},{"id":"loss5","label":"Loss 5%","points":15,"hit":true},{"id":"dayold","label":"Day old","points":8,"hit":false}]}';

test("SENTINEL_VERDICT parses a prefixed line and keeps every rule", () => {
  const verdict = parseSentinelVerdict(`${verdictLine}\nnoise`);
  assert.equal(verdict?.score, 96);
  assert.equal(verdict?.action, "pause");
  assert.equal(verdict?.source, "cre");
  assert.equal(verdict?.rules?.length, 3);
  assert.equal(verdict?.rules?.[1]?.id, "loss5");
});

test("SENTINEL_REPORT ignores an all-zero transaction hash", () => {
  const log = [
    '2026-10-01T05:58:43Z [USER LOG] SENTINEL_REPORT {"reportHex":"0x1234"}',
    `Transaction successful: 0x${"0".repeat(64)}`,
  ].join("\n");
  const report = parseSentinelReport(log);
  assert.equal(report?.reportHex, "0x1234");
  assert.equal(report?.writeTxHash, undefined);
});

test("SENTINEL_REPORT keeps a real broadcast hash", () => {
  const hash = `0x${"ab".repeat(32)}`;
  const log = `prefix SENTINEL_REPORT {"reportHex":"0x99"}\nTransaction successful: ${hash}`;
  assert.equal(parseSentinelReport(log)?.writeTxHash, hash);
});

test("an all-zero hash is ignored even when it is the line after SENTINEL_REPORT", () => {
  const hash = `0x${"ab".repeat(32)}`;
  const zero = `0x${"0".repeat(64)}`;
  const afterReport = [
    'SENTINEL_REPORT {"reportHex":"0x99"}',
    `Transaction successful: ${zero}`,
    `Transaction successful: ${hash}`,
  ].join("\n");
  assert.equal(parseSentinelReport(afterReport)?.writeTxHash, hash);
  const trailingZero = [
    'SENTINEL_REPORT {"reportHex":"0x99"}',
    `Transaction successful: ${hash}`,
    `Transaction successful: ${zero}`,
  ].join("\n");
  assert.equal(parseSentinelReport(trailingZero)?.writeTxHash, hash);
  const embedded = `SENTINEL_REPORT {"reportHex":"0x99","writeTxHash":"${zero}"}`;
  assert.equal(parseSentinelReport(embedded)?.writeTxHash, undefined);
});

test("mojibake rule labels fall back by id; points and hit stay from the log", () => {
  const line =
    'SENTINEL_VERDICT {"incidentId":"0xabc","score":15,"threshold":80,"action":"rejected","rules":[{"id":"loss20","label":"Simulated vault loss ΓëÑ 20%","points":30,"hit":false},{"id":"loss5","label":"Simulated vault loss ΓëÑ 5%","points":15,"hit":true},{"id":"reentrancy","label":"Re-entry in the probe trace","points":30,"hit":false}]}';
  const rules = parseSentinelVerdict(line)?.rules;
  assert.equal(rules?.[0]?.label, "Simulated vault loss ≥ 20%");
  assert.equal(rules?.[0]?.points, 30);
  assert.equal(rules?.[0]?.hit, false);
  assert.equal(rules?.[1]?.label, "Simulated vault loss ≥ 5%");
  assert.equal(rules?.[1]?.points, 15);
  assert.equal(rules?.[1]?.hit, true);
  assert.equal(rules?.[2]?.label, "Re-entry in the probe trace");
  assert.equal(rules?.[2]?.points, 30);
  assert.equal(rules?.[2]?.hit, false);
});

test("incident slice keeps this incident and drops a partial trailing line", () => {
  const id = `0x${"aa".repeat(32)}`;
  const other = `0x${"bb".repeat(32)}`;
  const hash = `0x${"cd".repeat(32)}`;
  const older = `0x${"11".repeat(32)}`;
  const text = [
    `\uFEFF\u0000SENTINEL_VERDICT {"incidentId":"${other}","score":1,"threshold":80,"action":"rejected","rules":[]}`,
    `Transaction successful: ${older}`,
    `SENTINEL_VERDICT {"incidentId":"${id}","score":96,"threshold":80,"action":"pause","rules":[]}`,
    `SENTINEL_REPORT {"reportHex":"0x${id.slice(2)}"}`,
    `Transaction successful: ${hash}`,
    `SENTINEL_VERDICT {"incidentId":"${id}","score":1,"action":"pause"`,
  ].join("\n");
  const slice = incidentLogSlice(text, id);
  const verdict = parseSentinelVerdict(slice, id);
  const report = parseSentinelReport(slice, id);
  assert.equal(verdict?.score, 96);
  assert.equal(parseSentinelVerdict(slice, other), null);
  assert.equal(report?.writeTxHash, hash);
  assert.equal(slice.includes(older), false);
  assert.equal(slice.includes('"score":1'), false);
});
