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
  const workspaceId = Cookies.get("workspaceId");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (workspaceId) {
    headers["x-workspace-id"] = workspaceId;
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
  forgotPassword: (email: string) =>
    request<{ sent: boolean }>("/auth/forgot-password", {
      method: "POST",
      body: { email },
    }),
  resetPassword: (token: string, newPassword: string) =>
    request<{ success: boolean }>("/auth/reset-password", {
      method: "POST",
      body: { token, newPassword },
    }),
  verifyEmail: (token: string) =>
    request<{ success: boolean }>("/auth/verify-email", {
      method: "POST",
      body: { token },
    }),
  me: () =>
    request<UserProfile>("/auth/me"),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ success: boolean }>("/auth/change-password", {
      method: "POST",
      body: { currentPassword, newPassword },
    }),
  updateAvatar: (avatarUrl: string) =>
    request<{ avatarUrl: string }>("/auth/avatar", {
      method: "PATCH",
      body: { avatarUrl },
    }),
  removeAvatar: () =>
    request<{ success: boolean }>("/auth/avatar", {
      method: "DELETE",
    }),
  updateNotifications: (prefs: Partial<NotificationPreferences>) =>
    request<NotificationPreferences>("/auth/notifications", {
      method: "PATCH",
      body: prefs,
    }),
};

export interface NotificationPreferences {
  emailOnFailedForward: boolean;
  emailOnSignatureFailure: boolean;
  emailOnNewMember: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  ingressSlug: string;
  emailVerified: boolean;
  oauthProvider: string | null;
  avatarUrl: string | null;
  notificationPreferences: NotificationPreferences;
  createdAt: string;
}

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
  delete: (id: string) =>
    request<{ deleted: true }>(`/events/${id}`, { method: "DELETE" }),
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

// Workspaces
export interface Workspace {
  id: string;
  name: string;
  slug: string;
  retentionDays: number;
  createdAt: string;
}

export interface WorkspaceMember {
  id: string;
  userId: string;
  email: string;
  role: "owner" | "member";
  createdAt: string;
}

export const workspaces = {
  list: () => request<Workspace[]>("/workspaces"),
  get: (id: string) =>
    request<Workspace & { members: WorkspaceMember[] }>(`/workspaces/${id}`),
  create: (name: string) =>
    request<Workspace>("/workspaces", { method: "POST", body: { name } }),
  update: (id: string, data: Partial<Workspace>) =>
    request<Workspace>(`/workspaces/${id}`, { method: "PATCH", body: data }),
  delete: (id: string) =>
    request<void>(`/workspaces/${id}`, { method: "DELETE" }),
  invite: (id: string, email: string, role?: string) =>
    request<void>(`/workspaces/${id}/invite`, {
      method: "POST",
      body: { email, role },
    }),
  acceptInvite: (token: string) =>
    request<void>(`/workspaces/accept-invite/${token}`, { method: "POST" }),
  removeMember: (workspaceId: string, userId: string) =>
    request<void>(`/workspaces/${workspaceId}/members/${userId}`, {
      method: "DELETE",
    }),
  listInvites: (workspaceId: string) =>
    request<WorkspaceInvite[]>(`/workspaces/${workspaceId}/invites`),
  revokeInvite: (workspaceId: string, inviteId: string) =>
    request<void>(`/workspaces/${workspaceId}/invites/${inviteId}`, {
      method: "DELETE",
    }),
};

export interface WorkspaceInvite {
  id: string;
  workspaceId: string;
  email: string;
  role: string;
  expiresAt: string;
  createdAt: string;
}

// Forward Destinations
export interface ForwardDestination {
  id: string;
  endpointId: string;
  url: string;
  label: string | null;
  isActive: boolean;
  createdAt: string;
}

export const destinations = {
  list: (endpointId: string) =>
    request<ForwardDestination[]>(`/endpoints/${endpointId}/destinations`),
  create: (endpointId: string, data: { url: string; label?: string }) =>
    request<ForwardDestination>(`/endpoints/${endpointId}/destinations`, {
      method: "POST",
      body: data,
    }),
  update: (
    endpointId: string,
    id: string,
    data: Partial<ForwardDestination>,
  ) =>
    request<ForwardDestination>(`/endpoints/${endpointId}/destinations/${id}`, {
      method: "PATCH",
      body: data,
    }),
  delete: (endpointId: string, id: string) =>
    request<void>(`/endpoints/${endpointId}/destinations/${id}`, {
      method: "DELETE",
    }),
};

// Transforms
export interface TransformRule {
  id: string;
  endpointId: string;
  name: string;
  isActive: boolean;
  operations: Array<{
    type: string;
    path: string;
    newPath?: string;
    value?: unknown;
  }>;
  priority: number;
  createdAt: string;
}

export const transforms = {
  list: (endpointId: string) =>
    request<TransformRule[]>(`/endpoints/${endpointId}/transforms`),
  create: (
    endpointId: string,
    data: {
      name: string;
      operations: TransformRule["operations"];
      priority?: number;
    },
  ) =>
    request<TransformRule>(`/endpoints/${endpointId}/transforms`, {
      method: "POST",
      body: data,
    }),
  update: (endpointId: string, id: string, data: Partial<TransformRule>) =>
    request<TransformRule>(`/endpoints/${endpointId}/transforms/${id}`, {
      method: "PATCH",
      body: data,
    }),
  delete: (endpointId: string, id: string) =>
    request<void>(`/endpoints/${endpointId}/transforms/${id}`, {
      method: "DELETE",
    }),
  test: (
    endpointId: string,
    data: {
      operations: TransformRule["operations"];
      body: Record<string, unknown>;
    },
  ) =>
    request<Record<string, unknown>>(
      `/endpoints/${endpointId}/transforms/test`,
      { method: "POST", body: data },
    ),
};

// Alert Channels
export interface AlertChannel {
  id: string;
  type: "slack" | "email" | "discord";
  name: string;
  config: Record<string, string>;
  isActive: boolean;
  createdAt: string;
}

export const alertChannels = {
  list: () => request<AlertChannel[]>("/alert-channels"),
  create: (data: {
    type: string;
    name: string;
    config: Record<string, string>;
  }) =>
    request<AlertChannel>("/alert-channels", { method: "POST", body: data }),
  update: (id: string, data: Partial<AlertChannel>) =>
    request<AlertChannel>(`/alert-channels/${id}`, {
      method: "PATCH",
      body: data,
    }),
  delete: (id: string) =>
    request<void>(`/alert-channels/${id}`, { method: "DELETE" }),
  test: (id: string) =>
    request<void>(`/alert-channels/${id}/test`, { method: "POST" }),
};

// Alert Rules
export interface AlertRule {
  id: string;
  name: string;
  type: "forward_failure" | "signature_failure" | "no_events";
  isActive: boolean;
  config: Record<string, unknown>;
  channels: AlertChannel[];
  createdAt: string;
}

export const alertRules = {
  list: () => request<AlertRule[]>("/alert-rules"),
  create: (data: {
    name: string;
    type: string;
    config: Record<string, unknown>;
    channelIds: string[];
  }) => request<AlertRule>("/alert-rules", { method: "POST", body: data }),
  update: (
    id: string,
    data: Partial<{
      name: string;
      type: string;
      config: Record<string, unknown>;
      isActive: boolean;
      channelIds: string[];
    }>,
  ) => request<AlertRule>(`/alert-rules/${id}`, { method: "PATCH", body: data }),
  delete: (id: string) =>
    request<void>(`/alert-rules/${id}`, { method: "DELETE" }),
};

// Alert History
export interface AlertHistoryEntry {
  id: string;
  alertRuleId: string;
  channelId: string;
  payload: Record<string, unknown> | null;
  sentAt: string;
}

export const alertHistory = {
  list: () => request<AlertHistoryEntry[]>("/alert-history"),
};

// Test Payloads
export interface TestProvider {
  provider: string;
  displayName: string;
  eventCount: number;
}

export interface TestEventType {
  eventType: string;
  description: string;
}

export const testPayloads = {
  providers: () => request<TestProvider[]>("/test-payloads"),
  eventTypes: (provider: string) =>
    request<TestEventType[]>(`/test-payloads/${provider}`),
  payload: (provider: string, eventType: string) =>
    request<{ payload: Record<string, unknown> }>(
      `/test-payloads/${provider}/${eventType}`,
    ),
  send: (provider: string, eventType: string) =>
    request<{ status: string }>(
      `/test-payloads/${provider}/${eventType}/send`,
      { method: "POST" },
    ),
};

// Docs
export interface ProviderDoc {
  provider: string;
  displayName: string;
  description: string;
  signatureHeader: string;
  signatureMethod: string;
  eventCount: number;
}

export interface EventDoc {
  eventType: string;
  description: string;
  fields: Array<{
    path: string;
    type: string;
    description: string;
    required: boolean;
  }>;
}

export const docs = {
  providers: () => request<ProviderDoc[]>("/docs/providers"),
  provider: (provider: string) =>
    request<ProviderDoc & { events: EventDoc[] }>(`/docs/providers/${provider}`),
  event: (provider: string, eventType: string) =>
    request<EventDoc>(`/docs/providers/${provider}/events/${eventType}`),
};

// Timeline
export interface TimelineStep {
  step: string;
  timestamp: string;
  latencyMs: number | null;
  status: "success" | "warning" | "error" | "pending";
  detail: string;
}

export const timeline = {
  get: (eventId: string) =>
    request<{ eventId: string; steps: TimelineStep[] }>(
      `/events/${eventId}/timeline`,
    ),
};

// Latency
export interface LatencyStats {
  p50: number | null;
  p95: number | null;
  p99: number | null;
  timeSeries: Array<{ bucket: string; p50: number; p95: number; p99: number }>;
}

export const latency = {
  get: (period?: string) =>
    request<LatencyStats>(
      `/stats/latency${period ? `?period=${period}` : ""}`,
    ),
};

// Dead Letter
export interface DeadLetterEntry {
  id: string;
  eventId: string;
  endpointId: string;
  lastAttempt: number;
  lastError: string | null;
  exhaustedAt: string;
}

export const deadLetter = {
  list: (endpointId: string) =>
    request<DeadLetterEntry[]>(`/endpoints/${endpointId}/dead-letter`),
  retry: (endpointId: string, id: string) =>
    request<void>(`/endpoints/${endpointId}/dead-letter/${id}/retry`, {
      method: "POST",
    }),
  discard: (endpointId: string, id: string) =>
    request<void>(`/endpoints/${endpointId}/dead-letter/${id}`, {
      method: "DELETE",
    }),
};

// Audit Logs
export interface AuditLogEntry {
  id: string;
  workspaceId: string;
  userId: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

export const auditLogs = {
  list: (limit?: number, offset?: number, action?: string) => {
    const params = new URLSearchParams();
    if (limit) params.set("limit", String(limit));
    if (offset) params.set("offset", String(offset));
    if (action) params.set("action", action);
    const query = params.toString();
    return request<{ items: AuditLogEntry[]; total: number }>(
      `/audit-logs${query ? `?${query}` : ""}`,
    );
  },
};

// API Keys
export interface ApiKeyEntry {
  id: string;
  workspaceId: string;
  name: string;
  keyPrefix: string;
  isActive: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export const apiKeys = {
  list: () => request<ApiKeyEntry[]>("/api-keys"),
  create: (name: string, expiresAt?: string) =>
    request<{ apiKey: ApiKeyEntry; rawKey: string }>("/api-keys", {
      method: "POST",
      body: { name, expiresAt },
    }),
  revoke: (id: string) =>
    request<void>(`/api-keys/${id}/revoke`, { method: "POST" }),
  delete: (id: string) =>
    request<void>(`/api-keys/${id}`, { method: "DELETE" }),
};

// Event Export
export const eventExport = {
  csvUrl: (params?: Record<string, string>) => {
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return `${API_URL}/events/export/csv${query}`;
  },
  jsonUrl: (params?: Record<string, string>) => {
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return `${API_URL}/events/export/json${query}`;
  },
};

export { ApiError };
