"use client";

import type { LogLine } from "@/lib/warroom";

const TONE: Record<string, string> = {
  red: "wr-c-red",
  grn: "wr-c-grn",
  blu: "wr-c-blu",
  tea: "wr-c-tea",
  amb: "wr-c-amb",
  muted: "wr-c-muted",
};

export function EventStream({ lines }: { lines: LogLine[] }) {
  const ordered = [...lines].sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
  return (
    <div className="wr-panel wr-stream">
      <div className="wr-ph">
        <h3>Event stream</h3>
        <span className="sub">backend → socket.io /live</span>
      </div>
      <div className="wr-log" aria-live="polite">
        {ordered.map((line) => (
          <div key={line.id} className="ln">
            <span className="ts">{line.time}</span>
            {line.parts.map((part, index) =>
              part.href ? (
                <a key={index} className={part.tone ? TONE[part.tone] : undefined} href={part.href} target="_blank" rel="noreferrer">
                  {part.text}
                </a>
              ) : (
                <span key={index} className={part.tone ? TONE[part.tone] : undefined}>
                  {part.text}
                </span>
              ),
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
