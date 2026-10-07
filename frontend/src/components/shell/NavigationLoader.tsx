"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";

const MIN_VISIBLE_MS = 320;
const SAFETY_MS = 12000;

let pending = false;
let token = 0;
let armedAt = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getPending() {
  return pending;
}

function navigationToken() {
  return token;
}

export function armNavigation() {
  token += 1;
  armedAt = Date.now();
  const current = token;
  if (!pending) {
    pending = true;
    emit();
  }
  window.setTimeout(() => {
    if (token === current) disarm();
  }, SAFETY_MS);
}

function disarm() {
  token += 1;
  if (!pending) return;
  pending = false;
  emit();
}

function normalizePath(path: string) {
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path || "/";
}

function isPageChange(href: string) {
  let url: URL;
  try {
    url = new URL(href, window.location.href);
  } catch {
    return false;
  }
  if (url.origin !== window.location.origin) return false;
  return normalizePath(url.pathname) !== normalizePath(window.location.pathname);
}

function installNavigationListeners() {
  const onClick = (event: MouseEvent) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest("a");
    if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
    const href = anchor.getAttribute("href");
    if (!href || href.startsWith("#")) return;
    if (isPageChange(href)) armNavigation();
  };

  const original = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const navigation = headers.get("RSC") === "1" && headers.get("Next-Router-Prefetch") !== "1" && !headers.get("Next-Action");
    if (navigation) armNavigation();
    return original(input, init);
  };

  document.addEventListener("click", onClick, true);
  return () => {
    document.removeEventListener("click", onClick, true);
    window.fetch = original;
  };
}

export function NavigationLoader() {
  const pathname = usePathname();
  const pendingNow = useSyncExternalStore(subscribe, getPending, () => false);
  const pathRef = useRef(pathname);

  useEffect(() => installNavigationListeners(), []);

  useEffect(() => {
    if (pathRef.current === pathname) return;
    pathRef.current = pathname;
    if (!getPending()) return;
    const seen = navigationToken();
    const wait = Math.max(0, MIN_VISIBLE_MS - (Date.now() - armedAt));
    const timer = window.setTimeout(() => {
      if (navigationToken() === seen) disarm();
    }, wait);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  if (!pendingNow) return null;

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-50 h-1 bg-info" role="progressbar" aria-label="Loading page" />
      <div
        className="fixed inset-0 z-30 flex items-center justify-center bg-bg/70 lg:left-60"
        role="status"
        aria-live="polite"
      >
        <div className="flex flex-col items-center gap-3">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-info" />
          <span className="text-sm text-textMuted">Loading</span>
        </div>
      </div>
    </>
  );
}
