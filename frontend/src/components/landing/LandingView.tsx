import { Brain, Check, Eye, Hand, X } from "lucide-react";
import Link from "next/link";
import { PublicHeader } from "@/components/shell/PublicHeader";
import { buttonClass } from "@/lib/utils";

const proof = [
  { label: "Probe block 126072959", href: "https://bscscan.com/block/126072959" },
  { label: "Pause tx", href: "https://bscscan.com/tx/0x4121c62ed7b0d2190b425c22c836ba9eca51d6167196c8dbc851682843abb84a" },
  { label: "Strike reverted", href: "https://bscscan.com/tx/0x7a38402d4c9a12315b7a378d200b9ed619d655f90eedef452ae4833d73c07e92" },
];

export function LandingView() {
  return (
    <>
      <PublicHeader />
      <main>
        <section className="mx-auto grid max-w-6xl gap-8 px-4 py-16 lg:px-8 lg:py-24">
          <div className="max-w-3xl">
            <p className="text-sm font-medium text-info">Chainlink CRE · NOWNodes</p>
            <h1 className="mt-3 font-display text-4xl font-medium leading-tight sm:text-6xl">Catch attackers while they&apos;re still setting up.</h1>
            <p className="mt-4 max-w-2xl text-lg text-textMuted">
              Live on BNB Chain and Base mainnet. SENTINEL simulates every suspicious call and pauses your protocol before the strike.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/app/war-room?chain=56" className={buttonClass.primary}>
                Open War Room
              </Link>
              <a href="https://github.com/ujjwalbajaj/sentinel" className={buttonClass.secondary} target="_blank" rel="noreferrer">
                GitHub
              </a>
            </div>
          </div>
          <figure>
            <video className="aspect-video w-full rounded-card border border-border bg-black" controls playsInline poster="/sentinel-demo.jpg" src="/sentinel-demo.mp4" />
            <figcaption className="mt-3 text-sm text-textMuted">Recorded live on BNB Chain mainnet · 6 Oct 2026</figcaption>
            <ul className="mt-4 flex flex-wrap gap-2 text-sm" aria-label="On-chain proof">
              {proof.map((item) => (
                <li key={item.href}>
                  <a className="inline-flex rounded-full border border-border bg-panel px-4 py-2 hover:text-info" href={item.href} target="_blank" rel="noreferrer">
                    {item.label}
                  </a>
                </li>
              ))}
              <li className="inline-flex items-center rounded-full border border-border bg-panel px-4 py-2 font-mono text-xs">
                20.0 s probe→pause · 96/100 · 0 BNB lost
              </li>
            </ul>
          </figure>
        </section>

        <section id="how" className="border-t border-border">
          <div className="mx-auto grid max-w-6xl gap-4 px-4 py-16 md:grid-cols-3 lg:px-8">
            <Column icon={<Eye className="h-5 w-5" aria-hidden />} title="Eyes" body="NOWNodes watchers stream BNB Chain and Base. Suspicious calls are simulated with debug_traceCall." />
            <Column icon={<Brain className="h-5 w-5" aria-hidden />} title="Brain" body="A Chainlink CRE workflow scores the trace in a confidential environment. The rules are not published." />
            <Column icon={<Hand className="h-5 w-5" aria-hidden />} title="Hand" body="On a high-risk verdict the Guardian contract pauses the protocol. It cannot unpause or move funds." />
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto grid max-w-6xl gap-4 px-4 py-16 lg:grid-cols-2 lg:px-8">
            <div>
              <h2 className="font-display text-3xl font-medium">Pause-only permission</h2>
              <p className="mt-3 text-textMuted">The pause decision is a Chainlink CRE consensus, not a call from one server.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-card border border-safeBorder bg-safeBg p-5">
                <p className="text-sm font-medium text-safe">CAN</p>
                <p className="mt-3 flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4" aria-hidden /> Pause the protocol
                </p>
              </div>
              <div className="rounded-card border border-dangerBorder bg-dangerBg p-5">
                <p className="text-sm font-medium text-dangerText">CANNOT</p>
                <ul className="mt-3 space-y-2 text-sm">
                  {["Unpause", "Move funds", "Upgrade contracts"].map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <X className="h-4 w-4" aria-hidden /> {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto flex max-w-6xl flex-wrap gap-3 px-4 py-10 lg:px-8">
            <a className="rounded-full border border-border bg-panel px-4 py-2 text-sm" href="https://basescan.org" target="_blank" rel="noreferrer">
              Base · basescan.org
            </a>
            <a className="rounded-full border border-border bg-panel px-4 py-2 text-sm" href="https://bscscan.com" target="_blank" rel="noreferrer">
              BNB Chain · bscscan.com
            </a>
          </div>
        </section>

        <section id="pricing" className="border-t border-border">
          <div className="mx-auto grid max-w-6xl gap-4 px-4 py-16 lg:grid-cols-2 lg:px-8">
            <div className="rounded-card border border-border bg-panel p-5">
              <h2 className="font-display text-3xl font-medium">&lt; 0.1% of what it protects</h2>
              <p className="mt-3 text-textMuted">0.08% of protected TVL per year, billed monthly.</p>
              <Link href="/signup" className={`${buttonClass.primary} mt-6`}>
                Protect my protocol
              </Link>
            </div>
            <div className="rounded-card border border-border bg-panel p-5">
              <h2 className="font-display text-xl font-medium">USquare</h2>
              <ul className="mt-4 space-y-2 text-sm text-textMuted">
                <li>100 dApps</li>
                <li>Security audits</li>
                <li>ETHSea winners</li>
                <li>PancakeSwap contributors</li>
              </ul>
            </div>
          </div>
        </section>
      </main>
      <footer className="border-t border-border px-4 py-8 text-sm text-textMuted lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <p>© 2026 USquare. SENTINEL.</p>
          <div className="flex gap-4">
            <Link href="/terms">Terms</Link>
            <Link href="/guardian">Guardian source</Link>
            <Link href="/login">Log in</Link>
          </div>
        </div>
      </footer>
    </>
  );
}

function Column({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <article className="rounded-card border border-border bg-panel p-5">
      <div className="flex h-11 w-11 items-center justify-center rounded-control border border-border bg-panel2">{icon}</div>
      <h2 className="mt-4 font-display text-xl font-medium">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-textMuted">{body}</p>
    </article>
  );
}
