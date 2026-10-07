"use client";

import { useEffect, useRef, useState } from "react";
import { addressHref, chainLabel, revertSignature, shortHash, type ChainId, type WarRoomState } from "@/lib/warroom";

const CIRC = 804;

export function VaultStage({
  state,
  focusChain,
  probeMotion,
  strikeMotion,
  showShield,
  idleBalance,
  idleSymbol,
  idlePaused,
  onProbe,
  onShatter,
}: {
  state: WarRoomState;
  focusChain: ChainId;
  probeMotion: boolean;
  strikeMotion: boolean;
  showShield: boolean;
  idleBalance: string | null;
  idleSymbol: string | null;
  idlePaused?: boolean;
  onProbe?: () => void;
  onShatter?: () => void;
}) {
  const fx = useRef<SVGGElement>(null);
  const beam = useRef<SVGRectElement>(null);
  const [struck, setStruck] = useState(false);
  const chainId = state.chainId ?? focusChain;
  const paused = Boolean(state.pause) || Boolean(idlePaused);
  const threat = state.phase === "threat";
  const pct = state.simulation ? state.simulation.deltaBps / 100 : 0;
  const vaultAddress = state.vaultAddress;
  const address = addressHref(chainId, vaultAddress);

  useEffect(() => {
    if (!state.suspect || !probeMotion) return undefined;
    onProbe?.();
    const group = fx.current;
    if (!group) return undefined;
    packet(group, "#FF4D5E", () => burst(group, 408, 250, "#FF4D5E", 14, 3));
    return undefined;
  }, [state.suspect, probeMotion, onProbe]);

  useEffect(() => {
    const rect = beam.current;
    if (!state.strike) {
      setStruck(false);
      if (rect) {
        rect.setAttribute("width", "0");
        rect.setAttribute("opacity", "1");
      }
      return undefined;
    }
    if (!strikeMotion) {
      setStruck(true);
      return undefined;
    }
    setStruck(false);
    let frame = 0;
    let width = 0;
    let stop = false;
    const grow = () => {
      if (stop || !rect) return;
      width += 22;
      rect.setAttribute("width", String(Math.min(width, 200)));
      if (width < 200) {
        frame = requestAnimationFrame(grow);
        return;
      }
      onShatter?.();
      const group = fx.current;
      if (group) {
        burst(group, 362, 250, "#FF4D5E", 46, 7);
        burst(group, 362, 250, "#6E9BFF", 20, 5);
      }
      let opacity = 1;
      const fade = () => {
        if (stop || !rect) return;
        opacity -= 0.06;
        rect.setAttribute("opacity", String(Math.max(opacity, 0)));
        if (opacity > 0) requestAnimationFrame(fade);
        else {
          rect.setAttribute("width", "0");
          rect.setAttribute("opacity", "1");
          setStruck(true);
        }
      };
      fade();
    };
    if (rect) rect.setAttribute("width", "0");
    frame = requestAnimationFrame(grow);
    return () => {
      stop = true;
      cancelAnimationFrame(frame);
    };
  }, [state.strike, strikeMotion, onShatter]);

  const loss = pct > 0 ? `−${pct.toFixed(0)}%` : `${pct.toFixed(0)}%`;

  return (
    <>
      <div className="wr-ph">
        <h3>Vault · {chainLabel(chainId)}</h3>
        <span className="sub">
          {vaultAddress && address ? (
            <a href={address} target="_blank" rel="noreferrer">
              {shortHash(vaultAddress)}
            </a>
          ) : (
            "—"
          )}
        </span>
      </div>
      <svg className="wr-stage" viewBox="0 0 800 500" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Vault stage">
        <defs>
          <radialGradient id="gCore" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#12321F" />
            <stop offset="1" stopColor="#0C1119" />
          </radialGradient>
          <radialGradient id="gCoreRed" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#3A1017" />
            <stop offset="1" stopColor="#0C1119" />
          </radialGradient>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="beam" x1="0" x2="1">
            <stop offset="0" stopColor="#FF4D5E" stopOpacity="0.1" />
            <stop offset="1" stopColor="#FF4D5E" />
          </linearGradient>
        </defs>
        <line x1="150" y1="250" x2="345" y2="250" stroke="#1C2533" strokeWidth="2" strokeDasharray="4 8" />
        <g className={`wr-attacker${state.attacker ? " on" : ""}`}>
          <circle cx="110" cy="250" r="44" fill="#1A0A0E" stroke="#FF4D5E" strokeWidth="2" filter="url(#glow)" />
          <path d="M96 236h28v28h-28z M104 244h12v12h-12z" fill="none" stroke="#FF8A95" strokeWidth="2" />
          <text x="110" y="320" textAnchor="middle" fill="#FF8A95" fontFamily="var(--font-wr-display), Space Grotesk, sans-serif" fontSize="15" fontWeight="600">
            Attacker contract
          </text>
          <text x="110" y="340" textAnchor="middle" fill="#8591A3" fontFamily="var(--font-wr-mono), monospace" fontSize="12">
            {shortHash(state.attacker)}
          </text>
        </g>
        <g className="wr-orbit">
          <circle cx="520" cy="250" r="190" fill="none" stroke="#3DD68C" strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="3 14" />
        </g>
        <polygon
          className={`wr-hex${paused && showShield ? " on" : ""}`}
          points="520,70 676,160 676,340 520,430 364,340 364,160"
          fill="rgba(110,155,255,.07)"
          stroke="#6E9BFF"
          strokeWidth="3"
          filter="url(#glow)"
        />
        <circle cx="520" cy="250" r="128" fill="none" stroke="#1C2533" strokeWidth="10" />
        <circle
          cx="520"
          cy="250"
          r="128"
          fill="none"
          stroke={paused ? "#3DD68C" : threat ? "#F5B942" : "#3DD68C"}
          strokeWidth="10"
          strokeDasharray={state.simulation ? `${CIRC * (1 - pct / 100)} ${CIRC}` : `${CIRC} ${CIRC}`}
          transform={state.simulation ? `rotate(${-90 + (360 * pct) / 100} 520 250)` : "rotate(-90 520 250)"}
        />
        <circle
          cx="520"
          cy="250"
          r="128"
          fill="none"
          stroke="#FF4D5E"
          strokeWidth="10"
          strokeDasharray={state.simulation ? `${(CIRC * pct) / 100} ${CIRC}` : `0 ${CIRC}`}
          transform="rotate(-90 520 250)"
          opacity={state.simulation ? (paused ? 0.25 : 0.95) : 0}
        />
        <circle cx="520" cy="250" r="110" fill={threat && !paused ? "url(#gCoreRed)" : "url(#gCore)"} stroke="#1C2533" strokeWidth="1.5" />
        <text x="520" y="208" textAnchor="middle" fill="#8591A3" fontFamily="var(--font-wr-display), sans-serif" fontSize="13" letterSpacing="3">
          VAULT BALANCE
        </text>
        <text x="520" y="252" textAnchor="middle" fill="#E8EDF5" fontFamily="var(--font-wr-mono), monospace" fontSize="32" fontWeight="700">
          {state.vaultBalance || idleBalance || "—"}
        </text>
        <text x="520" y="276" textAnchor="middle" fill="#8591A3" fontFamily="var(--font-wr-mono), monospace" fontSize="14">
          {state.symbol || idleSymbol || ""}
        </text>
        <g>
          <rect x="468" y="292" width="104" height="26" rx="13" fill={paused ? "#0E1832" : "#0B2219"} />
          <text x="520" y="310" textAnchor="middle" fill={paused ? "#6E9BFF" : "#3DD68C"} fontFamily="var(--font-wr-display), sans-serif" fontSize="12.5" fontWeight="700" letterSpacing="2">
            {paused ? "PAUSED" : "ACTIVE"}
          </text>
        </g>
        <g opacity={state.simulation ? 1 : 0}>
          <text x="792" y="408" textAnchor="end" fill={paused ? "#3DD68C" : "#FF4D5E"} fontFamily="var(--font-wr-display), sans-serif" fontSize="30" fontWeight="700">
            {state.simulation ? loss : ""}
          </text>
          <text x="792" y="430" textAnchor="end" fill={paused ? "#3DD68C" : "#FF8A95"} fontFamily="var(--font-wr-sans), sans-serif" fontSize="12.5">
            {paused ? "prevented by the pause" : "if the strike lands"}
          </text>
          <text x="792" y="448" textAnchor="end" fill="#8591A3" fontFamily="var(--font-wr-mono), monospace" fontSize="11">
            simulated · nothing sent
          </text>
        </g>
        <rect ref={beam} x="154" y="244" width="0" height="12" rx="6" fill="url(#beam)" filter="url(#glow)" />
        <g ref={fx} />
        <g opacity={struck ? 1 : 0}>
          <text x="250" y="210" textAnchor="middle" fill="#FF4D5E" fontFamily="var(--font-wr-display), sans-serif" fontSize="26" fontWeight="700" letterSpacing="2">
            REVERTED
          </text>
          <text x="250" y="232" textAnchor="middle" fill="#8591A3" fontFamily="var(--font-wr-mono), monospace" fontSize="13">
            {revertSignature(state.strike?.reason)}
          </text>
        </g>
      </svg>
    </>
  );
}

function burst(group: SVGGElement, x: number, y: number, color: string, count: number, speed: number) {
  for (let i = 0; i < count; i += 1) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    node.setAttribute("r", String(1.5 + Math.random() * 3));
    node.setAttribute("fill", color);
    group.appendChild(node);
    const angle = Math.random() * Math.PI * 2;
    const velocity = speed * (0.4 + Math.random());
    let px = x;
    let py = y;
    let vx = Math.cos(angle) * velocity;
    let vy = Math.sin(angle) * velocity;
    let life = 1;
    const frame = () => {
      px += vx;
      py += vy;
      vy += 0.12;
      life -= 0.025;
      node.setAttribute("cx", String(px));
      node.setAttribute("cy", String(py));
      node.setAttribute("opacity", String(Math.max(life, 0)));
      if (life > 0) requestAnimationFrame(frame);
      else node.remove();
    };
    requestAnimationFrame(frame);
  }
}

function packet(group: SVGGElement, color: string, done: () => void) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  node.setAttribute("r", "7");
  node.setAttribute("fill", color);
  node.setAttribute("filter", "url(#glow)");
  group.appendChild(node);
  let x = 154;
  const frame = () => {
    x += 9;
    node.setAttribute("cx", String(x));
    node.setAttribute("cy", "250");
    if (x < 408) requestAnimationFrame(frame);
    else {
      node.remove();
      done();
    }
  };
  requestAnimationFrame(frame);
}
