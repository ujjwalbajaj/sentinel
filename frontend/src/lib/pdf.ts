import { exploitTitle, protocolLabel } from "./labels";
import type { Incident, Protocol } from "./types";

function buildPdf(lines: string[]) {
  const commands = ["BT", "/F1 10 Tf"];
  let y = 750;
  for (const raw of lines) {
    if (y < 48) break;
    const line = raw.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
    commands.push(`1 0 0 1 48 ${y} Tm (${line.slice(0, 90)}) Tj`);
    y -= 14;
  }
  commands.push("ET");
  const stream = commands.join("\n");
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n",
    `4 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream\nendobj\n`,
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Courier >> endobj\n",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(body.length);
    body += obj;
  }
  const xrefAt = body.length;
  let xref = "xref\n0 6\n0000000000 65535 f \n";
  for (let i = 1; i <= 5; i += 1) {
    xref += `${offsets[i].toString().padStart(10, "0")} 00000 n \n`;
  }
  body += xref;
  body += `trailer << /Size 6 /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  return body;
}

export function downloadPostMortem(incident: Incident, protocol: Protocol) {
  const lines = [
    "SENTINEL post-mortem",
    incident.outcome === "blocked" ? exploitTitle(protocol.name) : protocol.name,
    `${protocolLabel(protocol.name, protocol.chains)}  ${incident.id}`,
    `Outcome: ${incident.outcome}`,
    `Score: ${incident.score}`,
    `Value at risk USD: ${incident.valueAtRiskUsd}`,
    `Funds lost USD: ${incident.fundsLostUsd}`,
    incident.testToPauseSec != null ? `Test to pause: ${incident.testToPauseSec}s` : "Test to pause: n/a",
    "",
    incident.explanation,
    "",
    "Timeline",
    ...incident.timeline.map((step) => `${step.stage}  ${step.at}  ${step.text}`),
    "",
    "Signals",
    ...incident.signals.map((signal) => `${signal.label} +${signal.points}  ${signal.detail}`),
    "",
    "CRE",
    ...incident.cre.map((step) => `${step.step}  ${step.at}`),
  ];
  const blob = new Blob([buildPdf(lines)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `sentinel-${incident.id}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}
