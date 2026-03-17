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

interface LiveEvent {
  id: string;
  provider: string | null;
  eventType: string | null;
  signatureValid: boolean | null;
  receivedAt: string;
  forwardStatus: string;
  method: string;
  path: string;
  bodyPreview: string;
}

interface ForwardResult {
  eventId: string;
  forwardStatus: string;
  forwardCode: number | null;
  forwardLatency: number | null;
}

interface WebSocketContextType {
  connected: boolean;
  liveEvents: LiveEvent[];
  clearEvents: () => void;
  addEvents: (events: LiveEvent[]) => void;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);

  const updateForwardStatus = useCallback((result: ForwardResult) => {
    setLiveEvents((prev) =>
      prev.map((e) =>
        e.id === result.eventId
          ? { ...e, forwardStatus: result.forwardStatus }
          : e,
      ),
    );
  }, []);

  useEffect(() => {
    const token = Cookies.get("token");
    if (!token) return;

    const socket = io(`${WS_URL}/live`, {
      auth: { token },
      transports: ["websocket"],
    });

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("webhook", (event: LiveEvent) => {
      setLiveEvents((prev) => [event, ...prev].slice(0, 100));
    });

    socket.on("forward_result", (result: ForwardResult) => {
      updateForwardStatus(result);
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

  return (
    <WebSocketContext.Provider
      value={{ connected, liveEvents, clearEvents, addEvents }}
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
