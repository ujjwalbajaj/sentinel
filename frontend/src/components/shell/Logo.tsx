import { Shield } from "lucide-react";
import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-display text-lg font-medium tracking-wide text-text">
      <span className="flex h-8 w-8 items-center justify-center rounded-control border border-border bg-panel2">
        <Shield className="h-4 w-4" aria-hidden />
      </span>
      SENTINEL
    </Link>
  );
}
