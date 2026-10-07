import Link from "next/link";
import { PublicHeader } from "@/components/shell/PublicHeader";
import { Card } from "@/components/ui/Card";
import { buttonClass } from "@/lib/utils";

export function PublicDemoAuth() {
  return (
    <>
      <PublicHeader />
      <main className="mx-auto flex min-h-[70vh] max-w-lg items-center px-4 py-10">
        <Card className="w-full">
          <h1 className="font-display text-3xl font-medium">Public demo</h1>
          <p className="mt-2 text-sm leading-6 text-textMuted">Sign-in is disabled on the public demo. Open the War Room or watch the demo.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/app/war-room?chain=56" className={buttonClass.primary}>
              Open War Room
            </Link>
            <Link href="/#demo" className={buttonClass.secondary}>
              Watch the demo
            </Link>
          </div>
        </Card>
      </main>
    </>
  );
}
