import { ArrowDown, ArrowRight, Check, X } from "lucide-react";
import Link from "next/link";
import { PublicHeader } from "@/components/shell/PublicHeader";
import { PUBLIC_MODE } from "@/lib/chains";
import { buttonClass } from "@/lib/utils";

const GITHUB = "https://github.com/ujjwalbajaj/sentinel";
const DRIVE = "https://drive.google.com/file/d/1MaewP4XTpBDA78kOE4kt85nXGQ5llXms/view?usp=sharing";
const PAUSE_TX = "https://bscscan.com/tx/0x4121c62ed7b0d2190b425c22c836ba9eca51d6167196c8dbc851682843abb84a";
const STRIKE_TX = "https://bscscan.com/tx/0x7a38402d4c9a12315b7a378d200b9ed619d655f90eedef452ae4833d73c07e92";
const PROBE_BLOCK = "https://bscscan.com/block/126072959";

const proof = [
  { label: "Probe block 126072959", href: PROBE_BLOCK },
  { label: "Pause tx", href: PAUSE_TX },
  { label: "Strike reverted", href: STRIKE_TX },
];

const rehearsal = [
  { n: "1", title: "Fund", body: "Fresh wallet via a mixer", tone: "border-border", titleTone: "text-text" },
  { n: "2", title: "Deploy", body: "The exploit contract", tone: "border-border", titleTone: "text-text" },
  { n: "3", title: "Test", body: "A small probe", tone: "border-warn", titleTone: "text-warn" },
  { n: "4", title: "Strike", body: "The real attack", tone: "border-dangerBorder", titleTone: "text-dangerText" },
];

const pillars = [
  {
    kicker: "Eyes · NOWNodes",
    tone: "text-[#2FD1C5]",
    points: [
      "WebSockets newHeads + logs",
      "eth_getLogs scans",
      "debug_traceTransaction (callTracer) to catch re-entry",
      "debug_traceCall prestate diff to simulate the strike",
      "Wallet forensics from mixer events",
      "Chainlink price feeds read through NOWNodes RPC",
      "BNB Chain + Base",
    ],
  },
  {
    kicker: "Brain · Chainlink CRE",
    tone: "text-info",
    points: [
      "Deterministic rules → score. Re-entry +30, loss ≥20% +30, mixer gas +20, wallet <1h +16 = 96.",
      "Threshold 80.",
      "Hard guard: no pause without a hard signal and ≥5% simulated loss.",
      "Signs a report (vault, score, incidentId).",
    ],
  },
  {
    kicker: "Hand · Guardian contract",
    tone: "text-[#3DDC97]",
    points: [
      "Accepts reports only from the forwarder, then calls pause().",
      "Cannot unpause, move funds, or upgrade.",
      "Onboarding = 2 transactions: grantRole(PAUSER_ROLE) + registerVault.",
    ],
  },
];

const threats = [
  "Oracle / price manipulation",
  "Flash-loan attacks",
  "Governance takeovers",
  "Malicious upgrades",
  "Infinite mints",
  "Approval drains",
  "Access-control exploits",
  "Bridge drains",
  "Copycat attacks",
  "Cross-chain spread",
];

const compare = [
  { title: "Monitoring tools", body: "Alert a human. Minutes to hours.", tone: "border-border" },
  { title: "Private bot", body: "One server, one hot key.", tone: "border-border" },
  { title: "SENTINEL", body: "Simulates, acts in seconds, can only pause. Decision by Chainlink CRE.", tone: "border-safeBorder bg-safeBg" },
];

const stats = [
  { value: "20.0 s", label: "probe → pause" },
  { value: "96/100", label: "CRE risk score" },
  { value: "−89%", label: "simulated loss if it landed" },
  { value: "0 BNB", label: "lost" },
];

export function LandingView() {
  return (
    <div className="overflow-x-clip">
      <PublicHeader />
      <main>
        <section className="mx-auto grid max-w-6xl gap-8 px-4 py-16 lg:px-8 lg:py-24">
          <div className="max-w-3xl">
            <p className="text-sm font-medium text-info">
              {PUBLIC_MODE ? "The airbag of DeFi · Chainlink CRE · NOWNodes" : "Chainlink CRE · NOWNodes"}
            </p>
            <h1 className="mt-3 font-display text-4xl font-medium leading-tight sm:text-6xl">Catch attackers while they&apos;re still setting up.</h1>
            <p className="mt-4 max-w-2xl text-lg text-textMuted">
              Live on BNB Chain and Base mainnet. SENTINEL simulates every suspicious call and pauses your protocol before the strike.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/app/war-room?chain=56" className={buttonClass.primary}>
                Open War Room
              </Link>
              <a href={GITHUB} className={buttonClass.secondary} target="_blank" rel="noreferrer">
                GitHub
              </a>
            </div>
          </div>
          {PUBLIC_MODE ? <JudgeNotice /> : null}
          <figure id="demo" className="min-w-0 scroll-mt-6">
            <video className="aspect-video w-full rounded-card border border-border bg-black" controls playsInline poster="/sentinel-demo.jpg" src="/sentinel-demo.mp4" />
            <figcaption className="mt-3 text-sm text-textMuted">Recorded live on BNB Chain mainnet · 6 Oct 2026</figcaption>
            <ul className="mt-4 flex flex-wrap gap-2 text-sm" aria-label="On-chain proof">
              {proof.map((item) => (
                <li key={item.href} className="max-w-full">
                  <a className="inline-flex max-w-full rounded-full border border-border bg-panel px-4 py-2 hover:text-info" href={item.href} target="_blank" rel="noreferrer">
                    {item.label}
                  </a>
                </li>
              ))}
              <li className="inline-flex max-w-full items-center rounded-full border border-border bg-panel px-4 py-2 font-mono text-xs">
                20.0 s probe→pause · 96/100 · 0 BNB lost
              </li>
            </ul>
          </figure>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto max-w-6xl px-4 py-16 lg:px-8">
            <h2 className="font-display text-3xl font-medium">Every big hack has a rehearsal.</h2>
            <ol className="mt-8 flex flex-col gap-3 md:flex-row md:items-stretch">
              {rehearsal.map((step, index) => (
                <li key={step.n} className="flex min-w-0 flex-1 flex-col items-stretch gap-3 md:flex-row md:items-center">
                  <article className={`min-w-0 flex-1 rounded-card border bg-panel p-5 ${step.tone}`}>
                    <p className="font-mono text-xs text-textMuted">{step.n}</p>
                    <h3 className={`mt-2 font-display text-xl font-medium ${step.titleTone}`}>{step.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-textMuted">{step.body}</p>
                  </article>
                  {index < rehearsal.length - 1 ? (
                    <span className="flex shrink-0 items-center justify-center text-textMuted" aria-hidden>
                      <ArrowDown className="h-4 w-4 md:hidden" />
                      <ArrowRight className="hidden h-4 w-4 md:block" />
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
            <p className="mt-6 max-w-3xl text-sm leading-6 text-textMuted">
              Today the window between test and strike is wasted on a 3 AM alert and a multisig. SENTINEL uses it.
            </p>
          </div>
        </section>

        <section id="how" className="scroll-mt-6 border-t border-border">
          <div className="mx-auto max-w-6xl px-4 py-16 lg:px-8">
            <h2 className="font-display text-3xl font-medium">Eyes · Brain · Hand</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {pillars.map((pillar) => (
                <article key={pillar.kicker} className="min-w-0 rounded-card border border-border bg-panel p-5">
                  <h3 className={`font-display text-lg font-medium ${pillar.tone}`}>{pillar.kicker}</h3>
                  <ul className="mt-4 space-y-2 text-sm leading-6 text-textMuted">
                    {pillar.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto max-w-6xl px-4 py-16 lg:px-8">
            <h2 className="font-display text-3xl font-medium">Proof on BNB Chain mainnet · 6 Oct 2026</h2>
            <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
              {stats.map((stat) => (
                <article key={stat.value} className="min-w-0 rounded-card border border-border bg-panel p-5">
                  <p className="font-display text-3xl font-medium tabular-nums sm:text-4xl">{stat.value}</p>
                  <p className="mt-2 text-sm text-textMuted">{stat.label}</p>
                </article>
              ))}
            </div>
            <ul className="mt-6 flex flex-wrap gap-2 text-sm">
              <li>
                <a className="inline-flex rounded-full border border-border bg-panel px-4 py-2 hover:text-info" href={PAUSE_TX} target="_blank" rel="noreferrer">
                  Pause tx
                </a>
              </li>
              <li>
                <a className="inline-flex rounded-full border border-border bg-panel px-4 py-2 hover:text-info" href={STRIKE_TX} target="_blank" rel="noreferrer">
                  Strike reverted (EnforcedPause)
                </a>
              </li>
              <li>
                <a className="inline-flex rounded-full border border-border bg-panel px-4 py-2 hover:text-info" href={PROBE_BLOCK} target="_blank" rel="noreferrer">
                  Probe block
                </a>
              </li>
            </ul>
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto max-w-6xl px-4 py-16 lg:px-8">
            <h2 className="font-display text-3xl font-medium">Re-entrancy is the tip of the iceberg.</h2>
            <ul className="mt-8 flex flex-wrap gap-2">
              {threats.map((threat) => (
                <li key={threat} className="rounded-full border border-border bg-panel px-4 py-2 text-sm">
                  {threat}
                </li>
              ))}
            </ul>
            <p className="mt-6 max-w-3xl text-sm leading-6 text-textMuted">
              They all test before they strike. Each becomes a new rule in the same CRE workflow. Any protocol with a pause switch plugs in.
            </p>
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto max-w-6xl px-4 py-16 lg:px-8">
            <h2 className="font-display text-3xl font-medium">Alert vs. doer</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {compare.map((column) => (
                <article key={column.title} className={`min-w-0 rounded-card border bg-panel p-5 ${column.tone}`}>
                  <h3 className="font-display text-xl font-medium">{column.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-textMuted">{column.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border bg-panel">
          <div className="mx-auto max-w-4xl px-4 py-16 text-center lg:px-8 lg:py-24">
            <p className="font-display text-3xl font-medium leading-tight sm:text-5xl">You don&apos;t call the airbag during the crash. It fires on its own.</p>
            <p className="mt-6 text-sm leading-6 text-textMuted">
              Built at TOKEN2049 Singapore Origins Hackathon by Team USquare · Ujjwal Bajaj, CEO, USquare Newtech Pvt Ltd.
            </p>
          </div>
        </section>

        {PUBLIC_MODE ? null : (
          <>
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
          </>
        )}
      </main>
      <footer className="border-t border-border px-4 py-8 text-sm text-textMuted lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <p>© 2026 USquare. SENTINEL.</p>
          <div className="flex flex-wrap gap-4">
            <Link href="/terms">Terms</Link>
            <Link href="/guardian">Guardian source</Link>
            <Link href="/login">Log in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function JudgeNotice() {
  return (
    <aside className="rounded-card border border-warn bg-warnBg p-5">
      <h2 className="font-display text-lg font-medium text-warn">For hackathon judges</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-text">
        This is a public, read-only build. Launching a live attack needs the Chainlink CRE workflow running with broadcast access, so the simulator is disabled here. Watch the 3-minute demo below (recorded live on BNB Chain mainnet), check the proof links, and read the code on GitHub.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <a href="#demo" className={buttonClass.primary}>
          Watch demo
        </a>
        <a href={GITHUB} className={buttonClass.secondary} target="_blank" rel="noreferrer">
          GitHub
        </a>
        <a href={DRIVE} className={buttonClass.secondary} target="_blank" rel="noreferrer">
          Drive video
        </a>
      </div>
    </aside>
  );
}
