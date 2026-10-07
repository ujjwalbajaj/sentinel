import { Suspense } from "react";
import { VerifyEmailForm } from "@/components/auth/SimpleAuth";

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailForm />
    </Suspense>
  );
}
