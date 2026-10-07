import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatEther } from "viem";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function shortAddress(value: string) {
  if (value.length < 10) return value;
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export function formatUsd(value: number) {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs === 0) return "$0";
  if (abs < 1) return `${sign}$${abs.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}`;
  if (abs < 1000) return `${sign}$${abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (abs >= 1_000_000) {
    const millions = abs / 1_000_000;
    const text = millions.toFixed(1).replace(/\.0$/, "");
    return `${sign}$${text}M`;
  }
  return `${sign}$${Math.round(abs).toLocaleString("en-US")}`;
}

export function formatWei(wei: string) {
  if (!wei) return "";
  try {
    const text = formatEther(BigInt(wei));
    return text.includes(".") ? text.replace(/0+$/, "").replace(/\.$/, "") : text;
  } catch {
    return "";
  }
}

export function weiToUsd(wei: string, reference?: { wei: string; usd: number | null }) {
  if (!wei || !reference?.wei || reference.wei === "0" || reference.usd == null) return null;
  try {
    const value = Number(formatEther(BigInt(wei)));
    const base = Number(formatEther(BigInt(reference.wei)));
    if (!base) return null;
    return (value / base) * reference.usd;
  } catch {
    return null;
  }
}

export function formatPct(part: number, whole: number) {
  if (!whole) return "0%";
  return `${Math.round((part / whole) * 100)}%`;
}

export const inputClass =
  "h-11 w-full rounded-control border border-border bg-bg px-3 text-sm text-text outline-none placeholder:text-textMuted";

export const buttonClass = {
  primary:
    "inline-flex h-11 items-center justify-center gap-2 rounded-control bg-text px-4 text-sm font-medium text-bg transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50",
  secondary:
    "inline-flex h-11 items-center justify-center gap-2 rounded-control border border-border bg-panel px-4 text-sm font-medium text-text transition-colors hover:bg-panel2 disabled:cursor-not-allowed disabled:opacity-50",
  danger:
    "inline-flex h-11 items-center justify-center gap-2 rounded-control bg-danger px-4 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50",
  ghost:
    "inline-flex h-11 items-center justify-center gap-2 rounded-control px-4 text-sm font-medium text-textMuted transition-colors hover:bg-panel2 hover:text-text disabled:cursor-not-allowed disabled:opacity-50",
};
