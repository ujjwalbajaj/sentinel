"use client";

import { useEffect } from "react";
import { usePageTitleState } from "@/providers/Providers";

export function usePageTitle(title: string) {
  const { setTitle } = usePageTitleState();
  useEffect(() => {
    setTitle(title);
    document.title = `${title} · SENTINEL`;
    return () => setTitle("");
  }, [setTitle, title]);
}
