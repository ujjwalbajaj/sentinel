import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-display text-lg font-medium tracking-wide text-text">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" className="h-8 w-8 shrink-0" aria-hidden>
        <rect width="64" height="64" rx="14" fill="#0B0F14" />
        <path d="M32 8 L52 15 V31 C52 44 43 53 32 57 C21 53 12 44 12 31 V15 Z" fill="none" stroke="#3DDC97" strokeWidth="4.5" strokeLinejoin="round" />
        <path d="M23 32 L29.5 38.5 L42 26" fill="none" stroke="#3DDC97" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      SENTINEL
    </Link>
  );
}
