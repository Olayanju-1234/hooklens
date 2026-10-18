"use client";

import { useState, type FormEvent } from "react";
import { ApiError, endpoints as endpointsApi, type Endpoint } from "@/lib/api";
import { PROVIDERS, findProvider } from "@/lib/providers";

interface Props {
  endpoint?: Endpoint;
  onSaved: (ep: Endpoint) => void;
  onCancel: () => void;
}

export function EndpointForm({ endpoint, onSaved, onCancel }: Props) {
  const editing = !!endpoint;
  const [name, setName] = useState(endpoint?.name ?? "");
  const [provider, setProvider] = useState(endpoint?.provider ?? "custom");
  const [forwardUrl, setForwardUrl] = useState(endpoint?.forwardUrl ?? "");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [retryMaxAttempts, setRetryMaxAttempts] = useState(String(endpoint?.retryMaxAttempts ?? 3));
  const [retryBackoffMs, setRetryBackoffMs] = useState(String(endpoint?.retryBackoffMs ?? 1000));
  const [blockInvalidSignatures, setBlockInvalidSignatures] = useState(endpoint?.blockInvalidSignatures ?? false);
  const [responseStatusCode, setResponseStatusCode] = useState(String(endpoint?.responseStatusCode ?? 200));
  const [responseBody, setResponseBody] = useState(endpoint?.responseBody ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const replyBody = responseBody.trim();
    if (replyBody && !isJsonObject(replyBody)) {
      setError("Reply body must be a JSON object or array");
      return;
    }
    setSubmitting(true);
    try {
      const retries = intOr(retryMaxAttempts, 3);
      const backoff = intOr(retryBackoffMs, 1000);
      const replyStatus = intOr(responseStatusCode, 200);
      let saved: Endpoint;
      if (!endpoint) {
        saved = await endpointsApi.create({
          name,
          provider,
          forwardUrl: forwardUrl || undefined,
          webhookSecret: webhookSecret || undefined,
          retryMaxAttempts: retries,
          retryBackoffMs: backoff,
          responseStatusCode: replyStatus,
          responseBody: replyBody || undefined,
          blockInvalidSignatures,
        });
      } else {
        const update: Record<string, unknown> = {
          name,
          provider,
          forwardUrl: forwardUrl || null,
          retryMaxAttempts: retries,
          retryBackoffMs: backoff,
          responseStatusCode: replyStatus,
          responseBody: replyBody || null,
          blockInvalidSignatures,
        };
        if (webhookSecret) update.webhookSecret = webhookSecret;
        saved = await endpointsApi.update(endpoint.id, update as Partial<Endpoint>);
      }
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="route-form" onSubmit={(e) => void submit(e)} aria-label={endpoint ? `Edit ${endpoint.name}` : "New route"}>
      <div className="route-form-grid">
        <label className="fd-field">
          <span>Name</span>
          <input className="fd-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Paystack production" required autoFocus={!editing} />
        </label>
        <label className="fd-field">
          <span>Source</span>
          <select className="fd-input" value={provider} onChange={(e) => setProvider(e.target.value)}>
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}: {p.description}
              </option>
            ))}
          </select>
        </label>
        <label className="fd-field">
          <span>{editing ? "Signing secret (blank keeps it)" : "Signing secret"}</span>
          <input
            className="fd-input"
            type="password"
            autoComplete="off"
            value={webhookSecret}
            onChange={(e) => setWebhookSecret(e.target.value)}
            placeholder={editing ? "New secret to rotate" : findProvider(provider).secretHint}
          />
        </label>
        <label className="fd-field">
          <span>Fallback forward URL</span>
          <input className="fd-input" type="url" value={forwardUrl} onChange={(e) => setForwardUrl(e.target.value)} placeholder="https://api.example.com/webhooks" />
          <small>Used only while the route has no destinations.</small>
        </label>
        <label className="fd-field">
          <span>Retries</span>
          <input className="fd-input" type="number" min="0" max="10" value={retryMaxAttempts} onChange={(e) => setRetryMaxAttempts(e.target.value)} />
        </label>
        <label className="fd-field">
          <span>Backoff (ms)</span>
          <input className="fd-input" type="number" min="100" max="60000" value={retryBackoffMs} onChange={(e) => setRetryBackoffMs(e.target.value)} />
        </label>
        <label className="fd-field">
          <span>Reply status</span>
          <input className="fd-input" type="number" min="200" max="299" value={responseStatusCode} onChange={(e) => setResponseStatusCode(e.target.value)} />
          <small>2xx only. Senders retry anything else.</small>
        </label>
        <label className="fd-field fd-field--wide">
          <span>Reply body (JSON)</span>
          <textarea
            className="fd-input"
            rows={3}
            maxLength={4096}
            spellCheck={false}
            value={responseBody}
            onChange={(e) => setResponseBody(e.target.value)}
            placeholder='{"status":"ok"}'
          />
          <small>What the sender gets back. Blank sends {'{"status":"ok"}'}.</small>
        </label>
        <BlockInvalidToggle checked={blockInvalidSignatures} onChange={setBlockInvalidSignatures} />
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="route-form-actions">
        <button type="submit" className="btn tower-cta" disabled={submitting}>
          {submitting ? "Saving…" : editing ? "Save route" : "Create route"}
        </button>
        <button type="button" className="chip chip--quiet" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function BlockInvalidToggle({ checked, onChange, disabled, compact }: { checked: boolean; onChange: (next: boolean) => void; disabled?: boolean; compact?: boolean }) {
  return (
    <label className="fd-toggle" data-on={checked || undefined} data-compact={compact || undefined}>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <b>Block webhooks with an invalid signature</b>
        <small>
          Invalid signature: <em>{checked ? "blocked at the gate, never forwarded" : "recorded and forwarded, marked ✗"}</em>
        </small>
        {!compact && <small>Needs a signing secret. Without one nothing is verified, so nothing is blocked.</small>}
      </span>
    </label>
  );
}

// Only a blank or non-numeric field takes the default; a deliberate 0 is kept
function intOr(text: string, fallback: number): number {
  const value = parseInt(text);
  return Number.isNaN(value) ? fallback : value;
}

function isJsonObject(text: string): boolean {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null;
  } catch {
    return false;
  }
}
