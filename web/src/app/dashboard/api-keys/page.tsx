"use client";

import { useState, useEffect, FormEvent } from "react";
import { apiKeys, ApiKeyEntry, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import toast from "react-hot-toast";

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ApiKeyEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function fetchKeys() {
    setLoading(true);
    try {
      const data = await apiKeys.list();
      setKeys(data);
    } catch {
      toast.error("Failed to load API keys");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchKeys();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const result = await apiKeys.create(name);
      setRawKey(result.rawKey);
      setKeys((prev) => [result.apiKey, ...prev]);
      setName("");
      setShowCreate(false);
      toast.success("API key created");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create key");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    try {
      await apiKeys.revoke(id);
      setKeys((prev) => prev.map((k) => (k.id === id ? { ...k, isActive: false } : k)));
      toast.success("Key revoked");
    } catch {
      toast.error("Failed to revoke key");
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiKeys.delete(deleteTarget.id);
      setKeys((prev) => prev.filter((k) => k.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast.success("Key deleted");
    } catch {
      toast.error("Failed to delete key");
    } finally {
      setDeleting(false);
    }
  }

  function copyKey() {
    if (!rawKey) return;
    navigator.clipboard.writeText(rawKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="px-4 sm:px-6 py-6 mx-auto max-w-3xl w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-base font-semibold text-text-primary">API Keys</h1>
          <p className="text-xs text-text-tertiary mt-0.5">
            Manage programmatic access to your workspace
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
          Create key
        </Button>
      </div>

      {/* Raw key display (shown once after creation) */}
      {rawKey && (
        <Card className="mb-6">
          <div className="p-4">
            <p className="text-sm font-medium text-text-primary mb-1">
              Your new API key
            </p>
            <p className="text-xs text-text-secondary mb-3">
              Copy this key now. You won&apos;t be able to see it again.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 text-xs font-mono bg-bg-tertiary border border-border-primary rounded-lg text-text-accent break-all">
                {rawKey}
              </code>
              <Button size="sm" variant="secondary" onClick={copyKey}>
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="mt-2"
              onClick={() => setRawKey(null)}
            >
              Dismiss
            </Button>
          </div>
        </Card>
      )}

      {/* Create form */}
      {showCreate && (
        <Card className="mb-6">
          <div className="p-4">
            <form onSubmit={(e) => void handleCreate(e)} className="flex items-end gap-3">
              <div className="flex-1">
                <Input
                  label="Key name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. CI/CD Pipeline"
                  required
                />
              </div>
              <Button type="submit" size="sm" loading={creating}>
                Create
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </Button>
            </form>
          </div>
        </Card>
      )}

      {/* Key list */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-bg-secondary animate-pulse" />
          ))}
        </div>
      ) : keys.length === 0 ? (
        <EmptyState
          title="No API keys"
          description="Create an API key for programmatic access to your workspace"
        />
      ) : (
        <div className="space-y-2">
          {keys.map((key) => (
            <div
              key={key.id}
              className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-3 rounded-xl bg-bg-secondary border border-border-primary group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text-primary">{key.name}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      key.isActive
                        ? "bg-bg-success text-text-success"
                        : "bg-bg-error text-text-error"
                    }`}
                  >
                    {key.isActive ? "Active" : "Revoked"}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-[11px] text-text-tertiary font-mono">
                    {key.keyPrefix}...
                  </span>
                  <span className="text-[11px] text-text-tertiary">
                    Created {new Date(key.createdAt).toLocaleDateString()}
                  </span>
                  {key.lastUsedAt && (
                    <span className="text-[11px] text-text-tertiary">
                      Last used {new Date(key.lastUsedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {key.isActive && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void handleRevoke(key.id)}
                  >
                    Revoke
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDeleteTarget(key)}
                  className="text-text-error hover:text-text-error"
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete API key"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
