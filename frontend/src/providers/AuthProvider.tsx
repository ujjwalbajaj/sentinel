"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { api, ApiError, setToken } from "@/lib/api";
import type { AccountRole } from "@/lib/types";

export type Session = {
  address: string;
  name: string;
  org: string;
  role: AccountRole;
  onboarded: boolean;
  twoFactor: boolean;
};

type VerifyResult =
  | { ok: true; profileComplete: boolean; onboarded: boolean }
  | { ok: false; error: string };

type AuthContextValue = {
  ready: boolean;
  session: Session | null;
  verifySiwe: (message: string, signature: string) => Promise<VerifyResult>;
  saveProfile: (input: { name: string; org: string; role: AccountRole }) => Promise<string | null>;
  logout: () => void;
  updateSession: (patch: Partial<Pick<Session, "name" | "org" | "role" | "twoFactor" | "onboarded">>) => void;
  deleteAccount: () => Promise<void>;
  hasEmail: (email: string) => boolean;
  setPassword: (email: string, password: string) => string | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const PROFILE_KEY = "sentinel.profile";

function readSession(raw: Record<string, unknown>): Session {
  return {
    address: String(raw.address ?? ""),
    name: String(raw.name ?? ""),
    org: String(raw.organisation ?? raw.org ?? ""),
    role: (String(raw.role ?? "Founder") as AccountRole) || "Founder",
    onboarded: Boolean(raw.onboarded),
    twoFactor: Boolean(raw.twoFactor),
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api<Record<string, unknown>>("/auth/session")
      .then((body) => {
        const next = readSession({ ...body, address: body.walletAddress ?? body.address });
        sessionStorage.setItem(PROFILE_KEY, JSON.stringify(next));
        setSession(next);
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          sessionStorage.removeItem(PROFILE_KEY);
          setSession(null);
        }
      })
      .finally(() => setReady(true));
  }, []);

  const value: AuthContextValue = {
    ready,
    session,
    hasEmail: () => false,
    setPassword: () => "Email sign-in is coming soon.",
    verifySiwe: async (message, signature) => {
      try {
        const body = await api<Record<string, unknown>>("/auth/verify", {
          method: "POST",
          body: JSON.stringify({ message, signature }),
        });
        const session = readSession({ ...body, address: body.walletAddress ?? body.address });
        sessionStorage.setItem(PROFILE_KEY, JSON.stringify(session));
        setSession(session);
        const profileComplete = Boolean(session.name.trim() && session.org.trim());
        return { ok: true, profileComplete, onboarded: Boolean(body.onboarded) };
      } catch (error) {
        const messageText = error instanceof Error ? error.message : "Backend offline.";
        return { ok: false, error: messageText };
      }
    },
    saveProfile: async (input) => {
      try {
        const body = await api<Record<string, unknown>>("/auth/profile", {
          method: "POST",
          body: JSON.stringify({ name: input.name, org: input.org, role: input.role }),
        });
        const next = readSession({ ...body, address: body.walletAddress ?? body.address ?? session?.address, onboarded: body.onboarded ?? session?.onboarded ?? false });
        sessionStorage.setItem(PROFILE_KEY, JSON.stringify(next));
        setSession(next);
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : "Could not save the profile.";
      }
    },
    logout: () => {
      setToken(null);
      sessionStorage.removeItem(PROFILE_KEY);
      setSession(null);
    },
    updateSession: (patch) => {
      setSession((current) => (current ? { ...current, ...patch } : current));
      if (patch.name == null && patch.org == null && patch.role == null) return;
      void api("/auth/profile", {
        method: "POST",
        body: JSON.stringify({ name: patch.name, org: patch.org, role: patch.role }),
      }).catch(() => undefined);
    },
    deleteAccount: async () => {
      await api("/auth/account", { method: "DELETE" });
      setToken(null);
      setSession(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
