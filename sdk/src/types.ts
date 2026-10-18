// ── Client Configuration ─────────────────────────────────────────────

export interface HookdashConfig {
  /** API key (hd_live_...) or JWT token */
  apiKey: string;
  /** Base URL of your Hookdash instance (default: https://hookdash-api.onrender.com) */
  baseUrl?: string;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
}

// ── Resources ────────────────────────────────────────────────────────

export interface Endpoint {
  id: string;
  name: string;
  provider: 'paystack' | 'flutterwave' | 'mono' | 'bags' | 'custom';
  isActive: boolean;
  forwardUrl: string | null;
  retryMaxAttempts: number;
  retryBackoffMs: number;
  responseStatusCode: number;
  responseBody: string | null;
  blockInvalidSignatures: boolean;
  createdAt: string;
}

export interface WebhookEvent {
  id: string;
  endpointId: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
  sourceIp: string | null;
  provider: string | null;
  eventType: string | null;
  signatureValid: boolean | null;
  forwardStatus: 'pending' | 'forwarded' | 'failed' | 'skipped' | 'blocked';
  forwardCode: number | null;
  forwardLatency: number | null;
  isDuplicate: boolean;
  receivedAt: string;
  createdAt: string;
}

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  isActive: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  retentionDays: number;
  createdAt: string;
}

// ── Request/Response Types ───────────────────────────────────────────

export interface CreateEndpointParams {
  name: string;
  provider?: 'paystack' | 'flutterwave' | 'mono' | 'bags' | 'custom';
  webhookSecret?: string;
  forwardUrl?: string;
  retryMaxAttempts?: number;
  retryBackoffMs?: number;
  responseStatusCode?: number;
  responseBody?: string;
  blockInvalidSignatures?: boolean;
}

export interface UpdateEndpointParams {
  name?: string;
  webhookSecret?: string;
  forwardUrl?: string;
  isActive?: boolean;
  retryMaxAttempts?: number;
  retryBackoffMs?: number;
  responseStatusCode?: number;
  /** JSON object or array as a string; null resets the reply to {"status":"ok"}. */
  responseBody?: string | null;
  blockInvalidSignatures?: boolean;
}

export interface ListEventsParams {
  endpointId?: string;
  eventType?: string;
  provider?: string;
  forwardStatus?: string;
  signatureValid?: boolean;
  search?: string;
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'ASC' | 'DESC';
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface SendWebhookParams {
  /** Ingress slug (e.g. usr_a1b2c3d4e5f6) */
  slug: string;
  /** Payload body */
  body: Record<string, unknown>;
  /** Custom headers */
  headers?: Record<string, string>;
}

export interface CreateApiKeyParams {
  name: string;
  expiresInDays?: number;
}

export interface CreateApiKeyResponse extends ApiKey {
  /** The raw API key — only returned once at creation */
  rawKey: string;
}

export type WebhookProvider = 'paystack' | 'flutterwave' | 'mono' | 'bags';
