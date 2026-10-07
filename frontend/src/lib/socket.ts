"use client";

import { io, type Socket } from "socket.io-client";
import { getToken } from "./api";

let socket: Socket | null = null;

export function liveSocket() {
  if (typeof window === "undefined") return null;
  const url = (process.env.NEXT_PUBLIC_WS_URL || "").replace(/\/$/, "");
  if (!url) return null;
  if (!socket) {
    socket = io(`${url}/live`, {
      transports: ["websocket"],
      autoConnect: true,
      withCredentials: true,
      auth: (callback) => callback({ token: getToken() }),
    });
  }
  return socket;
}

export function reconnectLive() {
  const current = liveSocket();
  current?.disconnect();
  current?.connect();
}
