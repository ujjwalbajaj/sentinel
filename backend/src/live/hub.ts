type Emit = (event: string, payload: unknown) => void;

let emit: Emit = (event, payload) => {
  logDrop(event, payload);
};

function logDrop(event: string, payload: unknown): void {
  void event;
  void payload;
}

export function setLiveEmitter(fn: Emit): void {
  emit = fn;
}

export function live(event: string, payload: unknown): void {
  emit(event, payload);
}
