export interface CallFrame {
  type: string;
  from?: string;
  to?: string;
  input?: string;
  output?: string;
  value?: string;
  error?: string;
  calls?: CallFrame[];
}

export interface StateDiff {
  pre?: Record<string, { balance?: string }>;
  post?: Record<string, { balance?: string }>;
}

export function truncateTrace(frame: CallFrame, depth: number): CallFrame {
  if (depth <= 0) {
    const children = frame.calls?.length ?? 0;
    return {
      ...frame,
      calls: children > 0 ? [{ type: "TRUNCATED", from: frame.to, to: "", input: `${children} child calls omitted` }] : [],
    };
  }
  return {
    ...frame,
    calls: (frame.calls ?? []).map((child) => truncateTrace(child, depth - 1)),
  };
}
