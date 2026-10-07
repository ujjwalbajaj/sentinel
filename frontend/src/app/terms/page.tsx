import { PublicHeader } from "@/components/shell/PublicHeader";

export default function TermsPage() {
  return (
    <>
      <PublicHeader />
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-10 text-sm leading-6 text-textMuted lg:px-8">
        <h1 className="font-display text-3xl font-medium text-text">Terms</h1>
        <p>SENTINEL may pause a protocol that granted pause permission. It cannot unpause, withdraw, or upgrade.</p>
        <p>Pause decisions are a Chainlink CRE consensus. This interface sends pause permission and registration from your wallet. It cannot unpause or move funds.</p>
        <p>You keep admin control. Test owner-wrapper changes on a fork before mainnet.</p>
        <p>Pricing shown in the console is 0.08% of protected TVL per year, billed monthly, until a signed order replaces it.</p>
      </main>
    </>
  );
}
