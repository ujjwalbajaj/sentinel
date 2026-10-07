"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChainLanes } from "@/components/warroom/ChainLanes";
import { CreVerdict } from "@/components/warroom/CreVerdict";
import { EventStream } from "@/components/warroom/EventStream";
import { GuardianPanel } from "@/components/warroom/GuardianPanel";
import { OnChainProof } from "@/components/warroom/OnChainProof";
import { OutcomeBanner } from "@/components/warroom/OutcomeBanner";
import { PipelineStepper } from "@/components/warroom/PipelineStepper";
import { ProbeTrace } from "@/components/warroom/ProbeTrace";
import { SignedReport } from "@/components/warroom/SignedReport";
import { SuspectDossier } from "@/components/warroom/SuspectDossier";
import { VaultStage } from "@/components/warroom/VaultStage";
import { WarRoomHeader } from "@/components/warroom/WarRoomHeader";
import { createSfx, type Sfx } from "@/components/warroom/sfx";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useProtocols } from "@/hooks/useSentinel";
import { useVaultReads } from "@/hooks/useVaultReads";
import { api } from "@/lib/api";
import { liveSocket } from "@/lib/socket";
import type { Chain } from "@/lib/types";
import {
  isChainId,
  isWarRoomStage,
  REPLAY_GAP_CAP_MS,
  replayGapLabel,
  incidentInProgress,
  newestChainStages,
  warRoomInitial,
  warRoomReducer,
  type ChainId,
  type WarRoomStage,
} from "@/lib/warroom";
import "@/components/warroom/warroom.css";

export function WarRoomView() {
  usePageTitle("War room");
  const params = useSearchParams();
  const requested = Number(params.get("chain"));
  const focusChain: ChainId = requested === 8453 ? 8453 : 56;
  const focusRef = useRef(focusChain);
  focusRef.current = focusChain;

  const [state, dispatch] = useReducer(warRoomReducer, undefined, warRoomInitial);
  const [sfxOn, setSfxOn] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const [canReplay, setCanReplay] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const stored = useRef<WarRoomStage[]>([]);
  const held = useRef<string | null>(null);
  const timers = useRef<number[]>([]);
  const replaying = useRef(false);
  const sfx = useRef<Sfx | null>(null);
  const prevCues = useRef(state.cues);
  const headsLogged = useRef(0);
  const protocols = useProtocols();
  const focusName: Chain = focusChain === 56 ? "bsc" : "base";
  const vault = (protocols.data ?? []).find((item) => item.chains.includes(focusName));
  const vaultAddress = vault?.contracts.find((contract) => contract.chain === focusName)?.address || state.vaultAddress || "";
  const liveVault = useVaultReads(focusName, vaultAddress || undefined, vault?.guardian);
  const vaultRef = useRef(vaultAddress);
  vaultRef.current = vaultAddress;
  const seenVault = useRef(new Set<string>());
  const [vaultEvents, setVaultEvents] = useState(0);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "f" && event.key !== "F") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      if (target instanceof HTMLElement && target.isContentEditable) return;
      event.preventDefault();
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!state.probeAt || state.pauseAt || reduced) return undefined;
    let frame = 0;
    const tick = () => {
      setNow(Date.now());
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [state.probeAt, state.pauseAt, reduced]);

  useEffect(() => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
    replaying.current = false;
    held.current = null;
    stored.current = [];
    setCanReplay(false);
    setSummary(null);
    dispatch({ type: "reset" });
    let cancel = false;
    void api<{ incidents?: { chainId?: number; stages?: unknown[] }[] }>("/incidents")
      .then((body) => {
        if (cancel) return;
        const stages = newestChainStages(body.incidents ?? [], focusChain);
        const newerLive = stored.current.some((stage) => stage.stage === "probe_detected" && stage.incidentId !== stages[0]?.incidentId);
        if (newerLive) return;
        stored.current = stages;
        setCanReplay(stages.length > 0);
        setSummary(null);
        if (incidentInProgress(stages)) {
          held.current = null;
          dispatch({ type: "hydrate", stages });
          return;
        }
        held.current = stages[0]?.incidentId ?? null;
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [focusChain]);

  useEffect(() => {
    const socket = liveSocket();
    if (!socket) return undefined;

    const onHead = (payload: { chainId?: number; blockNumber?: number; latencyMs?: number; at?: string }) => {
      const chainId = Number(payload.chainId);
      const blockNumber = Number(payload.blockNumber);
      if (!isChainId(chainId) || !Number.isFinite(blockNumber)) return;
      const latency = Number(payload.latencyMs);
      headsLogged.current += 1;
      if (process.env.NODE_ENV === "development" && (headsLogged.current === 1 || headsLogged.current % 10 === 0)) {
        console.info(`[war-room] chain:head count=${headsLogged.current}`, { chainId, blockNumber, latencyMs: payload.latencyMs });
      }
      dispatch({
        type: "chain:head",
        chainId,
        blockNumber,
        latencyMs: Number.isFinite(latency) ? latency : 0,
        at: payload.at,
      });
    };

    const onActivity = (payload: Record<string, unknown>) => {
      const chainId = typeof payload.chainId === "number" ? payload.chainId : Number(payload.chainId);
      if (!Number.isFinite(chainId)) return;
      const txHash = typeof payload.txHash === "string" ? payload.txHash : undefined;
      const activityType = typeof payload.type === "string" ? payload.type : typeof payload.event === "string" ? payload.event : undefined;
      const at = typeof payload.at === "string" ? payload.at : undefined;
      const to = typeof payload.to === "string" ? payload.to.toLowerCase() : "";
      const from = typeof payload.from === "string" ? payload.from.toLowerCase() : "";
      const address = vaultRef.current.toLowerCase();
      if (chainId === focusRef.current && address && to === address) {
        const id = typeof payload.id === "string" ? payload.id : "";
        const key = id || `${txHash ?? ""}:${activityType ?? ""}:${at ?? ""}:${from}:${to}`;
        if (!seenVault.current.has(key)) {
          seenVault.current.add(key);
          setVaultEvents(seenVault.current.size);
        }
      }
      dispatch({
        type: "activity:new",
        chainId,
        txHash,
        activityType,
        at,
      });
    };

    const onStage = (payload: unknown) => {
      if (!isWarRoomStage(payload) || payload.chainId !== focusRef.current) return;
      const current = stored.current;
      const sameIncident = current.length === 0 || current[0].incidentId === payload.incidentId;
      if (!sameIncident && payload.stage === "probe_detected") stored.current = [payload];
      else if (sameIncident) {
        const seen = current.some((item) => item.incidentId === payload.incidentId && item.stage === payload.stage && item.at === payload.at);
        if (!seen) stored.current = [...stored.current, payload];
      }
      setCanReplay(stored.current.length > 0);
      if (payload.stage === "probe_detected" && payload.incidentId !== held.current) {
        held.current = null;
        setSummary(null);
      }
      if (replaying.current) return;
      if (held.current && payload.incidentId === held.current) return;
      dispatch({ type: "warroom:stage", ...payload, mode: "live" });
    };

    socket.on("chain:head", onHead);
    socket.on("activity:new", onActivity);
    socket.on("warroom:stage", onStage);
    return () => {
      socket.off("chain:head", onHead);
      socket.off("activity:new", onActivity);
      socket.off("warroom:stage", onStage);
    };
  }, []);

  useEffect(() => {
    const address = vaultAddress.toLowerCase();
    seenVault.current = new Set();
    setVaultEvents(0);
    if (!address) return undefined;
    let cancel = false;
    void api<{ activity?: { id?: string; chainId?: number; to?: string; from?: string; txHash?: string; type?: string; at?: string }[] }>(
      `/activity?chainId=${focusChain}&limit=200`,
    )
      .then((body) => {
        if (cancel) return;
        const next = new Set(seenVault.current);
        for (const row of body.activity ?? []) {
          if (Number(row.chainId) !== focusChain) continue;
          if (String(row.to ?? "").toLowerCase() !== address) continue;
          const from = String(row.from ?? "").toLowerCase();
          const to = String(row.to ?? "").toLowerCase();
          next.add(row.id || `${row.txHash ?? ""}:${row.type ?? ""}:${row.at ?? ""}:${from}:${to}`);
        }
        seenVault.current = next;
        setVaultEvents(next.size);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [focusChain, vaultAddress]);

  useEffect(() => {
    return () => {
      timers.current.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  useEffect(() => {
    const before = prevCues.current;
    prevCues.current = state.cues;
    if (!sfxOn || reduced || state.playback === "instant") return;
    const audio = sfx.current ?? createSfx();
    sfx.current = audio;
    if (state.cues.probe > before.probe) audio.alarm();
    if (state.cues.trace > before.trace) audio.tick();
    if (state.cues.verdict > before.verdict) audio.verdict();
    if (state.cues.report > before.report) audio.tick();
    if (state.cues.pause > before.pause && state.verdict?.action !== "rejected") audio.shield();
    if (state.cues.strike > before.strike) audio.shatter();
  }, [state.cues, state.playback, state.verdict, sfxOn, reduced]);

  const animate = !reduced && state.playback !== "instant";
  const rejected = state.verdict?.action === "rejected";
  const seconds = state.pause?.onchainSeconds != null ? state.pause.onchainSeconds : watchSeconds(state.probeAt, state.pause ? state.pauseAt : null, now);
  const watchTip = state.pause?.wallSeconds != null ? `Wall clock ${state.pause.wallSeconds}s` : undefined;
  const watchLabel = !state.probeAt ? "WAITING FOR A PROBE" : state.pause ? "PROBE → PAUSE" : "SINCE THE PROBE";
  const phase = rejected ? "threat" : state.phase;
  const atRest = phase === "calm" && state.playback !== "replay";
  const liveBalance = atRest ? trimAmount(liveVault.data?.balance) : null;
  const livePaused = atRest && liveVault.data?.paused === true;

  const toggleSfx = () => {
    setSfxOn((on) => {
      const next = !on;
      if (next) {
        const audio = sfx.current ?? createSfx();
        sfx.current = audio;
        audio.unlock();
      }
      return next;
    });
  };

  const replay = () => {
    const stages = stored.current.filter((stage) => stage.chainId === focusChain);
    if (!stages.length) return;
    timers.current.forEach((id) => window.clearTimeout(id));
    replaying.current = true;
    dispatch({ type: "reset", playback: "replay" });
    let cursor = 0;
    let previousAt = Date.parse(stages[0].at);
    timers.current = stages.map((stage, index) => {
      const at = Date.parse(stage.at);
      const gap = index === 0 ? 0 : Math.max(0, at - previousAt);
      previousAt = Number.isFinite(at) ? at : previousAt;
      cursor += Math.min(gap, REPLAY_GAP_CAP_MS);
      const delay = cursor;
      const gapLabel = replayGapLabel(stage.stage, gap);
      return window.setTimeout(() => {
        dispatch({
          type: "warroom:stage",
          incidentId: stage.incidentId,
          chainId: stage.chainId,
          stage: stage.stage,
          at: new Date().toISOString(),
          data: stage.data,
          mode: "replay",
          gapLabel,
        });
      }, delay);
    });
    const last = cursor;
    timers.current.push(window.setTimeout(() => {
      replaying.current = false;
    }, last + 30));
  };

  return (
    <div className={`war-room ${phase}`}>
      <div className="vignette" />
      <WarRoomHeader
        phase={phase}
        seconds={seconds}
        watchLabel={watchLabel}
        watchTip={watchTip}
        bscBlock={state.heads[56].block}
        baseBlock={state.heads[8453].block}
        latencyMs={state.latencyMs}
        sfxOn={sfxOn}
        replayLabel="Replay last incident"
        replayDisabled={!canReplay}
        lastIncident={phase === "calm" && state.playback !== "replay" ? summary : null}
        onToggleSfx={toggleSfx}
        onReplay={replay}
      />
      <main className="wr-main">
        <section className="wr-col">
          <ChainLanes bsc={state.lanes[56]} base={state.lanes[8453]} eventCount={vaultEvents} />
          <SuspectDossier suspect={state.suspect} chainId={state.chainId} />
          <ProbeTrace trace={state.trace} motion={animate && state.cues.trace > 0} />
          <EventStream lines={state.log} />
        </section>
        <section className="wr-col">
          <div className="wr-panel wr-hero">
            <VaultStage
              state={state}
              focusChain={focusChain}
              probeMotion={animate && state.cues.probe > 0}
              strikeMotion={animate && state.cues.strike > 0}
              showShield={!rejected}
              idleBalance={liveBalance || vault?.tvlNative || null}
              idleSymbol={liveVault.data?.symbol || vault?.nativeSymbol || null}
              idlePaused={livePaused}
            />
            <OutcomeBanner
              strike={rejected ? null : state.strike}
              pause={state.pause}
              simulation={state.simulation}
              symbol={state.symbol}
              motion={animate && state.cues.strike > 0}
            />
            <PipelineStepper steps={state.steps} />
          </div>
        </section>
        <section className="wr-col">
          <CreVerdict
            verdict={state.verdict}
            creMode={state.creMode}
            timedOut={Boolean(state.timeoutLog)}
            motion={animate && state.cues.verdict > 0}
          />
          <SignedReport report={state.report} motion={animate && state.cues.report > 0} />
          <GuardianPanel
            reportReady={Boolean(state.report)}
            pause={rejected ? null : state.pause}
            strike={state.strike}
            timedOut={Boolean(state.timeoutLog)}
            rejected={rejected}
            livePaused={livePaused}
          />
          <OnChainProof
            chainId={state.chainId ?? focusChain}
            suspect={state.suspect}
            pause={rejected ? null : state.pause}
            strike={state.strike}
            vaultAddress={state.vaultAddress || vaultAddress || null}
            guardianAddress={vault?.guardian}
          />
        </section>
      </main>
      {state.playback === "replay" ? <div className="wr-replay">REPLAY</div> : null}
    </div>
  );
}

function trimAmount(value: string | null | undefined) {
  if (!value) return null;
  return value.includes(".") ? value.replace(/0+$/, "").replace(/\.$/, "") : value;
}

function watchSeconds(probeAt: string | null, pauseAt: string | null, now: number | null) {
  if (!probeAt) return null;
  const start = Date.parse(probeAt);
  if (!Number.isFinite(start)) return null;
  const end = pauseAt ? Date.parse(pauseAt) : (now ?? Date.now());
  if (!Number.isFinite(end)) return null;
  return Math.max(0, (end - start) / 1000);
}
