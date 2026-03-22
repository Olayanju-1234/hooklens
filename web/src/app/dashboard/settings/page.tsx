"use client";

import { useEffect, useState, FormEvent } from "react";
import {
  auth as authApi,
  workspaces as workspacesApi,
  Workspace,
  WorkspaceMember,
  WorkspaceInvite,
  UserProfile,
  ApiError,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useFadeIn } from "@/hooks/use-gsap";
import { useAuth } from "@/lib/auth-context";
import toast from "react-hot-toast";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api";
const BASE_URL = API_URL.replace(/\/api\/?$/, "");

export default function SettingsPage() {
  const { refreshWorkspaces, switchWorkspace, ingressSlug } = useAuth();
  const [workspaceList, setWorkspaceList] = useState<Workspace[]>([]);
  const [workspace, setWorkspace] = useState<
    (Workspace & { members: WorkspaceMember[] }) | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");

  // Profile
  const [profile, setProfile] = useState<UserProfile | null>(null);

  // Change password
  const [pwOpen, setPwOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwSubmitting, setPwSubmitting] = useState(false);

  // Edit workspace
  const [editName, setEditName] = useState("");
  const [editRetention, setEditRetention] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Invite
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState(false);

  // Pending invites
  const [pendingInvites, setPendingInvites] = useState<WorkspaceInvite[]>([]);
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null);

  // Remove member
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Create workspace
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [creating, setCreating] = useState(false);

  // Delete workspace
  const [deleteTarget, setDeleteTarget] = useState<Workspace | null>(null);
  const [deleting, setDeleting] = useState(false);

  const contentRef = useFadeIn<HTMLDivElement>();

  async function fetchAll() {
    setLoading(true);
    setFetchError("");
    try {
      const [prof, list] = await Promise.all([
        authApi.me(),
        workspacesApi.list(),
      ]);
      setProfile(prof);
      setWorkspaceList(list);
      if (list.length > 0) {
        const [ws, invites] = await Promise.all([
          workspacesApi.get(list[0].id),
          workspacesApi.listInvites(list[0].id).catch(() => [] as WorkspaceInvite[]),
        ]);
        setWorkspace(ws);
        setPendingInvites(invites);
        setEditName(ws.name);
        setEditRetention(String(ws.retentionDays));
      }
    } catch (err) {
      setFetchError(
        err instanceof Error ? err.message : "Failed to load settings",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchAll();
  }, []);

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    if (newPw !== confirmPw) {
      toast.error("Passwords do not match");
      return;
    }
    setPwSubmitting(true);
    try {
      await authApi.changePassword(currentPw, newPw);
      toast.success("Password changed");
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
      setPwOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to change password");
    } finally {
      setPwSubmitting(false);
    }
  }

  async function handleCreateWorkspace(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const created = await workspacesApi.create(createName);
      setWorkspaceList((prev) => [...prev, created]);
      setCreateName("");
      setCreateOpen(false);
      toast.success("Workspace created");
      await refreshWorkspaces();
      switchWorkspace(created.id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to create workspace");
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteWorkspace() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await workspacesApi.delete(deleteTarget.id);
      const remaining = workspaceList.filter((w) => w.id !== deleteTarget.id);
      setWorkspaceList(remaining);
      toast.success("Workspace deleted");
      await refreshWorkspaces();
      if (remaining.length > 0) {
        switchWorkspace(remaining[0].id);
      } else {
        setWorkspace(null);
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete workspace");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!workspace) return;
    setSaveError("");
    setSaving(true);
    try {
      const updated = await workspacesApi.update(workspace.id, {
        name: editName,
        retentionDays: parseInt(editRetention) || workspace.retentionDays,
      });
      setWorkspace((prev) => (prev ? { ...prev, ...updated } : prev));
      toast.success("Settings saved");
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
      toast.success("Invite sent");
      // Refresh invites
      const invites = await workspacesApi.listInvites(workspace.id).catch(() => []);
      setPendingInvites(invites);
      setTimeout(() => {
        setInviteSuccess(false);
        setInviteOpen(false);
      }, 1500);
    } catch (err) {
      setInviteError(
        err instanceof ApiError ? err.message : "Failed to send invite",
      );
    } finally {
      setInviting(false);
    }
  }

  async function handleRevokeInvite(inviteId: string) {
    if (!workspace) return;
    setRevokingInviteId(inviteId);
    try {
      await workspacesApi.revokeInvite(workspace.id, inviteId);
      setPendingInvites((prev) => prev.filter((i) => i.id !== inviteId));
      toast.success("Invite revoked");
    } catch {
      toast.error("Failed to revoke invite");
    } finally {
      setRevokingInviteId(null);
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!workspace) return;
    setRemovingId(userId);
    try {
      await workspacesApi.removeMember(workspace.id, userId);
      setWorkspace((prev) =>
        prev
          ? { ...prev, members: prev.members.filter((m) => m.userId !== userId) }
          : prev,
      );
      toast.success("Member removed");
    } catch {
      toast.error("Failed to remove member");
    } finally {
      setRemovingId(null);
    }
  }

  async function switchToWorkspace(ws: Workspace) {
    switchWorkspace(ws.id);
  }

  const ownerCount =
    workspace?.members.filter((m) => m.role === "owner").length || 0;

  if (fetchError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-sm text-text-error">{fetchError}</p>
        <button
          onClick={() => void fetchAll()}
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

  return (
    <div
      ref={contentRef}
      className="px-4 sm:px-6 py-6 mx-auto max-w-3xl w-full"
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-base font-semibold text-text-primary">Settings</h1>
          <p className="text-xs text-text-tertiary mt-0.5">
            Account and workspace configuration
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setCreateOpen(true)}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M7 2v10M2 7h10" />
          </svg>
          New Workspace
        </Button>
      </div>

      {/* Create workspace form */}
      {createOpen && (
        <div className="mb-5 p-4 rounded-xl bg-bg-secondary border border-border-primary">
          <form onSubmit={(e) => void handleCreateWorkspace(e)} className="space-y-3">
            <Input
              label="Workspace Name"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="e.g. My Project"
              required
            />
            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" loading={creating}>
                Create
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Workspace list (if multiple) */}
      {workspaceList.length > 1 && (
        <div className="mb-5">
          <p className="text-xs text-text-tertiary font-medium mb-2">Your Workspaces</p>
          <div className="flex flex-wrap gap-2">
            {workspaceList.map((ws) => (
              <button
                key={ws.id}
                onClick={() => switchToWorkspace(ws)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all cursor-pointer ${
                  workspace?.id === ws.id
                    ? "bg-bg-accent text-text-inverse border-transparent"
                    : "bg-bg-secondary text-text-primary border-border-primary hover:border-border-secondary"
                }`}
              >
                {ws.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* Account / Profile */}
        {profile && (
          <Card>
            <CardHeader
              title="Account"
              description="Your account details"
            />
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-text-tertiary font-medium mb-1">Email</p>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-text-primary">{profile.email}</span>
                    <Badge variant={profile.emailVerified ? "success" : "warning"}>
                      {profile.emailVerified ? "verified" : "unverified"}
                    </Badge>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-text-tertiary font-medium mb-1">Auth Method</p>
                  <span className="text-sm text-text-primary">
                    {profile.oauthProvider
                      ? `OAuth (${profile.oauthProvider})`
                      : "Email & Password"}
                  </span>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-text-tertiary font-medium mb-1">Account Created</p>
                  <span className="text-sm text-text-primary tabular-nums">
                    {new Date(profile.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {/* Ingress URL */}
              {ingressSlug && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-text-tertiary font-medium mb-1">Ingress URL</p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono text-text-accent bg-bg-tertiary px-2.5 py-1.5 rounded-lg break-all border border-border-primary">
                      {BASE_URL}/in/{ingressSlug}
                    </code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${BASE_URL}/in/${ingressSlug}`);
                        toast.success("Ingress URL copied");
                      }}
                      className="p-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-hover transition-colors cursor-pointer shrink-0"
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                        <rect x="5" y="5" width="8" height="8" rx="1" />
                        <path d="M3 11V4a1 1 0 011-1h7" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}

              {/* Change Password */}
              {!profile.oauthProvider && (
                <div className="pt-1">
                  {!pwOpen ? (
                    <Button size="sm" variant="secondary" onClick={() => setPwOpen(true)}>
                      Change Password
                    </Button>
                  ) : (
                    <form onSubmit={(e) => void handleChangePassword(e)} className="space-y-3 p-3 rounded-lg bg-bg-tertiary border border-border-primary">
                      <Input
                        label="Current Password"
                        type="password"
                        value={currentPw}
                        onChange={(e) => setCurrentPw(e.target.value)}
                        required
                      />
                      <Input
                        label="New Password"
                        type="password"
                        value={newPw}
                        onChange={(e) => setNewPw(e.target.value)}
                        placeholder="Min 8 characters"
                        required
                      />
                      <Input
                        label="Confirm New Password"
                        type="password"
                        value={confirmPw}
                        onChange={(e) => setConfirmPw(e.target.value)}
                        required
                      />
                      <div className="flex items-center gap-2">
                        <Button type="button" variant="secondary" size="sm" onClick={() => { setPwOpen(false); setCurrentPw(""); setNewPw(""); setConfirmPw(""); }}>
                          Cancel
                        </Button>
                        <Button type="submit" size="sm" loading={pwSubmitting}>
                          Update Password
                        </Button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Workspace Info */}
        {workspace && (
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
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(workspace.slug);
                      toast.success("Slug copied");
                    }}
                  >
                    Copy
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
        )}

        {/* Members */}
        {workspace && (
          <Card>
            <CardHeader
              title="Members"
              description={`${workspace.members.length} member${workspace.members.length !== 1 ? "s" : ""}`}
              action={
                <Button size="sm" variant="secondary" onClick={() => setInviteOpen(!inviteOpen)}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
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
                <form onSubmit={(e) => void handleInvite(e)} className="space-y-3">
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
                    <Button type="button" variant="secondary" size="sm" onClick={() => setInviteOpen(false)}>
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
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
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
        )}

        {/* Pending Invites */}
        {workspace && pendingInvites.length > 0 && (
          <Card>
            <CardHeader
              title="Pending Invites"
              description={`${pendingInvites.length} outstanding invitation${pendingInvites.length !== 1 ? "s" : ""}`}
            />
            <div className="space-y-2">
              {pendingInvites.map((invite) => {
                const expired = new Date(invite.expiresAt) < new Date();
                return (
                  <div
                    key={invite.id}
                    className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-3 rounded-lg
                      bg-bg-tertiary border border-border-primary group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-text-primary truncate">
                          {invite.email}
                        </span>
                        <Badge variant="default">{invite.role}</Badge>
                        {expired && <Badge variant="error">expired</Badge>}
                      </div>
                      <p className="text-[10px] text-text-tertiary font-mono mt-0.5 tabular-nums">
                        Sent {new Date(invite.createdAt).toLocaleDateString()}
                        {!expired && ` · Expires ${new Date(invite.expiresAt).toLocaleDateString()}`}
                      </p>
                    </div>
                    <button
                      onClick={() => void handleRevokeInvite(invite.id)}
                      disabled={revokingInviteId === invite.id}
                      className="p-2 rounded-lg text-text-tertiary hover:bg-bg-error hover:text-text-error cursor-pointer disabled:opacity-50
                        sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                      title="Revoke invite"
                    >
                      {revokingInviteId === invite.id ? (
                        <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                          <path d="M4 4l8 8M12 4l-8 8" />
                        </svg>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Danger Zone */}
        {workspaceList.length > 1 && workspace && (
          <Card>
            <CardHeader
              title="Danger Zone"
              description="Irreversible actions for this workspace"
            />
            <div className="flex items-center justify-between p-3 rounded-lg border border-red-500/20 bg-red-500/5">
              <div>
                <p className="text-sm font-medium text-text-primary">Delete workspace</p>
                <p className="text-xs text-text-tertiary mt-0.5">
                  Permanently delete &ldquo;{workspace.name}&rdquo; and all its data
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setDeleteTarget(workspace)}
                className="!text-red-400 !border-red-500/30 hover:!bg-red-500/10"
              >
                Delete
              </Button>
            </div>
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete workspace"
        description={`This will permanently delete "${deleteTarget?.name}" and all endpoints, events, and settings. This cannot be undone.`}
        confirmLabel="Delete Workspace"
        variant="danger"
        loading={deleting}
        onConfirm={() => void handleDeleteWorkspace()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
