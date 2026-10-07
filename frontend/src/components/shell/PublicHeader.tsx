import Link from "next/link";
import { buttonClass } from "@/lib/utils";
import { Logo } from "./Logo";

export function PublicHeader() {
  return (
    <header className="flex flex-wrap items-center gap-4 border-b border-border px-4 py-4 lg:px-8">
      <Logo />
      <nav className="ml-auto flex flex-wrap items-center gap-2 text-sm" aria-label="Public">
        <Link href="/#how" className="inline-flex h-11 items-center px-3 text-textMuted hover:text-text">
          How it works
        </Link>
        <Link href="/#pricing" className="inline-flex h-11 items-center px-3 text-textMuted hover:text-text">
          Pricing
        </Link>
        <Link href="/login" className={buttonClass.secondary}>
          Log in
        </Link>
        <Link href="/signup" className={buttonClass.primary}>
          Protect my protocol
        </Link>
      </nav>
    </header>
  );
}
