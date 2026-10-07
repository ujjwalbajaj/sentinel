import type { Chain, Incident } from "@/lib/types";
import { LocalTime } from "./LocalTime";
import { TxHash } from "./Address";

export function CreStepper({ steps, chain }: { steps: Incident["cre"]; chain: Chain }) {
  return (
    <ol className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
      {steps.map((step, index) => (
        <li key={step.step} className="rounded-control border border-border bg-panel2 p-3">
          <p className="text-xs text-info">Step {index + 1}</p>
          <p className="mt-1 text-sm font-medium">{step.step}</p>
          <div className="mt-2">
            <LocalTime at={step.at} block={step.block} />
          </div>
          {step.txHash ? (
            <div className="mt-1">
              <TxHash hash={step.txHash} chain={chain} />
            </div>
          ) : (
            <p className="mt-1 text-xs text-textMuted">Off-chain</p>
          )}
          {step.result ? <p className="mt-1 text-xs text-safe">Result {step.result}</p> : null}
        </li>
      ))}
    </ol>
  );
}
