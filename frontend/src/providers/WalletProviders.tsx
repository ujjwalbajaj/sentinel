"use client";

import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import "@rainbow-me/rainbowkit/styles.css";
import { wagmiConfig } from "@/lib/wagmi";

export function WalletProviders({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <RainbowKitProvider
        theme={darkTheme({
          accentColor: "#E6E9EF",
          accentColorForeground: "#0B0E13",
          borderRadius: "medium",
          overlayBlur: "none",
        })}
      >
        {children}
      </RainbowKitProvider>
    </WagmiProvider>
  );
}
