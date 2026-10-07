import { PublicDemoAuth } from "@/components/auth/PublicDemoAuth";
import { SignupForm } from "@/components/auth/SignupForm";
import { PUBLIC_MODE } from "@/lib/chains";

export default function SignupPage() {
  if (PUBLIC_MODE) return <PublicDemoAuth />;
  return <SignupForm />;
}
