import type {
  HookdashConfig,
  Endpoint,
  WebhookEvent,
  ApiKey,
  Workspace,
  CreateEndpointParams,
  UpdateEndpointParams,
  ListEventsParams,
  PaginatedResponse,
  SendWebhookParams,
  CreateApiKeyParams,
  CreateApiKeyResponse,
} from './types.js';
import {
  HookdashError,
  HookdashAuthError,
  HookdashNotFoundError,
  HookdashRateLimitError,
} from './errors.js';

const DEFAULT_BASE_URL = 'https://hookdash-api.onrender.com';
const DEFAULT_TIMEOUT = 30_000;

export class Hookdash {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private workspaceId?: string;

  /** Resource namespaces */
  readonly endpoints: EndpointsResource;
  readonly events: EventsResource;
  readonly apiKeys: ApiKeysResource;
  readonly workspaces: WorkspacesResource;

  constructor(config: HookdashConfig) {
    if (!config.apiKey) {
      throw new Error('Hookdash: apiKey is required');
    }
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;

    this.endpoints = new EndpointsResource(this);
    this.events = new EventsResource(this);
    this.apiKeys = new ApiKeysResource(this);
    this.workspaces = new WorkspacesResource(this);
  }

  /** Set workspace context for subsequent requests */
  setWorkspace(workspaceId: string): this {
    this.workspaceId = workspaceId;
    return this;
  }

  /**
   * Send a test webhook to an ingress slug.
   * This hits the public ingress endpoint (POST /in/:slug), not the API.
   */
  async send(params: SendWebhookParams): Promise<{ status: number; body: string }> {
    const ingressUrl = this.baseUrl.replace(/\/api\/?$/, '');
    const url = `${ingressUrl}/in/${params.slug}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...params.headers,
        },
        body: JSON.stringify(params.body),
        signal: controller.signal,
      });
      const text = await res.text();
      return { status: res.status, body: text };
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Internal HTTP layer ──────────────────────────────────────────

  /** @internal */
  async _request<T>(method: string, path: string, body?: unknown, query?: Record<string, string>): Promise<T> {
    let url = `${this.baseUrl}/api${path}`;
    if (query) {
      const params = new URLSearchParams(
        Object.entries(query).filter(([, v]) => v !== undefined && v !== ''),
      );
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }

    const headers: Record<string, string> = {
      'x-api-key': this.apiKey,
    };
    if (this.workspaceId) {
      headers['x-workspace-id'] = this.workspaceId;
    }
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let parsed: unknown;
        try { parsed = JSON.parse(text); } catch { parsed = text; }

        if (res.status === 401) throw new HookdashAuthError();
        if (res.status === 404) throw new HookdashNotFoundError(path);
        if (res.status === 429) throw new HookdashRateLimitError();
        throw new HookdashError(
          (parsed as { message?: string })?.message ?? `Request failed: ${res.status}`,
          res.status,
          parsed,
        );
      }

      const text = await res.text();
      if (!text) return undefined as T;
      return JSON.parse(text) as T;
    } finally {
      clearTimeout(timer);
    }
  }
}

// ── Resource Classes ─────────────────────────────────────────────────

class EndpointsResource {
  constructor(private readonly client: Hookdash) {}

  /** List all endpoints */
  async list(): Promise<Endpoint[]> {
    return this.client._request('GET', '/endpoints');
  }

  /** Get a single endpoint */
  async get(id: string): Promise<Endpoint> {
    return this.client._request('GET', `/endpoints/${id}`);
  }

  /** Create a new endpoint */
  async create(params: CreateEndpointParams): Promise<Endpoint> {
    return this.client._request('POST', '/endpoints', params);
  }

  /** Update an endpoint */
  async update(id: string, params: UpdateEndpointParams): Promise<Endpoint> {
    return this.client._request('PATCH', `/endpoints/${id}`, params);
  }

  /** Delete an endpoint */
  async delete(id: string): Promise<void> {
    return this.client._request('DELETE', `/endpoints/${id}`);
  }
}

class EventsResource {
  constructor(private readonly client: Hookdash) {}

  /** List events with optional filters */
  async list(params?: ListEventsParams): Promise<PaginatedResponse<WebhookEvent>> {
    const query: Record<string, string> = {};
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) query[k] = String(v);
      }
    }
    return this.client._request('GET', '/events', undefined, query);
  }

  /** Get a single event */
  async get(id: string): Promise<WebhookEvent> {
    return this.client._request('GET', `/events/${id}`);
  }

  /** Replay an event (re-forward it) */
  async replay(id: string): Promise<WebhookEvent> {
    return this.client._request('POST', `/events/${id}/replay`);
  }

  /** Delete an event */
  async delete(id: string): Promise<void> {
    return this.client._request('DELETE', `/events/${id}`);
  }

  /** Export events as JSON or CSV */
  async export(format: 'json' | 'csv', params?: ListEventsParams): Promise<string> {
    const query: Record<string, string> = {};
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) query[k] = String(v);
      }
    }
    return this.client._request('GET', `/events/export/${format}`, undefined, query);
  }
}

class ApiKeysResource {
  constructor(private readonly client: Hookdash) {}

  /** List API keys */
  async list(): Promise<ApiKey[]> {
    return this.client._request('GET', '/api-keys');
  }

  /** Create a new API key */
  async create(params: CreateApiKeyParams): Promise<CreateApiKeyResponse> {
    return this.client._request('POST', '/api-keys', params);
  }

  /** Revoke an API key */
  async revoke(id: string): Promise<void> {
    return this.client._request('PATCH', `/api-keys/${id}/revoke`);
  }

  /** Delete an API key */
  async delete(id: string): Promise<void> {
    return this.client._request('DELETE', `/api-keys/${id}`);
  }
}

class WorkspacesResource {
  constructor(private readonly client: Hookdash) {}

  /** List workspaces you belong to */
  async list(): Promise<Workspace[]> {
    return this.client._request('GET', '/workspaces');
  }

  /** Get workspace details */
  async get(id: string): Promise<Workspace> {
    return this.client._request('GET', `/workspaces/${id}`);
  }

  /** Create a workspace */
  async create(name: string): Promise<Workspace> {
    return this.client._request('POST', '/workspaces', { name });
  }

  /** Update workspace settings */
  async update(id: string, params: { name?: string; retentionDays?: number }): Promise<Workspace> {
    return this.client._request('PATCH', `/workspaces/${id}`, params);
  }

  /** Delete a workspace */
  async delete(id: string): Promise<void> {
    return this.client._request('DELETE', `/workspaces/${id}`);
  }

  /** Invite a member */
  async invite(id: string, email: string, role?: 'owner' | 'member'): Promise<void> {
    return this.client._request('POST', `/workspaces/${id}/invite`, { email, role });
  }

  /** Remove a member */
  async removeMember(id: string, userId: string): Promise<void> {
    return this.client._request('DELETE', `/workspaces/${id}/members/${userId}`);
  }
}
