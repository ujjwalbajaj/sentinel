export interface ChainConfig {
  id: number;
  key: "bnb" | "base";
  label: string;
  selectorName: string;
  /** Production KeystoneForwarder from the Chainlink CRE forwarder directory. */
  forwarder: `0x${string}`;
  /** MockKeystoneForwarder used by `cre workflow simulate --broadcast`. */
  mockForwarder: `0x${string}`;
  host: string;
  rpcEnv: string;
  wsEnv: string;
}

export const CHAINS: ChainConfig[] = [
  {
    id: 97,
    key: "bnb",
    label: "BNB Chain",
    selectorName: "binance_smart_chain-testnet",
    forwarder: "0x76c9cf548b4179F8901cda1f8623568b58215E62",
    mockForwarder: "0xa238e42cb8782808dbb2f37e19859244ec4779b0",
    host: "bsc-testnet.nownodes.io",
    rpcEnv: "BSC_TESTNET_RPC",
    wsEnv: "BSC_TESTNET_WSS",
  },
  {
    id: 84532,
    key: "base",
    label: "Base",
    selectorName: "ethereum-testnet-sepolia-base-1",
    forwarder: "0xF8344CFd5c43616a4366C34E3EEE75af79a74482",
    mockForwarder: "0x82300bd7c3958625581cc2f77bc6464dcecdf3e5",
    host: "base-sepolia.nownodes.io",
    rpcEnv: "BASE_SEPOLIA_RPC",
    wsEnv: "BASE_SEPOLIA_WSS",
  },
];

export function chainById(id: number): ChainConfig | undefined {
  return CHAINS.find((chain) => chain.id === id);
}
