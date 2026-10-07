import Link from "next/link";
import { buttonClass } from "@/lib/utils";

export function SignInButton() {
  return (
    <Link href="/login" className={buttonClass.primary}>
      Sign in with Ethereum
    </Link>
  );
}
