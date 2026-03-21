"use client";

import { useEffect, useState, FormEvent } from "react";
import {
  alertChannels as channelsApi,
  alertRules as rulesApi,
  alertHistory as historyApi,
  AlertChannel,
  AlertRule,
  AlertHistoryEntry,
  ApiError,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useFadeIn } from "@/hooks/use-gsap";

type ChannelType = "slack" | "email" | "discord";

interface ChannelForm {
  type: ChannelType;
  name: string;
  webhookUrl: string;
  emailAddress: string;
}

const emptyChannelForm: ChannelForm = {
  type: "slack",
  name: "",
  webhookUrl: "",
  emailAddress: "",
};

interface RuleForm {
  name: string;
  type: "forward_failure" | "signature_failure" | "no_events";
  channelIds: string[];
  thresholdMinutes: string;
}

const emptyRuleForm: RuleForm = {
  name: "",
  type: "forward_failure",
  channelIds: [],
  thresholdMinutes: "30",
};

const channelTypeOptions = [
  { value: "slack", label: "Slack" },
  { value: "email", label: "Email" },
  { value: "discord", label: "Discord" },
];

const ruleTypeOptions = [
  { value: "forward_failure", label: "Forward Failure" },
  { value: "signature_failure", label: "Signature Failure" },
  { value: "no_events", label: "No Events" },
];

function ChannelTypeIcon({ type }: { type: string }) {
  if (type === "slack") {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4" />
      </svg>
    );
  }
  if (type === "email") {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2" y="3" width="12" height="10" rx="1" />
        <path d="M2 4l6 5 6-5" />
      </svg>
    );
  }
  // discord
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 3C3 4 2 6 2 8c0 3 2.5 5 6 5s6-2 6-5c0-2-1-4-3-5" />
      <circle cx="6" cy="8.5" r="1" fill="currentColor" />
      <circle cx="10" cy="8.5" r="1" fill="currentColor" />
    </svg>
  );
}

export default function AlertsPage() {
  const [channels, setChannels] = useState<AlertChannel[]>([]);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [history, setHistory] = useState<AlertHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");

  // Channel form state
  const [channelFormOpen, setChannelFormOpen] = useState(false);
  const [channelForm, setChannelForm] = useState<ChannelForm>(emptyChannelForm);
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [channelSubmitting, setChannelSubmitting] = useState(false);
  const [channelError, setChannelError] = useState("");
  const [testingChannelId, setTestingChannelId] = useState<string | null>(null);
  const [deletingChannelId, setDeletingChannelId] = useState<string | null>(
    null,
  );

  // Rule form state
  const [ruleFormOpen, setRuleFormOpen] = useState(false);
  const [ruleForm, setRuleForm] = useState<RuleForm>(emptyRuleForm);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [ruleSubmitting, setRuleSubmitting] = useState(false);
  const [ruleError, setRuleError] = useState("");
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);

  const contentRef = useFadeIn<HTMLDivElement>();

  async function fetchAll() {
    setLoading(true);
    setFetchError("");
    try {
      const [ch, ru, hi] = await Promise.all([
        channelsApi.list(),
        rulesApi.list(),
        historyApi.list(),
      ]);
      setChannels(ch);
      setRules(ru);
      setHistory(hi);
    } catch (err) {
      setFetchError(
        err instanceof Error ? err.message : "Failed to load alerts",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchAll();
  }, []);

  // Channel handlers
  function openCreateChannel() {
    setChannelForm(emptyChannelForm);
    setEditingChannelId(null);
    setChannelError("");
    setChannelFormOpen(true);
  }

  function openEditChannel(ch: AlertChannel) {
    setChannelForm({
      type: ch.type,
      name: ch.name,
      webhookUrl: ch.config.webhookUrl || "",
      emailAddress: ch.config.emailAddress || "",
    });
    setEditingChannelId(ch.id);
    setChannelError("");
    setChannelFormOpen(true);
  }

  async function handleChannelSubmit(e: FormEvent) {
    e.preventDefault();
    setChannelError("");
    setChannelSubmitting(true);
    try {
      const config: Record<string, string> =
        channelForm.type === "email"
          ? { emailAddress: channelForm.emailAddress }
          : { webhookUrl: channelForm.webhookUrl };

      if (editingChannelId) {
        const updated = await channelsApi.update(editingChannelId, {
          name: channelForm.name,
          config,
        });
        setChannels((prev) =>
          prev.map((c) => (c.id === editingChannelId ? updated : c)),
        );
      } else {
        const created = await channelsApi.create({
          type: channelForm.type,
          name: channelForm.name,
          config,
        });
        setChannels((prev) => [created, ...prev]);
      }
      setChannelFormOpen(false);
    } catch (err) {
      setChannelError(
        err instanceof ApiError ? err.message : "Something went wrong",
      );
    } finally {
      setChannelSubmitting(false);
    }
  }

  async function handleDeleteChannel(id: string) {
    setDeletingChannelId(id);
    try {
      await channelsApi.delete(id);
      setChannels((prev) => prev.filter((c) => c.id !== id));
    } finally {
      setDeletingChannelId(null);
    }
  }

  async function handleTestChannel(id: string) {
    setTestingChannelId(id);
    try {
      await channelsApi.test(id);
    } finally {
      setTestingChannelId(null);
    }
  }

  // Rule handlers
  function openCreateRule() {
    setRuleForm(emptyRuleForm);
    setEditingRuleId(null);
    setRuleError("");
    setRuleFormOpen(true);
  }

  function openEditRule(rule: AlertRule) {
    setRuleForm({
      name: rule.name,
      type: rule.type,
      channelIds: rule.channels.map((c) => c.id),
      thresholdMinutes: String(
        (rule.config.thresholdMinutes as number) || 30,
      ),
    });
    setEditingRuleId(rule.id);
    setRuleError("");
    setRuleFormOpen(true);
  }

  async function handleRuleSubmit(e: FormEvent) {
    e.preventDefault();
    setRuleError("");
    setRuleSubmitting(true);
    try {
      const config: Record<string, unknown> = {};
      if (ruleForm.type === "no_events") {
        config.thresholdMinutes = parseInt(ruleForm.thresholdMinutes) || 30;
      }

      if (editingRuleId) {
        const updated = await rulesApi.update(editingRuleId, {
          name: ruleForm.name,
          type: ruleForm.type,
          config,
          channelIds: ruleForm.channelIds,
        });
        setRules((prev) =>
          prev.map((r) => (r.id === editingRuleId ? updated : r)),
        );
      } else {
        const created = await rulesApi.create({
          name: ruleForm.name,
          type: ruleForm.type,
          config,
          channelIds: ruleForm.channelIds,
        });
        setRules((prev) => [created, ...prev]);
      }
      setRuleFormOpen(false);
    } catch (err) {
      setRuleError(
        err instanceof ApiError ? err.message : "Something went wrong",
      );
    } finally {
      setRuleSubmitting(false);
    }
  }

  async function handleToggleRule(rule: AlertRule) {
    const updated = await rulesApi.update(rule.id, {
      isActive: !rule.isActive,
    });
    setRules((prev) => prev.map((r) => (r.id === rule.id ? updated : r)));
  }

  async function handleDeleteRule(id: string) {
    setDeletingRuleId(id);
    try {
      await rulesApi.delete(id);
      setRules((prev) => prev.filter((r) => r.id !== id));
    } finally {
      setDeletingRuleId(null);
    }
  }

  function toggleChannelInRule(channelId: string) {
    setRuleForm((prev) => ({
      ...prev,
      channelIds: prev.channelIds.includes(channelId)
        ? prev.channelIds.filter((id) => id !== channelId)
        : [...prev.channelIds, channelId],
    }));
  }

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
    <div ref={contentRef} className="px-4 sm:px-6 py-6 mx-auto max-w-6xl w-full">
      <div className="space-y-8">
        {/* Channels Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">
                Channels
              </h2>
              <p className="text-xs text-text-tertiary mt-0.5">
                Where alerts are sent
              </p>
            </div>
            <Button size="sm" onClick={openCreateChannel}>
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
              Add Channel
            </Button>
          </div>

          {channelFormOpen && (
            <Card className="mb-4">
              <CardHeader
                title={editingChannelId ? "Edit Channel" : "New Channel"}
              />
              {channelError && (
                <div className="mb-3 px-3 py-2 rounded-lg bg-bg-error text-text-error text-sm">
                  {channelError}
                </div>
              )}
              <form
                onSubmit={(e) => void handleChannelSubmit(e)}
                className="space-y-4"
              >
                {!editingChannelId && (
                  <Select
                    label="Type"
                    value={channelForm.type}
                    onChange={(e) =>
                      setChannelForm((f) => ({
                        ...f,
                        type: e.target.value as ChannelType,
                      }))
                    }
                    options={channelTypeOptions}
                  />
                )}
                <Input
                  label="Name"
                  value={channelForm.name}
                  onChange={(e) =>
                    setChannelForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="e.g. Engineering Slack"
                  required
                />
                {channelForm.type === "email" ? (
                  <Input
                    label="Email Address"
                    type="email"
                    value={channelForm.emailAddress}
                    onChange={(e) =>
                      setChannelForm((f) => ({
                        ...f,
                        emailAddress: e.target.value,
                      }))
                    }
                    placeholder="alerts@yourteam.com"
                    required
                  />
                ) : (
                  <Input
                    label="Webhook URL"
                    type="url"
                    value={channelForm.webhookUrl}
                    onChange={(e) =>
                      setChannelForm((f) => ({
                        ...f,
                        webhookUrl: e.target.value,
                      }))
                    }
                    placeholder={`https://${channelForm.type === "discord" ? "discord.com/api/webhooks/..." : "hooks.slack.com/services/..."}`}
                    required
                  />
                )}
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setChannelFormOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" loading={channelSubmitting}>
                    {editingChannelId ? "Save" : "Create"}
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {channels.length === 0 ? (
            <EmptyState
              icon={
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 18 18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M13 6a4 4 0 00-8 0c0 4-2 5-2 5h12s-2-1-2-5M8 15a1.5 1.5 0 003 0" />
                </svg>
              }
              title="No channels configured"
              description="Add a Slack, Email, or Discord channel to receive alert notifications"
              action={
                <Button size="sm" onClick={openCreateChannel}>
                  Add your first channel
                </Button>
              }
            />
          ) : (
            <div className="space-y-2">
              {channels.map((ch) => (
                <div
                  key={ch.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-4 sm:px-5 py-4 rounded-xl
                    bg-bg-secondary border border-border-primary
                    hover:border-border-secondary hover:shadow-sm group"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-bg-tertiary flex items-center justify-center text-text-secondary shrink-0">
                      <ChannelTypeIcon type={ch.type} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-text-primary">
                          {ch.name}
                        </span>
                        <span className="text-[9px] uppercase tracking-widest font-semibold px-1.5 py-0.5 rounded text-text-tertiary bg-bg-tertiary">
                          {ch.type}
                        </span>
                        <Badge variant={ch.isActive ? "success" : "default"}>
                          {ch.isActive ? "active" : "inactive"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => void handleTestChannel(ch.id)}
                      disabled={testingChannelId === ch.id}
                      className="p-2 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-hover cursor-pointer disabled:opacity-50"
                      title="Send test"
                    >
                      {testingChannelId === ch.id ? (
                        <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        >
                          <path d="M5 3l8 5-8 5V3z" />
                        </svg>
                      )}
                    </button>
                    <button
                      onClick={() => openEditChannel(ch)}
                      className="p-2 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-hover cursor-pointer"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => void handleDeleteChannel(ch.id)}
                      disabled={deletingChannelId === ch.id}
                      className="p-2 rounded-lg text-text-tertiary hover:bg-bg-error hover:text-text-error cursor-pointer disabled:opacity-50"
                    >
                      {deletingChannelId === ch.id ? (
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
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Rules Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Rules</h2>
              <p className="text-xs text-text-tertiary mt-0.5">
                When to trigger alerts
              </p>
            </div>
            <Button size="sm" onClick={openCreateRule}>
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
              Add Rule
            </Button>
          </div>

          {ruleFormOpen && (
            <Card className="mb-4">
              <CardHeader
                title={editingRuleId ? "Edit Rule" : "New Rule"}
              />
              {ruleError && (
                <div className="mb-3 px-3 py-2 rounded-lg bg-bg-error text-text-error text-sm">
                  {ruleError}
                </div>
              )}
              <form
                onSubmit={(e) => void handleRuleSubmit(e)}
                className="space-y-4"
              >
                <Input
                  label="Name"
                  value={ruleForm.name}
                  onChange={(e) =>
                    setRuleForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="e.g. Alert on forward failures"
                  required
                />
                <Select
                  label="Type"
                  value={ruleForm.type}
                  onChange={(e) =>
                    setRuleForm((f) => ({
                      ...f,
                      type: e.target.value as RuleForm["type"],
                    }))
                  }
                  options={ruleTypeOptions}
                />
                {ruleForm.type === "no_events" && (
                  <Input
                    label="Threshold (minutes)"
                    type="number"
                    value={ruleForm.thresholdMinutes}
                    onChange={(e) =>
                      setRuleForm((f) => ({
                        ...f,
                        thresholdMinutes: e.target.value,
                      }))
                    }
                    placeholder="30"
                    required
                  />
                )}
                {channels.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-text-primary">
                      Channels
                    </label>
                    <div className="space-y-2">
                      {channels.map((ch) => (
                        <label
                          key={ch.id}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={ruleForm.channelIds.includes(ch.id)}
                            onChange={() => toggleChannelInRule(ch.id)}
                            className="rounded border-border-primary text-bg-accent focus:ring-border-focus"
                          />
                          <span className="text-sm text-text-secondary">
                            {ch.name}
                          </span>
                          <span className="text-[9px] uppercase tracking-widest font-semibold px-1.5 py-0.5 rounded text-text-tertiary bg-bg-tertiary">
                            {ch.type}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setRuleFormOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" loading={ruleSubmitting}>
                    {editingRuleId ? "Save" : "Create"}
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {rules.length === 0 ? (
            <EmptyState
              icon={
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 18 18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 9h3l2-4 2 8 2-4h3" />
                </svg>
              }
              title="No alert rules"
              description="Create rules to be notified when forward failures, signature issues, or inactivity is detected"
              action={
                <Button size="sm" onClick={openCreateRule}>
                  Create your first rule
                </Button>
              }
            />
          ) : (
            <div className="space-y-2">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-4 sm:px-5 py-4 rounded-xl
                    bg-bg-secondary border border-border-primary
                    hover:border-border-secondary hover:shadow-sm group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-text-primary">
                        {rule.name}
                      </span>
                      <Badge
                        variant={
                          rule.type === "forward_failure"
                            ? "error"
                            : rule.type === "signature_failure"
                              ? "warning"
                              : "info"
                        }
                      >
                        {rule.type.replace(/_/g, " ")}
                      </Badge>
                      <Badge variant={rule.isActive ? "success" : "default"}>
                        {rule.isActive ? "active" : "inactive"}
                      </Badge>
                    </div>
                    {rule.channels.length > 0 && (
                      <p className="text-xs text-text-tertiary mt-1.5">
                        {rule.channels.map((c) => c.name).join(", ")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => void handleToggleRule(rule)}
                      className="p-2 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-hover cursor-pointer"
                      title={rule.isActive ? "Pause" : "Activate"}
                    >
                      {rule.isActive ? (
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        >
                          <rect
                            x="4"
                            y="3"
                            width="2.5"
                            height="10"
                            rx="0.5"
                          />
                          <rect
                            x="9.5"
                            y="3"
                            width="2.5"
                            height="10"
                            rx="0.5"
                          />
                        </svg>
                      ) : (
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        >
                          <path d="M5 3l8 5-8 5V3z" />
                        </svg>
                      )}
                    </button>
                    <button
                      onClick={() => openEditRule(rule)}
                      className="p-2 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-hover cursor-pointer"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      >
                        <path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => void handleDeleteRule(rule.id)}
                      disabled={deletingRuleId === rule.id}
                      className="p-2 rounded-lg text-text-tertiary hover:bg-bg-error hover:text-text-error cursor-pointer disabled:opacity-50"
                    >
                      {deletingRuleId === rule.id ? (
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
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* History Section */}
        <section>
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-text-primary">
              Recent History
            </h2>
            <p className="text-xs text-text-tertiary mt-0.5">
              Recently sent alerts
            </p>
          </div>

          {history.length === 0 ? (
            <p className="text-xs text-text-tertiary py-8 text-center">
              No alerts sent yet
            </p>
          ) : (
            <div className="space-y-1">
              {history.map((entry) => {
                const rule = rules.find((r) => r.id === entry.alertRuleId);
                const channel = channels.find((c) => c.id === entry.channelId);
                return (
                  <HistoryEntry
                    key={entry.id}
                    entry={entry}
                    ruleName={rule?.name}
                    channel={channel}
                  />
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function HistoryEntry({
  entry,
  ruleName,
  channel,
}: {
  entry: AlertHistoryEntry;
  ruleName?: string;
  channel?: AlertChannel;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl bg-bg-secondary border border-border-primary">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-3 cursor-pointer text-left"
      >
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="text-sm text-text-primary">
            {ruleName || "Unknown rule"}
          </span>
          {entry.payload && (
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              className={`text-text-tertiary transition-transform ${expanded ? "rotate-90" : ""}`}
            >
              <path d="M4 2l4 4-4 4" />
            </svg>
          )}
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          {channel && (
            <div className="flex items-center gap-1.5 text-text-tertiary">
              <ChannelTypeIcon type={channel.type} />
              <span className="text-xs">{channel.name}</span>
            </div>
          )}
          <span className="text-[11px] text-text-tertiary font-mono tabular-nums">
            {new Date(entry.sentAt).toLocaleString()}
          </span>
        </div>
      </button>
      {expanded && entry.payload && (
        <div className="px-4 pb-3">
          <pre className="text-xs font-mono text-text-secondary bg-bg-tertiary rounded-lg p-3 overflow-x-auto max-h-48">
            {JSON.stringify(entry.payload, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
