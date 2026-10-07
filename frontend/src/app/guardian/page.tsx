import { PublicHeader } from "@/components/shell/PublicHeader";

const source = `interface IGuardian {
    function pause(address target) external;
}

// CAN: pause a protocol that granted PAUSER_ROLE or enabled the module.
// CANNOT: unpause, withdraw, upgrade, or move funds.
// Audit report: [AUDIT REPORT]`;

export default function GuardianPage() {
  return (
    <>
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-4 py-10 lg:px-8">
        <h1 className="font-display text-3xl font-medium">Guardian</h1>
        <p className="mt-3 text-sm text-textMuted">
          Pause-only surface. A wrong admin step can still lock a protocol, so test the wrapper path on a fork first.
        </p>
        <pre className="mt-6 overflow-auto rounded-card border border-border bg-panel p-5 font-mono text-sm">{source}</pre>
      </main>
    </>
  );
}
