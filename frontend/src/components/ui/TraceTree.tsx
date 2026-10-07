"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { TraceNode } from "@/lib/types";

export function TraceTree({ nodes }: { nodes: TraceNode[] }) {
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const hidden = new Set<string>();

  nodes.forEach((node, index) => {
    if (hidden.has(node.id) || !closed[node.id]) return;
    for (let cursor = index + 1; cursor < nodes.length; cursor += 1) {
      if (nodes[cursor].depth > node.depth) hidden.add(nodes[cursor].id);
      else break;
    }
  });

  return (
    <ul className="space-y-1 font-mono text-xs">
      {nodes.map((node, index) => {
        if (hidden.has(node.id)) return null;
        const hasChildren = Boolean(nodes[index + 1] && nodes[index + 1].depth > node.depth);
        const flag =
          node.flag === "reentry" ? "re-entry" : node.flag === "late-write" ? "late write" : null;
        return (
          <li key={node.id} style={{ paddingLeft: node.depth * 14 }} className={node.flag === "reentry" ? "text-dangerText" : "text-text"}>
            <div className="flex items-start gap-1">
              {hasChildren ? (
                <button
                  type="button"
                  aria-label={closed[node.id] ? "Expand call" : "Collapse call"}
                  className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded text-textMuted"
                  onClick={() => setClosed((current) => ({ ...current, [node.id]: !current[node.id] }))}
                >
                  <ChevronRight className={`h-3.5 w-3.5 ${closed[node.id] ? "" : "rotate-90"}`} aria-hidden />
                </button>
              ) : (
                <span className="inline-block w-5" />
              )}
              <div>
                <span>{node.call}</span>
                {flag ? <span className={node.flag === "late-write" ? "text-warn" : "text-dangerText"}> {flag}</span> : null}
                {node.note ? <p className="text-textMuted">{node.note}</p> : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
