"use client";

import { useEffect, useState, FormEvent } from "react";
import {
  workspaces as workspacesApi,
  Workspace,
  WorkspaceMember,
  ApiError,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useFadeIn } from "@/hooks/use-gsap";

export default function SettingsPage() {
  const [, setWorkspaceList] = useState<Workspace[]>([]);
  const [workspace, setWorkspace] = useState<
    (Workspace & { members: WorkspaceMember[] }) | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");

  // Edit workspace
  const [editName, setEditName] = useState("");
  const [editRetention, setEditRetention] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Invite
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState(false);

  // Remove member
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Copy slug
  const [copied, setCopied] = useState(false);

  const contentRef = useFadeIn<HTMLDivElement>();

  async function fetchWorkspace() {
    setLoading(true);
    setFetchError("");
    try {
      const list = await workspacesApi.list();
      setWorkspaceList(list);
      if (list.length > 0) {
        const ws = await workspacesApi.get(list[0].id);
        setWorkspace(ws);
        setEditName(ws.name);
        setEditRetention(String(ws.retentionDays));
      }
    } catch (err) {
      setFetchError(
        err instanceof Error ? err.message : "Failed to load workspace",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchWorkspace();
  }, []);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!workspace) return;
    setSaveError("");
    setSaveSuccess(false);
    setSaving(true);
    try {
      const updated = await workspacesApi.update(workspace.id, {
        name: editName,
        retentionDays: parseInt(editRetention) || workspace.retentionDays,
      });
      setWorkspace((prev) => (prev ? { ...prev, ...updated } : prev));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      setSaveError(
        err instanceof ApiError ? err.message : "Failed to save changes",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    if (!workspace) return;
    setInviteError("");
    setInviteSuccess(false);
    setInviting(true);
    try {
      await workspacesApi.invite(workspace.id, inviteEmail, inviteRole);
      setInviteSuccess(true);
      setInviteEmail("");
      setInviteRole("member");
      setTimeout(() => {
        setInviteSuccess(false);
        setInviteOpen(false);
      }, 2000);
    } catch (err) {
      setInviteError(
        err instanceof ApiError ? err.message : "Failed to send invite",
      );
    } finally {
      setInviting(false);
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!workspace) return;
    setRemovingId(userId);
    try {
      await workspacesApi.removeMember(workspace.id, userId);
      setWorkspace((prev) =>
        prev
          ? {
              ...prev,
              members: prev.members.filter((m) => m.userId !== userId),
            }
          : prev,
      );
    } finally {
      setRemovingId(null);
    }
  }

  function copySlug() {
    if (!workspace) return;
    navigator.clipboard.writeText(workspace.slug).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const ownerCount =
    workspace?.members.filter((m) => m.role === "owner").length || 0;

  if (fetchError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-sm text-text-error">{fetchError}</p>
        <button
          onClick={() => void fetchWorkspace()}
          className="text-xs text-text-accent hover:underline cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-5 h-5 border-2 border-border-secondary border-t-text-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-sm text-text-tertiary">No workspace found</p>
      </div>
    );
  }

  return (
    <div
      ref={contentRef}
      className="px-4 sm:px-6 py-6 mx-auto max-w-3xl w-full"
    >
      <div className="mb-6">
        <h1 className="text-base font-semibold text-text-primary">Settings</h1>
        <p className="text-xs text-text-tertiary mt-0.5">
          Manage your workspace configuration
        </p>
      </div>

      <div className="space-y-6">
        {/* Workspace Info */}
        <Card>
          <CardHeader
            title="Workspace"
            description="General workspace settings"
          />
          {saveError && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-bg-error text-text-error text-sm">
              {saveError}
            </div>
          )}
          {saveSuccess && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-bg-success text-text-success text-sm">
              Settings saved
            </div>
          )}
          <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
            <Input
              label="Workspace Name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              required
            />
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-text-primary">
                Slug
              </label>
              <div className="flex items-center gap-2">
                <div className="flex-1 px-3 py-2 text-sm rounded-lg bg-bg-tertiary text-text-secondary border border-border-primary font-mono">
                  {workspace.slug}
                </div>
                <Button type="button" variant="secondary" size="sm" onClick={copySlug}>
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
            <Input
              label="Retention (days)"
              type="number"
              value={editRetention}
              onChange={(e) => setEditRetention(e.target.value)}
              min="1"
              max="365"
              required
            />
            <div className="pt-1">
              <Button type="submit" size="sm" loading={saving}>
                Save Changes
              </Button>
            </div>
          </form>
        </Card>

        {/* Members */}
        <Card>
          <CardHeader
            title="Members"
            description={`${workspace.members.length} member${workspace.members.length !== 1 ? "s" : ""}`}
            action={
              <Button size="sm" variant="secondary" onClick={() => setInviteOpen(!inviteOpen)}>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                >
                  <path d="M7 2v10M2 7h10" />
                </svg>
                Invite
              </Button>
            }
          />

          {inviteOpen && (
            <div className="mb-4 p-4 rounded-lg bg-bg-tertiary border border-border-primary">
              {inviteError && (
                <div className="mb-3 px-3 py-2 rounded-lg bg-bg-error text-text-error text-sm">
                  {inviteError}
                </div>
              )}
              {inviteSuccess && (
                <div className="mb-3 px-3 py-2 rounded-lg bg-bg-success text-text-success text-sm">
                  Invite sent
                </div>
              )}
              <form
                onSubmit={(e) => void handleInvite(e)}
                className="space-y-3"
              >
                <Input
                  label="Email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="team@example.com"
                  required
                />
                <Select
                  label="Role"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  options={[
                    { value: "member", label: "Member" },
                    { value: "owner", label: "Owner" },
                  ]}
                />
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setInviteOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" loading={inviting}>
                    Send Invite
                  </Button>
                </div>
              </form>
            </div>
          )}

          <div className="space-y-2">
            {workspace.members.map((member) => {
              const isOwner = member.role === "owner";
              const canRemove = !(isOwner && ownerCount <= 1);
              return (
                <div
                  key={member.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-3 rounded-lg
                    bg-bg-tertiary border border-border-primary group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-text-primary truncate">
                        {member.email}
                      </span>
                      <Badge variant={isOwner ? "warning" : "default"}>
                        {member.role}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-text-tertiary font-mono mt-0.5 tabular-nums">
                      Joined {new Date(member.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  {canRemove && (
                    <button
                      onClick={() => void handleRemoveMember(member.userId)}
                      disabled={removingId === member.userId}
                      className="p-2 rounded-lg text-text-tertiary hover:bg-bg-error hover:text-text-error cursor-pointer disabled:opacity-50
                        sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                    >
                      {removingId === member.userId ? (
                        <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        >
                          <path d="M3 5h10M5 5v8a1 1 0 001 1h4a1 1 0 001-1V5M7 3h2" />
                        </svg>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
