"use client";

import { useState, useEffect, FormEvent } from "react";
import { endpoints, transforms, Endpoint, TransformRule, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { CardSkeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import toast from "react-hot-toast";

const OP_TYPES = [
  { value: "rename", label: "Rename field" },
  { value: "remove", label: "Remove field" },
  { value: "set", label: "Set value" },
  { value: "copy", label: "Copy field" },
];

interface OpInput {
  type: string;
  path: string;
  newPath: string;
  value: string;
}

const emptyOp: OpInput = { type: "rename", path: "", newPath: "", value: "" };

export default function TransformsPage() {
  const [endpointList, setEndpointList] = useState<Endpoint[]>([]);
  const [selectedEndpoint, setSelectedEndpoint] = useState("");
  const [rules, setRules] = useState<TransformRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // Create form
  const [ruleName, setRuleName] = useState("");
  const [ops, setOps] = useState<OpInput[]>([{ ...emptyOp }]);
  const [creating, setCreating] = useState(false);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<TransformRule | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Test preview
  const [testRule, setTestRule] = useState<TransformRule | null>(null);
  const [testBody, setTestBody] = useState('{\n  "data": {\n    "card": {\n      "bin": "408408"\n    }\n  }\n}');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    endpoints
      .list()
      .then((list) => {
        setEndpointList(list);
        if (list.length > 0) setSelectedEndpoint(list[0].id);
      })
      .catch(() => toast.error("Failed to load endpoints"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedEndpoint) return;
    setLoading(true);
    transforms
      .list(selectedEndpoint)
      .then(setRules)
      .catch(() => toast.error("Failed to load transforms"))
      .finally(() => setLoading(false));
  }, [selectedEndpoint]);

  function updateOp(index: number, field: keyof OpInput, value: string) {
    setOps((prev) => prev.map((op, i) => (i === index ? { ...op, [field]: value } : op)));
  }

  function addOp() {
    setOps((prev) => [...prev, { ...emptyOp }]);
  }

  function removeOp(index: number) {
    setOps((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!selectedEndpoint) return;
    setCreating(true);
    try {
      const operations = ops.map((op) => {
        const base: { type: string; path: string; newPath?: string; value?: unknown } = {
          type: op.type,
          path: op.path,
        };
        if (op.type === "rename" || op.type === "copy") base.newPath = op.newPath;
        if (op.type === "set") {
          try { base.value = JSON.parse(op.value); } catch { base.value = op.value; }
        }
        return base;
      });
      const rule = await transforms.create(selectedEndpoint, { name: ruleName, operations });
      setRules((prev) => [...prev, rule]);
      setRuleName("");
      setOps([{ ...emptyOp }]);
      setShowCreate(false);
      toast.success("Transform rule created");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create rule");
    } finally {
      setCreating(false);
    }
  }

  async function handleToggle(rule: TransformRule) {
    try {
      const updated = await transforms.update(selectedEndpoint, rule.id, { isActive: !rule.isActive });
      setRules((prev) => prev.map((r) => (r.id === rule.id ? updated : r)));
      toast.success(updated.isActive ? "Rule enabled" : "Rule disabled");
    } catch {
      toast.error("Failed to update rule");
    }
  }

  async function handleTest() {
    if (!testRule || !selectedEndpoint) return;
    setTesting(true);
    setTestResult(null);
    try {
      const body = JSON.parse(testBody);
      const result = await transforms.test(selectedEndpoint, {
        operations: testRule.operations,
        body,
      });
      setTestResult(JSON.stringify(result, null, 2));
    } catch (err) {
      setTestResult(`Error: ${err instanceof Error ? err.message : "Invalid JSON"}`);
    } finally {
      setTesting(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await transforms.delete(selectedEndpoint, deleteTarget.id);
      setRules((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast.success("Rule deleted");
    } catch {
      toast.error("Failed to delete rule");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="px-4 sm:px-6 py-6 mx-auto max-w-4xl w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-base font-semibold text-text-primary">Transforms</h1>
          <p className="text-xs text-text-tertiary mt-0.5">
            Modify webhook payloads before forwarding
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
          New rule
        </Button>
      </div>

      {/* Endpoint selector */}
      {endpointList.length > 0 && (
        <div className="mb-5">
          <Select
            label="Endpoint"
            value={selectedEndpoint}
            onChange={(e) => setSelectedEndpoint(e.target.value)}
            options={endpointList.map((ep) => ({ value: ep.id, label: `${ep.name} (${ep.provider})` }))}
          />
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="mb-6 p-4 rounded-xl bg-bg-secondary border border-border-primary">
          <form onSubmit={(e) => void handleCreate(e)} className="space-y-4">
            <Input
              label="Rule name"
              value={ruleName}
              onChange={(e) => setRuleName(e.target.value)}
              placeholder="e.g. Strip card BIN"
              required
            />

            <div className="space-y-3">
              <label className="block text-sm font-medium text-text-primary">Operations</label>
              {ops.map((op, i) => (
                <div key={i} className="flex flex-wrap items-end gap-2 p-3 rounded-lg bg-bg-tertiary border border-border-primary">
                  <div className="w-32">
                    <Select
                      label="Type"
                      value={op.type}
                      onChange={(e) => updateOp(i, "type", e.target.value)}
                      options={OP_TYPES}
                    />
                  </div>
                  <div className="flex-1 min-w-[120px]">
                    <Input
                      label="Path"
                      value={op.path}
                      onChange={(e) => updateOp(i, "path", e.target.value)}
                      placeholder="data.card.bin"
                      required
                    />
                  </div>
                  {(op.type === "rename" || op.type === "copy") && (
                    <div className="flex-1 min-w-[120px]">
                      <Input
                        label="New path"
                        value={op.newPath}
                        onChange={(e) => updateOp(i, "newPath", e.target.value)}
                        placeholder="data.card_bin"
                        required
                      />
                    </div>
                  )}
                  {op.type === "set" && (
                    <div className="flex-1 min-w-[120px]">
                      <Input
                        label="Value"
                        value={op.value}
                        onChange={(e) => updateOp(i, "value", e.target.value)}
                        placeholder='"hookdash"'
                        required
                      />
                    </div>
                  )}
                  {ops.length > 1 && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeOp(i)}>
                      Remove
                    </Button>
                  )}
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" onClick={addOp}>
                + Add operation
              </Button>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Button type="submit" size="sm" loading={creating}>Create rule</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </form>
        </div>
      )}

      {/* Rules list */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : rules.length === 0 ? (
        <EmptyState
          title="No transform rules"
          description="Create rules to rename, remove, or inject fields before forwarding"
        />
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-3 rounded-xl bg-bg-secondary border border-border-primary"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text-primary">{rule.name}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      rule.isActive ? "bg-bg-success text-text-success" : "bg-bg-tertiary text-text-tertiary"
                    }`}
                  >
                    {rule.isActive ? "Active" : "Disabled"}
                  </span>
                  <span className="text-[10px] text-text-tertiary">
                    Priority: {rule.priority}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {rule.operations.map((op, i) => (
                    <span key={i} className="text-[10px] font-mono px-2 py-0.5 rounded bg-bg-tertiary text-text-secondary border border-border-primary">
                      {op.type}: {op.path}{op.newPath ? ` → ${op.newPath}` : ""}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button size="sm" variant="ghost" onClick={() => { setTestRule(testRule?.id === rule.id ? null : rule); setTestResult(null); }}>
                  Test
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void handleToggle(rule)}>
                  {rule.isActive ? "Disable" : "Enable"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDeleteTarget(rule)}
                  className="text-text-error hover:text-text-error"
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Test Preview Panel */}
      {testRule && (
        <div className="mt-4 p-4 rounded-xl bg-bg-secondary border border-border-primary">
          <h3 className="text-sm font-medium text-text-primary mb-2">Test &ldquo;{testRule.name}&rdquo;</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-text-tertiary mb-1">Input Body (JSON)</label>
              <textarea
                value={testBody}
                onChange={(e) => setTestBody(e.target.value)}
                className="w-full h-40 px-3 py-2 text-xs font-mono rounded-lg bg-bg-tertiary border border-border-primary text-text-primary focus:outline-none focus:ring-1 focus:ring-bg-accent resize-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-tertiary mb-1">Output</label>
              <pre className="w-full h-40 px-3 py-2 text-xs font-mono rounded-lg bg-bg-tertiary border border-border-primary text-text-secondary overflow-auto">
                {testResult ?? "Click 'Run Test' to see output"}
              </pre>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <Button size="sm" loading={testing} onClick={() => void handleTest()}>
              Run Test
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setTestRule(null)}>
              Close
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete transform rule"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
