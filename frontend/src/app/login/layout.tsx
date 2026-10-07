import { WalletProviders } from "@/providers/WalletProviders";

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <WalletProviders>{children}</WalletProviders>;
}
