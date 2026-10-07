"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { buttonClass } from "@/lib/utils";
import { shortAddress } from "@/lib/utils";

export function WalletButton() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, authenticationStatus, mounted }) => {
        const ready = mounted && authenticationStatus !== "loading";
        return (
          <div
            {...(!ready && {
              "aria-hidden": true,
              style: { opacity: 0, pointerEvents: "none" as const, userSelect: "none" as const },
            })}
          >
            {(() => {
              if (!mounted || !account || !chain) {
                return (
                  <button type="button" onClick={openConnectModal} className={buttonClass.primary}>
                    Connect wallet
                  </button>
                );
              }
              if (chain.unsupported) {
                return (
                  <button type="button" onClick={openChainModal} className={buttonClass.danger}>
                    Wrong network
                  </button>
                );
              }
              return (
                <button type="button" onClick={openAccountModal} className={buttonClass.secondary}>
                  {shortAddress(account.address)}
                </button>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
