import Cookies from "js-cookie";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api";

interface ApiOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const token = Cookies.get("token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as {
      message?: string;
    };
    throw new ApiError(res.status, data.message || "Something went wrong");
  }

  return res.json() as Promise<T>;
}

// Auth
export const auth = {
  signup: (email: string, password: string) =>
    request<{ accessToken: string; ingressSlug: string }>("/auth/signup", {
      method: "POST",
      body: { email, password },
    }),
  login: (email: string, password: string) =>
    request<{ accessToken: string; ingressSlug: string }>("/auth/login", {
      method: "POST",
      body: { email, password },
    }),
};

// Endpoints
export interface Endpoint {
  id: string;
  userId: string;
  name: string;
  provider: string;
  forwardUrl: string | null;
  isActive: boolean;
  createdAt: string;
}

export const endpoints = {
  list: () => request<Endpoint[]>("/endpoints"),
  get: (id: string) => request<Endpoint>(`/endpoints/${id}`),
  create: (data: {
    name: string;
    provider: string;
    forwardUrl?: string;
    webhookSecret?: string;
  }) => request<Endpoint>("/endpoints", { method: "POST", body: data }),
  update: (id: string, data: Partial<Endpoint>) =>
    request<Endpoint>(`/endpoints/${id}`, { method: "PATCH", body: data }),
  delete: (id: string) =>
    request<void>(`/endpoints/${id}`, { method: "DELETE" }),
};

// Events
export interface WebhookEvent {
  id: string;
  endpointId: string;
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  rawBody?: string;
  provider: string | null;
  eventType: string | null;
  signatureValid: boolean | null;
  forwardStatus: string;
  forwardCode: number | null;
  forwardBody?: string;
  forwardLatency: number | null;
  isReplay: boolean;
  receivedAt: string;
  createdAt: string;
}

export interface EventsResponse {
  items: WebhookEvent[];
  nextCursor: string | null;
  hasMore: boolean;
}

export const events = {
  list: (params?: Record<string, string>) => {
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<EventsResponse>(`/events${query}`);
  },
  get: (id: string) => request<WebhookEvent>(`/events/${id}`),
  replay: (id: string) =>
    request<WebhookEvent>(`/events/${id}/replay`, { method: "POST" }),
  diff: (id1: string, id2: string) =>
    request<{
      event1: { id: string; body: unknown; receivedAt: string };
      event2: { id: string; body: unknown; receivedAt: string };
      headersDiff: Record<
        string,
        { old: unknown; new: unknown; status: string }
      >;
      bodyDiff: Record<string, { old: unknown; new: unknown; status: string }>;
    }>(`/events/${id1}/diff/${id2}`),
};

// Stats
export interface Stats {
  period: string;
  total: number;
  forwarded: number;
  failed: number;
  skipped: number;
  successRate: number;
  avgLatencyMs: number | null;
  byEventType: { eventType: string; count: number }[];
  byProvider: { provider: string; count: number }[];
}

export const stats = {
  get: (period?: string) =>
    request<Stats>(`/stats${period ? `?period=${period}` : ""}`),
};

export { ApiError };
