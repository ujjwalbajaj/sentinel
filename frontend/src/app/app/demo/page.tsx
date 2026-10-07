import { notFound } from "next/navigation";
import { DemoConsole } from "@/components/views/DemoConsole";
import { PUBLIC_MODE } from "@/lib/chains";

export default function DemoPage() {
  if (PUBLIC_MODE) {
    return (
      <p className="max-w-xl text-sm text-textMuted">
        Attacks run from our local CRE node; CRE simulation is single-node today, production runs on a Chainlink DON
      </p>
    );
  }
  if (process.env.NEXT_PUBLIC_DEMO !== "true") notFound();
  return <DemoConsole />;
}
