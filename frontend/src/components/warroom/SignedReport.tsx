"use client";

import { useEffect, useState } from "react";
import type { ReportState } from "@/lib/warroom";

const NODES = Array.from({ length: 8 }, (_, index) => {
  const angle = (index / 8) * Math.PI * 2 - Math.PI / 2;
  return { left: 42 + Math.cos(angle) * 40, top: 42 + Math.sin(angle) * 40 };
});

export function SignedReport({ report, motion, onTick }: { report: ReportState | null; motion: boolean; onTick?: () => void }) {
  const [lit, setLit] = useState(0);
  const [core, setCore] = useState(false);
  const [hex, setHex] = useState("");
  const reportHex = report?.reportHex ?? "";
  const shownLit = !motion && report ? 8 : lit;
  const shownCore = !motion && report ? true : core;
  const shownHex = !motion && report ? reportHex : hex;

  useEffect(() => {
    if (!reportHex) {
      setLit(0);
      setCore(false);
      setHex("");
      return undefined;
    }
    if (!motion) {
      setLit(8);
      setCore(true);
      setHex(reportHex);
      return undefined;
    }
    setLit(0);
    setCore(false);
    setHex("");
    const timers = NODES.map((_, index) =>
      window.setTimeout(() => {
        setLit(index + 1);
        onTick?.();
      }, index * 90),
    );
    const coreTimer = window.setTimeout(() => setCore(true), 760);
    let cursor = 0;
    const typer = window.setInterval(() => {
      cursor += 6;
      setHex(reportHex.slice(0, cursor));
      if (cursor >= reportHex.length) window.clearInterval(typer);
    }, 16);
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      window.clearTimeout(coreTimer);
      window.clearInterval(typer);
    };
  }, [reportHex, motion, onTick]);

  return (
    <div className="wr-panel">
      <div className="wr-ph">
        <h3>Signed report</h3>
        <span className="sub">abi.encode(vault, score, incidentId)</span>
      </div>
      <div className="wr-don">
        <div className="wr-nodes" aria-hidden>
          {NODES.map((node, index) => (
            <i key={index} className={index < shownLit ? "on" : ""} style={{ left: `${node.left / 16}rem`, top: `${node.top / 16}rem` }} />
          ))}
          <div className={`core${shownCore ? " on" : ""}`}>
            <svg width="1.125rem" height="1.125rem" viewBox="0 0 24 24" fill="none" stroke="#6E9BFF" strokeWidth="2">
              <path d="M4 7h16v10H4z" />
              <path d="M4 7l8 6 8-6" />
            </svg>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={`wr-hexdump${shownHex ? "" : " muted"}`}>{shownHex || "—"}</div>
        </div>
      </div>
      <div className="wr-cap">
        Hackathon: CRE simulator (1 node). Production: DON consensus, same workflow.
        {report?.writeTxHash && report.writeTxUrl ? (
          <>
            {" "}
            <a href={report.writeTxUrl} target="_blank" rel="noreferrer">
              Write tx
            </a>
          </>
        ) : null}
      </div>
    </div>
  );
}
