"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PublicHeader } from "@/components/shell/PublicHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TextInput } from "@/components/ui/Field";
import { issueVerifyCode, readVerifyCode } from "@/lib/verifyCode";
import { useAuth } from "@/providers/AuthProvider";

function useCooldown(startAt = 0) {
  const [left, setLeft] = useState(startAt);
  useEffect(() => {
    if (left <= 0) return undefined;
    const id = window.setTimeout(() => setLeft((value) => value - 1), 1000);
    return () => window.clearTimeout(id);
  }, [left]);
  return { left, restart: () => setLeft(60) };
}

export function VerifyEmailForm() {
  const params = useSearchParams();
  const email = params.get("email") ?? "";
  const router = useRouter();
  const cooldown = useCooldown(60);
  const [issued, setIssued] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!email) return;
    const existing = readVerifyCode(email);
    setIssued(existing || issueVerifyCode(email));
  }, [email]);

  return (
    <>
      <PublicHeader />
      <main className="mx-auto flex min-h-[70vh] max-w-md items-center px-4 py-10">
        <Card className="w-full">
          <h1 className="font-display text-3xl font-medium">Verify email</h1>
          <p className="mt-2 text-sm text-textMuted">
            This build does not send email. The code for {email || "this account"} is shown here.
          </p>
          <p className="mt-4 rounded-control border border-border bg-bg px-4 py-3 text-center font-mono text-3xl tracking-[0.3em] text-text">
            {issued || "······"}
          </p>
          {error ? <p role="alert" className="mt-3 text-sm text-dangerText">{error}</p> : null}
          {note ? <p className="mt-3 text-sm text-safe">{note}</p> : null}
          <form
            className="mt-4 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (code !== issued) {
                setError("That code does not match.");
                setNote("");
                return;
              }
              router.push("/onboarding");
            }}
          >
            <label className="block text-sm">
              Code
              <TextInput className="mt-1 font-mono" inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value)} />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => setCode(issued)} disabled={!issued}>
                Fill code
              </Button>
              <Button type="submit">Continue</Button>
            </div>
          </form>
          <button
            type="button"
            className="mt-4 text-sm text-info disabled:text-textMuted"
            disabled={cooldown.left > 0 || !email}
            onClick={() => {
              const next = issueVerifyCode(email);
              setIssued(next);
              setCode("");
              setError("");
              setNote("A new code is shown above.");
              cooldown.restart();
            }}
          >
            {cooldown.left > 0 ? `New code in ${cooldown.left}s` : "Issue a new code"}
          </button>
        </Card>
      </main>
    </>
  );
}

export function ForgotPasswordForm() {
  const { hasEmail } = useAuth();
  const cooldown = useCooldown();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  return (
    <>
      <PublicHeader />
      <main className="mx-auto flex min-h-[70vh] max-w-md items-center px-4 py-10">
        <Card className="w-full">
          <h1 className="font-display text-3xl font-medium">Forgot password</h1>
          <p className="mt-2 text-sm text-textMuted">Reset stays in this browser. There is no mail server yet.</p>
          {error ? <p role="alert" className="mt-3 text-sm text-dangerText">{error}</p> : null}
          <form
            className="mt-4 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!hasEmail(email.trim())) {
                setError("No account uses that email.");
                setSent(false);
                return;
              }
              setError("");
              setSent(true);
              cooldown.restart();
              sessionStorage.setItem("sentinel.reset", email.trim());
            }}
          >
            <label className="block text-sm">
              Email
              <TextInput className="mt-1" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <Button type="submit">Send reset link</Button>
          </form>
          {sent ? (
            <Link href={`/reset-password?email=${encodeURIComponent(email.trim())}`} className="mt-4 inline-flex text-sm text-info">
              Continue to reset
            </Link>
          ) : null}
          <button
            type="button"
            className="mt-4 block text-sm text-info disabled:text-textMuted"
            disabled={cooldown.left > 0 || !sent}
            onClick={() => cooldown.restart()}
          >
            {cooldown.left > 0 ? `Resend in ${cooldown.left}s` : "Resend link"}
          </button>
        </Card>
      </main>
    </>
  );
}

export function ResetPasswordForm() {
  const params = useSearchParams();
  const email = params.get("email") ?? "";
  const { setPassword } = useAuth();
  const router = useRouter();
  const cooldown = useCooldown();
  const [password, setPasswordValue] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  return (
    <>
      <PublicHeader />
      <main className="mx-auto flex min-h-[70vh] max-w-md items-center px-4 py-10">
        <Card className="w-full">
          <h1 className="font-display text-3xl font-medium">Reset password</h1>
          <p className="mt-2 text-sm text-textMuted">{email || "Enter the account email from the reset link."}</p>
          {error ? <p role="alert" className="mt-3 text-sm text-dangerText">{error}</p> : null}
          {note ? <p className="mt-3 text-sm text-safe">{note}</p> : null}
          <form
            className="mt-4 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (password.length < 8) {
                setError("Use a password of at least 8 characters.");
                return;
              }
              const result = setPassword(email, password);
              if (result) {
                setError(result);
                return;
              }
              router.push("/login");
            }}
          >
            <label className="block text-sm">
              New password
              <TextInput className="mt-1" type="password" value={password} onChange={(event) => setPasswordValue(event.target.value)} />
            </label>
            <Button type="submit">Save password</Button>
          </form>
          <button
            type="button"
            className="mt-4 text-sm text-info disabled:text-textMuted"
            disabled={cooldown.left > 0}
            onClick={() => {
              cooldown.restart();
              setNote("Reset link queued again.");
            }}
          >
            {cooldown.left > 0 ? `Resend in ${cooldown.left}s` : "Resend link"}
          </button>
        </Card>
      </main>
    </>
  );
}
