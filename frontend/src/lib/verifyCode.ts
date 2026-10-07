const KEY = "sentinel.verify";

function readMap(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function randomCode() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(100000 + (bytes[0] % 900000));
}

export function issueVerifyCode(email: string) {
  const code = randomCode();
  const map = readMap();
  map[email.trim().toLowerCase()] = code;
  sessionStorage.setItem(KEY, JSON.stringify(map));
  return code;
}

export function readVerifyCode(email: string) {
  return readMap()[email.trim().toLowerCase()] ?? "";
}
