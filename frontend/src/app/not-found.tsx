import Link from "next/link";
import { PublicHeader } from "@/components/shell/PublicHeader";
import { buttonClass } from "@/lib/utils";

export default function NotFound() {
  return (
    <>
      <PublicHeader />
      <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-start justify-center px-4">
        <p className="text-sm text-textMuted">404</p>
        <h1 className="mt-2 font-display text-3xl font-medium">This page is not in the console.</h1>
        <p className="mt-2 text-sm text-textMuted">The link may be old, or the incident was removed from this browser.</p>
        <div className="mt-6 flex gap-2">
          <Link href="/" className={buttonClass.secondary}>
            Home
          </Link>
          <Link href="/app" className={buttonClass.primary}>
            Overview
          </Link>
        </div>
      </main>
    </>
  );
}
