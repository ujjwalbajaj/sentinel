"use client";

import { useEffect, useState } from "react";

export function LocalTime({ at, block, withDate = false }: { at: string; block: number; withDate?: boolean }) {
  const [text, setText] = useState("…");

  useEffect(() => {
    const date = new Date(at);
    if (Number.isNaN(date.getTime())) {
      setText("—");
      return;
    }
    setText(
      withDate
        ? date.toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            second: "2-digit",
          })
        : date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" }),
    );
  }, [at, withDate]);

  const parsed = new Date(at);
  const utc = Number.isNaN(parsed.getTime()) ? "—" : `${parsed.toISOString().replace(".000Z", " UTC")}${block ? ` · block ${block}` : ""}`;

  return (
    <time dateTime={at} title={utc} className="group relative font-mono text-sm text-text">
      {text}
      <span className="pointer-events-none absolute left-0 top-full z-20 mt-1 hidden w-max rounded-control border border-border bg-panel2 px-2 py-1 text-xs text-textMuted group-hover:block group-focus:block">
        {utc}
      </span>
    </time>
  );
}
