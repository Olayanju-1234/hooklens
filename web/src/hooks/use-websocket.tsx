"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { io, Socket } from "socket.io-client";
import Cookies from "js-cookie";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "http://localhost:3000";

export interface LiveEvent {
  id: string;
  provider: string | null;
  eventType: string | null;
  signatureValid: boolean | null;
  receivedAt: string;
  forwardStatus: string;
  method: string;
  path: string;
  bodyPreview: string;
  forwardCode?: number | null;
  forwardLatency?: number | null;
  attempts?: number;
}

export interface ForwardResult {
  eventId: string;
  forwardStatus: string;
  forwardCode: number | null;
  forwardLatency: number | null;
}

export type SocketMessage =
  | { kind: "webhook"; event: LiveEvent }
  | { kind: "forward_result"; result: ForwardResult };

interface WebSocketContextType {
  connected: boolean;
  liveEvents: LiveEvent[];
  clearEvents: () => void;
  addEvents: (events: LiveEvent[]) => void;
  removeEvent: (id: string) => void;
  /** Raw socket messages as they arrive, for views that animate per message. */
  subscribe: (fn: (m: SocketMessage) => void) => () => void;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const listeners = useRef(new Set<(m: SocketMessage) => void>());
  const [connected, setConnected] = useState(false);
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);

  const updateForwardStatus = useCallback((result: ForwardResult) => {
    setLiveEvents((prev) =>
      prev.map((e) =>
        e.id === result.eventId
          ? {
              ...e,
              forwardStatus: result.forwardStatus,
              forwardCode: result.forwardCode,
              forwardLatency: result.forwardLatency,
              attempts: (e.attempts ?? 0) + 1,
            }
          : e,
      ),
    );
  }, []);

  useEffect(() => {
    const token = Cookies.get("token");
    if (!token) return;

    const socket = io(`${WS_URL}/live`, {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("webhook", (event: LiveEvent) => {
      setLiveEvents((prev) => [event, ...prev.filter((e) => e.id !== event.id)].slice(0, 100));
      listeners.current.forEach((fn) => fn({ kind: "webhook", event }));
    });

    socket.on("forward_result", (result: ForwardResult) => {
      updateForwardStatus(result);
      listeners.current.forEach((fn) => fn({ kind: "forward_result", result }));
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, [updateForwardStatus]);

  const clearEvents = useCallback(() => setLiveEvents([]), []);

  const addEvents = useCallback((events: LiveEvent[]) => {
    setLiveEvents((prev) => {
      const ids = new Set(prev.map((e) => e.id));
      const newEvents = events.filter((e) => !ids.has(e.id));
      if (newEvents.length === 0) return prev;
      return [...newEvents, ...prev].slice(0, 100);
    });
  }, []);

  const removeEvent = useCallback((id: string) => {
    setLiveEvents((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const subscribe = useCallback((fn: (m: SocketMessage) => void) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);

  return (
    <WebSocketContext.Provider
      value={{ connected, liveEvents, clearEvents, addEvents, removeEvent, subscribe }}
    >
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const ctx = useContext(WebSocketContext);
  if (!ctx)
    throw new Error("useWebSocket must be used within WebSocketProvider");
  return ctx;
}
