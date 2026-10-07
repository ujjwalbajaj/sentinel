type DemoHold = "action" | "run";

let hold: DemoHold | null = null;

export function acquireDemo(next: DemoHold): DemoHold | null {
  if (hold) return hold;
  hold = next;
  return null;
}

export function releaseDemo(): void {
  hold = null;
}
