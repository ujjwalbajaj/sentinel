"use client";

import { useEffect, useState } from "react";
import { resolveProbeCostWei, type PauseState, type SimulationState, type StrikeState } from "@/lib/warroom";
import { formatWei } from "@/lib/utils";

export function OutcomeBanner({
  strike,
  pause,
  simulation,
  symbol,
  motion,
}: {
  strike: StrikeState | null;
  pause: PauseState | null;
  simulation: SimulationState | null;
  symbol: string | null;
  motion: boolean;
}) {
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (!strike) {
      setOn(false);
      return undefined;
    }
    if (!motion) {
      setOn(true);
      return undefined;
    }
    const timer = window.setTimeout(() => setOn(true), 900);
    return () => window.clearTimeout(timer);
  }, [strike, motion]);

  const seconds = pause?.onchainSeconds;
  const wall = pause?.wallSeconds;
  const tip = wall == null ? undefined : `Wall clock ${wall.toFixed(1)}s`;
  const risk = simulation?.atRisk ? `${simulation.atRisk}${simulation.symbol || symbol ? ` ${simulation.symbol || symbol}` : ""}` : "—";
  const unit = simulation?.symbol || symbol || "";
  const strikeLoss = formatWei(strike?.strikeLossWei || "0") || "0";
  const probeWei = resolveProbeCostWei(strike, simulation);
  const probeCost = probeWei == null ? "—" : formatWei(probeWei) || "—";

  return (
    <div className={`wr-banner${on ? " on" : ""}`} aria-hidden={!on}>
      <div className="big">ATTACK NEUTRALIZED</div>
      <div className="sep" />
      <div className="st">
        <b title={tip}>{seconds == null ? "—" : `${seconds.toFixed(1)}s`}</b>
        <span>PROBE → PAUSE</span>
      </div>
      <div className="st">
        <b style={{ color: "var(--redT)" }}>{risk}</b>
        <span>WAS AT RISK</span>
      </div>
      <div className="st">
        <b style={{ color: "var(--green)" }}>{unit ? `${strikeLoss} ${unit}` : strikeLoss}</b>
        <span>LOST TO THE STRIKE</span>
      </div>
      <div className="st">
        <b>{unit ? `${probeCost} ${unit}` : probeCost}</b>
        <span>PROBE COST</span>
      </div>
    </div>
  );
}
