"use client";

import { createContext, useCallback, useContext, useState } from "react";

export type ToastInput =
  | string
  | {
      text: string;
      tone?: "safe" | "danger";
      links?: { href: string; label?: string }[];
    };

const ToastContext = createContext<(message: ToastInput) => void>(() => undefined);

export function useToast() {
  return useContext(ToastContext);
}

function normalize(message: ToastInput) {
  return typeof message === "string" ? { text: message, tone: undefined, links: undefined } : message;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; text: string; tone?: "safe" | "danger"; links?: { href: string; label?: string }[] }[]>([]);

  const push = useCallback((message: ToastInput) => {
    const next = normalize(message);
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current, { id, text: next.text, tone: next.tone, links: next.links }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4200);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-[min(100%-2rem,360px)] flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto rounded-control border px-3 py-2 text-sm ${
              toast.tone === "safe"
                ? "border-safeBorder bg-safeBg text-safe"
                : toast.tone === "danger"
                  ? "border-dangerBorder bg-dangerBg text-dangerText"
                  : "border-border bg-panel2 text-text"
            }`}
          >
            <p>{toast.text}</p>
            {toast.links?.map((link) => (
              <a key={link.href} href={link.href} target="_blank" rel="noreferrer" className="mt-1 block text-info underline">
                {link.label ?? "View transaction"}
              </a>
            ))}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
