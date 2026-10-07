import { WalletProviders } from "@/providers/WalletProviders";

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return <WalletProviders>{children}</WalletProviders>;
}
