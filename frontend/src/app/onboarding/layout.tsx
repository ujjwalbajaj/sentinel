import { WalletProviders } from "@/providers/WalletProviders";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <WalletProviders>{children}</WalletProviders>;
}