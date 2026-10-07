"use client";

import { useEffect, useState } from "react";
import type { VerdictState } from "@/lib/warroom";

const RING = 415;

export function CreVerdict({
  verdict,
  creMode,
  timedOut,
  motion,
  onRule,
  onSettle,
}: {
  verdict: VerdictState | null;
  creMode: "simulate" | "http" | null;
  timedOut: boolean;
  motion: boolean;
  onRule?: () => void;
  onSettle?: () => void;
}) {
  const rules = verdict?.rules ?? null;
  const [shown, setShown] = useState(0);
  const [score, setScore] = useState(0);
  const [settled, setSettled] = useState(false);
  const revealed = !motion || !rules ? rules?.length ?? 0 : shown;
  const visibleScore = !verdict ? 0 : !motion || !rules || rules.length === 0 ? verdict.score : score;
  const ready = !verdict ? false : !motion || !rules || rules.length === 0 || settled;

  useEffect(() => {
    if (!verdict) {
      setShown(0);
      setScore(0);
      setSettled(false);
      return undefined;
    }
    if (!motion || !rules || rules.length === 0) {
      setShown(rules?.length ?? 0);
      setScore(verdict.score);
      setSettled(true);
      return undefined;
    }
    setShown(0);
    setScore(0);
    setSettled(false);
    let running = 0;
    const timers = rules.map((rule, index) =>
      window.setTimeout(() => {
        setShown(index + 1);
        if (rule.hit && rule.points) running += rule.points;
        setScore(index === rules.length - 1 ? verdict.score : running);
        if (rule.hit) onRule?.();
        if (index === rules.length - 1) {
          window.setTimeout(() => {
            setSettled(true);
            onSettle?.();
          }, 250);
        }
      }, index * 380),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [verdict, rules, motion, onRule, onSettle]);

  const ringScore = visibleScore;
  const threshold = verdict?.threshold;
  const rejected = verdict?.action === "rejected";
  const chip = !verdict
    ? timedOut
      ? "CRE TIMEOUT"
      : "AWAITING EVIDENCE"
    : !ready
      ? "SCORING"
      : rejected
        ? verdict.threshold == null
          ? `NO PAUSE · score ${verdict.score}`
          : `NO PAUSE · score ${verdict.score} < ${verdict.threshold}`
        : "VERDICT · PAUSE";

  return (
    <div className="wr-panel wr-brain">
      <div className="wr-ph">
        <span className="wr-tag brain">BRAIN</span>
        <h3>Chainlink CRE verdict</h3>
        <span className="sub">{creMode ?? "—"}</span>
      </div>
      <div className="wr-ringwrap">
        <div className="wr-ring">
          <svg viewBox="0 0 160 160" width="100%" height="100%" aria-hidden>
            <circle cx="80" cy="80" r="66" fill="none" stroke="#121925" strokeWidth="12" />
            <circle
              cx="80"
              cy="80"
              r="66"
              fill="none"
              stroke={rejected ? "#F5B942" : "#FF4D5E"}
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={`${Math.max(0, Math.min(100, ringScore)) / 100 * RING} ${RING}`}
              transform="rotate(-90 80 80)"
              style={{ transition: "stroke-dasharray .35s" }}
            />
            {threshold != null ? (
              <line x1="80" y1="8" x2="80" y2="24" stroke="#F5B942" strokeWidth="3" transform={`rotate(${(threshold / 100) * 360} 80 80)`} />
            ) : null}
          </svg>
          <div className="v">
            <b>{visibleScore}</b>
            {threshold != null ? <span>pause at ≥ {threshold}</span> : null}
          </div>
        </div>
        {rules && rules.length > 0 ? (
          <div className="wr-rules">
            {rules.map((rule, index) => (
              <div key={`${rule.id}-${index}`} className={`wr-rule${index < revealed ? (rule.hit ? " hit" : " miss") : ""}`}>
                <span className="name">{rule.label}</span>
                <span className="pt">{rule.points == null ? "—" : `+${rule.points}`}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <div className={`wr-verdict${ready && verdict?.action === "pause" ? " go" : ""}${ready && verdict?.action === "rejected" ? " no" : ""}${!verdict && timedOut ? " timeout" : ""}`}>
        {chip}
      </div>
    </div>
  );
}
