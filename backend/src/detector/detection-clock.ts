interface BlockClock {
  headArrivedAt?: string;
  wssArrivedAt?: string;
  headLogsAt?: string;
}

const clocks = new Map<string, BlockClock>();

function key(chainId: number, blockNumber: bigint): string {
  return `${chainId}:${blockNumber}`;
}

function stamp(chainId: number, blockNumber: bigint, field: keyof BlockClock): void {
  const id = key(chainId, blockNumber);
  const current = clocks.get(id) ?? {};
  if (current[field]) return;
  current[field] = new Date().toISOString();
  clocks.delete(id);
  clocks.set(id, current);
  while (clocks.size > 400) {
    const oldest = clocks.keys().next().value;
    if (oldest == null) break;
    clocks.delete(oldest);
  }
}

export function noteHeadArrived(chainId: number, blockNumber: bigint): void {
  stamp(chainId, blockNumber, "headArrivedAt");
}

export function noteWssLog(chainId: number, blockNumber: bigint): void {
  stamp(chainId, blockNumber, "wssArrivedAt");
}

export function noteHeadLogs(chainId: number, blockNumber: bigint): void {
  stamp(chainId, blockNumber, "headLogsAt");
}

export function detectionClock(chainId: number, blockNumber: bigint): BlockClock {
  return clocks.get(key(chainId, blockNumber)) ?? {};
}
