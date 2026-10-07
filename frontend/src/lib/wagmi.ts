import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "viem";
import { base, bsc } from "wagmi/chains";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "00000000000000000000000000000000";
const baseRpc = process.env.NEXT_PUBLIC_BASE_RPC || "https://mainnet.base.org";
const bscRpc = process.env.NEXT_PUBLIC_BSC_RPC || "https://bsc-dataseed.bnbchain.org";

export const wagmiConfig = getDefaultConfig({
  appName: "SENTINEL",
  projectId,
  chains: [base, bsc],
  transports: {
    [base.id]: http(baseRpc),
    [bsc.id]: http(bscRpc),
  },
  ssr: true,
});

export const SUPPORTED_CHAIN_IDS = [base.id, bsc.id] as const;
