import { AppShell } from "@/components/shell/AppShell";
import { WalletProviders } from "@/providers/WalletProviders";

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <WalletProviders>
      <AppShell>{children}</AppShell>
    </WalletProviders>
  );
}
