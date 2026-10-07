import { LoginForm } from "@/components/auth/LoginForm";
import { PublicDemoAuth } from "@/components/auth/PublicDemoAuth";
import { PUBLIC_MODE } from "@/lib/chains";

export default function LoginPage() {
  if (PUBLIC_MODE) return <PublicDemoAuth />;
  return <LoginForm />;
}
