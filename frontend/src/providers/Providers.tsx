"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useMemo, useState } from "react";
import { AuthProvider } from "./AuthProvider";
import { ToastProvider } from "./ToastProvider";
import { SystemProvider } from "./SystemProvider";

type TitleContextValue = { title: string; setTitle: (title: string) => void };

const TitleContext = createContext<TitleContextValue>({ title: "", setTitle: () => undefined });

export function usePageTitleState() {
  return useContext(TitleContext);
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: Infinity, refetchOnWindowFocus: false } },
      }),
  );
  const [title, setTitle] = useState("");
  const titleValue = useMemo(() => ({ title, setTitle }), [title]);

  return (
    <TitleContext.Provider value={titleValue}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SystemProvider>
            <ToastProvider>{children}</ToastProvider>
          </SystemProvider>
        </AuthProvider>
      </QueryClientProvider>
    </TitleContext.Provider>
  );
}
