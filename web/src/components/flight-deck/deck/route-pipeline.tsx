"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import toast from "react-hot-toast";
import {
  ApiError,
  destinations as destinationsApi,
  endpoints as endpointsApi,
  transforms as transformsApi,
  INGRESS_BASE,
  type Endpoint,
  type ForwardDestination,
  type TransformRule,
} from "@/lib/api";
import { SCHEMES } from "../tower/live-status";
import { findProvider } from "@/lib/providers";
import { PROVIDER_CODE } from "./format";

export interface RouteData {
  endpoint: Endpoint;
  destinations: ForwardDestination[];
  rules: TransformRule[];
}

type Op = TransformRule["operations"][number];

export type ConfirmRequest = { title: string; description: string; label: string; run: () => Promise<void> };

interface Props {
  route: RouteData;
  ingressSlug: string | null;
  highlighted: boolean;
  onChange: (next: RouteData) => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  confirm: (req: ConfirmRequest) => void;
}

function errText(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

function copy(text: string, what: string) {
  void navigator.clipboard.writeText(text).then(
    () => toast.success(`${what} copied`),
    () => toast.error("Clipboard unavailable"),
  );
}

export function opText(op: Op) {
  switch (op.type) {
    case "rename":
      return `${op.path} → ${op.newPath ?? "?"}`;
    case "copy":
      return `${op.path} ⇉ ${op.newPath ?? "?"}`;
    case "set":
      return `${op.path} = ${JSON.stringify(op.value)}`;
    default:
      return `− ${op.path}`;
  }
}

export function RoutePipeline({ route, ingressSlug, highlighted, onChange, onEdit, onDelete, onToggle, confirm }: Props) {
  const { endpoint: ep, destinations } = route;
  const code = PROVIDER_CODE[ep.provider] ?? "CSTM";
  // Per-source slug when the API provides one; older APIs only route by user slug plus endpoint id.
  const ingressUrl = ep.ingressSlug ? `${INGRESS_BASE}/in/${ep.ingressSlug}` : ingressSlug ? `${INGRESS_BASE}/in/${ingressSlug}/${ep.id}` : null;
  const provider = findProvider(ep.provider);
  const flowing = ep.isActive && (destinations.some((d) => d.isActive) || (!destinations.length && !!ep.forwardUrl));

  return (
    <article id={`route-${ep.id}`} className="route" data-paused={!ep.isActive || undefined} data-highlight={highlighted || undefined} aria-label={`Route ${ep.name}`}>
      <div className="route-code" aria-hidden>
        <b>{code}</b>
        <span>{ep.isActive ? "LIVE" : "PAUSED"}</span>
      </div>
      <div className="route-body">
        <header className="route-head">
          <div className="route-title">
            <h2>{ep.name}</h2>
            <span className="label-sm">
              {provider.value === ep.provider ? provider.label : ep.provider} · {ep.isActive ? "accepting" : "paused, events are not forwarded"}
            </span>
          </div>
          <div className="route-actions">
            <button type="button" className="chip chip--quiet" onClick={onToggle} aria-label={`${ep.isActive ? "Pause" : "Resume"} route ${ep.name}`}>
              {ep.isActive ? "Pause" : "Resume"}
            </button>
            <button type="button" className="chip chip--quiet" onClick={onEdit} aria-label={`Edit route ${ep.name}`}>
              Edit
            </button>
            <button type="button" className="chip chip--quiet" onClick={onDelete} aria-label={`Delete route ${ep.name}`}>
              Delete
            </button>
          </div>
        </header>

        <div className="pipe" data-flowing={flowing || undefined}>
          <Stage n="01" title="Source" meta={code}>
            <p className="stage-lede">{provider.value === ep.provider ? provider.description : "Any sender"}</p>
            {ingressUrl && (
              <button type="button" className="ingress-chip stage-url" title="Copy ingress URL" onClick={() => copy(ingressUrl, "Ingress URL")}>
                <span className="label-sm">POST</span>
                <span>{ingressUrl.replace(/^https?:\/\//, "")}</span>
              </button>
            )}
          </Stage>
          <PipeLink />
          <SealStage route={route} onChange={onChange} />
          <PipeLink />
          <TransformsStage route={route} onChange={onChange} confirm={confirm} />
          <PipeLink />
          <DestinationsStage route={route} onChange={onChange} confirm={confirm} />
        </div>
      </div>
    </article>
  );
}

function PipeLink() {
  return (
    <div className="pipe-link" aria-hidden>
      <i />
    </div>
  );
}

function Stage({ n, title, meta, children, tools }: { n: string; title: string; meta?: ReactNode; children: ReactNode; tools?: ReactNode }) {
  return (
    <section className="stage-box" aria-label={title}>
      <header>
        <span className="stage-n">{n}</span>
        <h3>{title}</h3>
        <span className="grow" />
        {meta && <span className="stage-meta">{meta}</span>}
      </header>
      <div className="stage-content">{children}</div>
      {tools && <footer className="stage-tools">{tools}</footer>}
    </section>
  );
}

function SealStage({ route, onChange }: { route: RouteData; onChange: (r: RouteData) => void }) {
  const ep = route.endpoint;
  const scheme = SCHEMES[ep.provider] ?? SCHEMES.custom;
  const [rotating, setRotating] = useState(false);
  const [secret, setSecret] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!secret) return;
    setSaving(true);
    try {
      const updated = await endpointsApi.update(ep.id, { webhookSecret: secret } as Partial<Endpoint>);
      onChange({ ...route, endpoint: updated });
      setSecret("");
      setRotating(false);
      toast.success("Signing secret updated");
    } catch (err) {
      toast.error(errText(err, "Failed to update secret"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stage
      n="02"
      title="Seal"
      meta={scheme.optional ? "optional" : "verify"}
      tools={
        !rotating && (
          <button type="button" className="chip chip--quiet" onClick={() => setRotating(true)}>
            {scheme.optional ? "Set secret" : "Rotate secret"}
          </button>
        )
      }
    >
      <dl className="kv kv--tight">
        <dt>scheme</dt>
        <dd>{scheme.scheme}</dd>
        <dt>header</dt>
        <dd>{scheme.header ? [scheme.header, ...(scheme.altHeaders ?? [])].join(" · ") : "—"}</dd>
        <dt>invalid</dt>
        <dd>{ep.blockInvalidSignatures ? "blocked at the gate" : "recorded and forwarded, marked ✗"}</dd>
        {scheme.optional && (
          <>
            <dt>missing</dt>
            <dd>no signature header: recorded as unverified</dd>
          </>
        )}
      </dl>
      {rotating && (
        <form className="inline-form stage-form" onSubmit={(e) => void save(e)}>
          <input
            className="fd-input"
            type="password"
            autoComplete="off"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="New signing secret"
            aria-label="New signing secret"
            autoFocus
          />
          <button type="submit" className="chip" disabled={saving || !secret}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" className="chip chip--quiet" onClick={() => setRotating(false)}>
            Cancel
          </button>
        </form>
      )}
    </Stage>
  );
}

interface OpDraft {
  type: string;
  path: string;
  newPath: string;
  value: string;
}

const OP_TYPES = [
  { value: "rename", label: "Rename" },
  { value: "remove", label: "Remove" },
  { value: "set", label: "Set" },
  { value: "copy", label: "Copy" },
];

const EMPTY_OP: OpDraft = { type: "rename", path: "", newPath: "", value: "" };
const SAMPLE_BODY = '{\n  "data": {\n    "card": {\n      "bin": "408408"\n    }\n  }\n}';

function toDraft(op: Op): OpDraft {
  return { type: op.type, path: op.path, newPath: op.newPath ?? "", value: op.value === undefined ? "" : typeof op.value === "string" ? op.value : JSON.stringify(op.value) };
}

function fromDraft(op: OpDraft): Op {
  const base: Op = { type: op.type, path: op.path };
  if (op.type === "rename" || op.type === "copy") base.newPath = op.newPath;
  if (op.type === "set") {
    try {
      base.value = JSON.parse(op.value);
    } catch {
      base.value = op.value;
    }
  }
  return base;
}

function TransformsStage({ route, onChange, confirm }: { route: RouteData; onChange: (r: RouteData) => void; confirm: (req: ConfirmRequest) => void }) {
  const ep = route.endpoint;
  const rules = [...route.rules].sort((a, b) => a.priority - b.priority);
  const [editing, setEditing] = useState<TransformRule | "new" | null>(null);
  const [testing, setTesting] = useState<{ label: string; operations: Op[] } | null>(null);
  const active = rules.filter((r) => r.isActive);

  async function toggle(rule: TransformRule) {
    try {
      const updated = await transformsApi.update(ep.id, rule.id, { isActive: !rule.isActive });
      onChange({ ...route, rules: route.rules.map((r) => (r.id === rule.id ? updated : r)) });
      toast.success(updated.isActive ? "Rule enabled" : "Rule disabled");
    } catch {
      toast.error("Failed to update rule");
    }
  }

  function remove(rule: TransformRule) {
    confirm({
      title: "Delete transform rule",
      description: `Are you sure you want to delete "${rule.name}"? This cannot be undone.`,
      label: "Delete",
      run: async () => {
        try {
          await transformsApi.delete(ep.id, rule.id);
          onChange({ ...route, rules: route.rules.filter((r) => r.id !== rule.id) });
          toast.success("Rule deleted");
        } catch {
          toast.error("Failed to delete rule");
        }
      },
    });
  }

  return (
    <Stage
      n="03"
      title="Transforms"
      meta={rules.length ? `${active.length}/${rules.length} on` : "pass-through"}
      tools={
        <>
          <button type="button" className="chip chip--quiet" onClick={() => setEditing("new")} disabled={editing === "new"}>
            + Rule
          </button>
          {active.length > 0 && (
            <button type="button" className="chip chip--quiet" onClick={() => setTesting({ label: "all active rules", operations: active.flatMap((r) => r.operations) })}>
              Test pipeline
            </button>
          )}
        </>
      }
    >
      {rules.length === 0 && editing !== "new" ? (
        <p className="stage-lede">Payloads are forwarded byte-for-byte, so receivers can verify the original signature.</p>
      ) : (
        <ol className="rule-list">
          {rules.map((rule) =>
            editing !== "new" && editing?.id === rule.id ? (
              <li key={rule.id}>
                <RuleEditor endpointId={ep.id} rule={rule} onCancel={() => setEditing(null)} onSaved={(saved) => {
                  onChange({ ...route, rules: route.rules.map((r) => (r.id === saved.id ? saved : r)) });
                  setEditing(null);
                }} />
              </li>
            ) : (
              <li key={rule.id} className="rule" data-off={!rule.isActive || undefined}>
                <div className="rule-head">
                  <span className="rule-p">{rule.priority}</span>
                  <b>{rule.name}</b>
                  <span className="grow" />
                  <span className="label-sm">{rule.isActive ? "on" : "off"}</span>
                </div>
                <ul className="op-list">
                  {rule.operations.map((op, i) => (
                    <li key={i}>
                      <span className="op-type">{op.type}</span> {opText(op)}
                    </li>
                  ))}
                </ul>
                <div className="row-actions">
                  <button type="button" className="link-btn" onClick={() => void toggle(rule)} aria-label={`${rule.isActive ? "Disable" : "Enable"} rule ${rule.name}`}>
                    {rule.isActive ? "Disable" : "Enable"}
                  </button>
                  <button type="button" className="link-btn" onClick={() => setEditing(rule)} aria-label={`Edit rule ${rule.name}`}>
                    Edit
                  </button>
                  <button type="button" className="link-btn" onClick={() => setTesting({ label: rule.name, operations: rule.operations })} aria-label={`Test rule ${rule.name}`}>
                    Test
                  </button>
                  <button type="button" className="link-btn" onClick={() => remove(rule)} aria-label={`Delete rule ${rule.name}`}>
                    Delete
                  </button>
                </div>
              </li>
            ),
          )}
          {editing === "new" && (
            <li>
              <RuleEditor
                endpointId={ep.id}
                nextPriority={rules.length ? Math.max(...rules.map((r) => r.priority)) + 1 : 1}
                onCancel={() => setEditing(null)}
                onSaved={(saved) => {
                  onChange({ ...route, rules: [...route.rules, saved] });
                  setEditing(null);
                }}
              />
            </li>
          )}
        </ol>
      )}
      {testing && <TestPanel endpointId={ep.id} label={testing.label} operations={testing.operations} onClose={() => setTesting(null)} />}
    </Stage>
  );
}

function RuleEditor({ endpointId, rule, nextPriority, onSaved, onCancel }: { endpointId: string; rule?: TransformRule; nextPriority?: number; onSaved: (r: TransformRule) => void; onCancel: () => void }) {
  const [name, setName] = useState(rule?.name ?? "");
  const [priority, setPriority] = useState(String(rule?.priority ?? nextPriority ?? 1));
  const [ops, setOps] = useState<OpDraft[]>(rule ? rule.operations.map(toDraft) : [{ ...EMPTY_OP }]);
  const [saving, setSaving] = useState(false);

  const update = (i: number, field: keyof OpDraft, value: string) => setOps((prev) => prev.map((op, j) => (j === i ? { ...op, [field]: value } : op)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const operations = ops.map(fromDraft);
      const p = Number(priority);
      const saved = rule
        ? await transformsApi.update(endpointId, rule.id, { name, operations, ...(Number.isFinite(p) ? { priority: p } : {}) })
        : await transformsApi.create(endpointId, { name, operations, ...(Number.isFinite(p) ? { priority: p } : {}) });
      toast.success(rule ? "Transform rule saved" : "Transform rule created");
      onSaved(saved);
    } catch (err) {
      toast.error(errText(err, rule ? "Failed to save rule" : "Failed to create rule"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="rule-editor" onSubmit={(e) => void submit(e)} aria-label={rule ? `Edit ${rule.name}` : "New transform rule"}>
      <div className="rule-editor-row">
        <label className="fd-field grow">
          <span>Rule name</span>
          <input className="fd-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Strip card BIN" required autoFocus />
        </label>
        <label className="fd-field rule-priority">
          <span>Order</span>
          <input className="fd-input" type="number" value={priority} onChange={(e) => setPriority(e.target.value)} />
        </label>
      </div>
      {ops.map((op, i) => (
        <fieldset key={i} className="op-editor">
          <legend className="sr-only">Operation {i + 1}</legend>
          <select className="fd-input" value={op.type} onChange={(e) => update(i, "type", e.target.value)} aria-label="Operation">
            {OP_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <input className="fd-input" value={op.path} onChange={(e) => update(i, "path", e.target.value)} placeholder="data.card.bin" aria-label="Path" required />
          {(op.type === "rename" || op.type === "copy") && (
            <input className="fd-input" value={op.newPath} onChange={(e) => update(i, "newPath", e.target.value)} placeholder="data.card_bin" aria-label="New path" required />
          )}
          {op.type === "set" && (
            <input className="fd-input" value={op.value} onChange={(e) => update(i, "value", e.target.value)} placeholder='"hookdash"' aria-label="Value (JSON)" required />
          )}
          {ops.length > 1 && (
            <button type="button" className="link-btn" onClick={() => setOps((prev) => prev.filter((_, j) => j !== i))} aria-label={`Remove operation ${i + 1}`}>
              ✕
            </button>
          )}
        </fieldset>
      ))}
      <div className="row-actions">
        <button type="button" className="link-btn" onClick={() => setOps((prev) => [...prev, { ...EMPTY_OP }])}>
          + Operation
        </button>
        <span className="grow" />
        <button type="button" className="chip chip--quiet" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="chip" disabled={saving}>
          {saving ? "Saving…" : rule ? "Save rule" : "Create rule"}
        </button>
      </div>
    </form>
  );
}

function TestPanel({ endpointId, label, operations, onClose }: { endpointId: string; label: string; operations: Op[]; onClose: () => void }) {
  const [body, setBody] = useState(SAMPLE_BODY);
  const [result, setResult] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    setResult(null);
    try {
      const out = await transformsApi.test(endpointId, { operations, body: JSON.parse(body) });
      setResult(JSON.stringify(out, null, 2));
    } catch (err) {
      setResult(`Error: ${err instanceof Error ? err.message : "Invalid JSON"}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="test-panel" role="region" aria-label={`Test ${label}`}>
      <div className="row-actions">
        <span className="label-sm">Test · {label}</span>
        <span className="grow" />
        <button type="button" className="link-btn" onClick={onClose}>
          Close
        </button>
      </div>
      <label className="fd-field">
        <span>Input body (JSON)</span>
        <textarea className="fd-input" rows={6} value={body} onChange={(e) => setBody(e.target.value)} spellCheck={false} />
      </label>
      <button type="button" className="chip" onClick={() => void run()} disabled={running}>
        {running ? "Running…" : "Run test"}
      </button>
      <pre className="payload payload--short" aria-live="polite">
        {result ?? "Run the test to see what the destination receives."}
      </pre>
    </div>
  );
}

function DestinationsStage({ route, onChange, confirm }: { route: RouteData; onChange: (r: RouteData) => void; confirm: (req: ConfirmRequest) => void }) {
  const ep = route.endpoint;
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const live = route.destinations.filter((d) => d.isActive).length;
  const legacy = route.destinations.length === 0 && ep.forwardUrl;
  const retries = ep.retryMaxAttempts ?? 3;

  async function toggle(dest: ForwardDestination) {
    try {
      const updated = await destinationsApi.update(ep.id, dest.id, { isActive: !dest.isActive });
      onChange({ ...route, destinations: route.destinations.map((d) => (d.id === dest.id ? updated : d)) });
    } catch {
      toast.error("Failed to update destination");
    }
  }

  function remove(dest: ForwardDestination) {
    confirm({
      title: "Delete destination",
      description: `Remove "${dest.label || dest.url}"? Events will no longer be forwarded here.`,
      label: "Delete",
      run: async () => {
        try {
          await destinationsApi.delete(ep.id, dest.id);
          onChange({ ...route, destinations: route.destinations.filter((d) => d.id !== dest.id) });
          toast.success("Destination removed");
        } catch {
          toast.error("Failed to delete destination");
        }
      },
    });
  }

  return (
    <Stage
      n="04"
      title="Destinations"
      meta={route.destinations.length ? `${live}/${route.destinations.length} live` : legacy ? "forward URL" : "none"}
      tools={
        <>
          <button type="button" className="chip chip--quiet" onClick={() => setAdding(true)} disabled={adding}>
            + Destination
          </button>
          <span className="label-sm stage-policy">
            retry ×{retries} · {ep.retryBackoffMs ?? 1000}ms backoff
          </span>
        </>
      }
    >
      {route.destinations.length === 0 && !adding && (
        <p className="stage-lede">
          {legacy ? (
            <>
              Forwarding to the fallback URL <code>{ep.forwardUrl}</code>. Add a destination to fan out instead.
            </>
          ) : (
            "No destination yet. Events are recorded and shown as NO ROUTE until you add one."
          )}
        </p>
      )}
      {route.destinations.length > 0 && (
        <ul className="dest-list">
          {route.destinations.map((dest) =>
            editingId === dest.id ? (
              <li key={dest.id}>
                <DestinationForm
                  endpointId={ep.id}
                  dest={dest}
                  onCancel={() => setEditingId(null)}
                  onSaved={(saved) => {
                    onChange({ ...route, destinations: route.destinations.map((d) => (d.id === saved.id ? saved : d)) });
                    setEditingId(null);
                  }}
                />
              </li>
            ) : (
              <li key={dest.id} className="dest" data-off={!dest.isActive || undefined}>
                <div className="dest-head">
                  <i className="dest-dot" aria-hidden />
                  <b>{dest.label || "Untitled"}</b>
                  <span className="grow" />
                  <span className="label-sm">{dest.isActive ? "live" : "paused"}</span>
                </div>
                <code className="dest-url" title={dest.url}>
                  {dest.url}
                </code>
                <div className="row-actions">
                  <button type="button" className="link-btn" onClick={() => void toggle(dest)} aria-label={`${dest.isActive ? "Pause" : "Resume"} destination ${dest.label || dest.url}`}>
                    {dest.isActive ? "Pause" : "Resume"}
                  </button>
                  <button type="button" className="link-btn" onClick={() => setEditingId(dest.id)} aria-label={`Edit destination ${dest.label || dest.url}`}>
                    Edit
                  </button>
                  <button type="button" className="link-btn" onClick={() => remove(dest)} aria-label={`Delete destination ${dest.label || dest.url}`}>
                    Delete
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
      {adding && (
        <DestinationForm
          endpointId={ep.id}
          onCancel={() => setAdding(false)}
          onSaved={(saved) => {
            onChange({ ...route, destinations: [...route.destinations, saved] });
            setAdding(false);
          }}
        />
      )}
      <SigningSecret endpointId={ep.id} confirm={confirm} />
    </Stage>
  );
}

function SigningSecret({ endpointId, confirm }: { endpointId: string; confirm: (req: ConfirmRequest) => void }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function reveal() {
    setLoading(true);
    try {
      setSecret((await endpointsApi.signingSecret(endpointId)).signingSecret);
    } catch (err) {
      toast.error(errText(err, "Failed to load signing secret"));
    } finally {
      setLoading(false);
    }
  }

  function rotate() {
    confirm({
      title: "Rotate signing secret",
      description: "Receivers verifying with the current secret will reject forwarded requests until you give them the new one.",
      label: "Rotate",
      run: async () => {
        try {
          setSecret((await endpointsApi.rotateSigningSecret(endpointId)).signingSecret);
          toast.success("Signing secret rotated");
        } catch (err) {
          toast.error(errText(err, "Failed to rotate signing secret"));
        }
      },
    });
  }

  return (
    <div className="signing-secret">
      <div className="dest-head">
        <b>Signing secret</b>
        <span className="grow" />
        <span className="label-sm">Standard Webhooks</span>
      </div>
      <p className="stage-lede">
        Every forwarded request carries <code>webhook-id</code>, <code>webhook-timestamp</code> and <code>webhook-signature</code>. Verify them with this secret, for example with <code>verify.hookdash()</code> from the SDK.
      </p>
      {secret ? (
        <code className="dest-url" title="Outbound signing secret">
          {secret}
        </code>
      ) : null}
      <div className="row-actions">
        {secret ? (
          <button type="button" className="link-btn" onClick={() => copy(secret, "Signing secret")}>
            Copy
          </button>
        ) : (
          <button type="button" className="link-btn" onClick={() => void reveal()} disabled={loading}>
            {loading ? "Loading…" : "Show"}
          </button>
        )}
        <button type="button" className="link-btn" onClick={rotate}>
          Rotate
        </button>
      </div>
    </div>
  );
}

function DestinationForm({ endpointId, dest, onSaved, onCancel }: { endpointId: string; dest?: ForwardDestination; onSaved: (d: ForwardDestination) => void; onCancel: () => void }) {
  const [url, setUrl] = useState(dest?.url ?? "");
  const [label, setLabel] = useState(dest?.label ?? "");
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const saved = dest
        ? await destinationsApi.update(endpointId, dest.id, { url, label })
        : await destinationsApi.create(endpointId, { url, label: label || undefined });
      toast.success(dest ? "Destination saved" : "Destination added");
      onSaved(saved);
    } catch (err) {
      toast.error(errText(err, dest ? "Failed to save destination" : "Failed to create"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="dest-form" onSubmit={(e) => void submit(e)} aria-label={dest ? "Edit destination" : "Add destination"}>
      <label className="fd-field">
        <span>URL</span>
        <input className="fd-input" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-api.com/webhooks" required autoFocus />
      </label>
      <label className="fd-field">
        <span>Label</span>
        <input className="fd-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Production API" />
      </label>
      <div className="row-actions">
        <span className="grow" />
        <button type="button" className="chip chip--quiet" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="chip" disabled={saving}>
          {saving ? "Saving…" : dest ? "Save" : "Add"}
        </button>
      </div>
    </form>
  );
}
