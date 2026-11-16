"use client";

import { useEffect, useState, type FormEvent } from "react";
import toast from "react-hot-toast";
import { ApiError, CHAOS_CHANGED_EVENT, chaos as chaosApi, type ChaosScope, type ChaosSetting, type ChaosTarget } from "@/lib/api";
import { clock, faultSummary } from "./chaos-format";

const DURATIONS = [
  { minutes: 15, label: "15 min" },
  { minutes: 30, label: "30 min" },
  { minutes: 60, label: "1 hour" },
  { minutes: 240, label: "4 hours" },
  { minutes: 1440, label: "24 hours" },
];

interface Fields {
  duplicatePct: string;
  duplicateCopies: string;
  duplicateGapS: string;
  delayPct: string;
  delayMinS: string;
  delayMaxS: string;
  reorderPct: string;
  reorderWindowS: string;
  stalePct: string;
  seed: string;
  scope: ChaosScope;
  minutes: number;
}

function fieldsFrom(s: ChaosSetting | null): Fields {
  const p = (v: number | undefined, fallback: number) => String(Math.round((v ?? fallback) * 100));
  const ms = (v: number | undefined, fallback: number) => String((v ?? fallback) / 1000);
  return {
    duplicatePct: p(s?.duplicateProbability, 1),
    duplicateCopies: String(s?.duplicateCopies ?? 2),
    duplicateGapS: ms(s?.duplicateGapMs, 5000),
    delayPct: p(s?.delayProbability, 0),
    delayMinS: ms(s?.delayMinMs, 30_000),
    delayMaxS: ms(s?.delayMaxMs, 120_000),
    reorderPct: p(s?.reorderProbability, 0),
    reorderWindowS: ms(s?.reorderWindowMs, 10_000),
    stalePct: p(s?.staleProbability, 0),
    seed: s?.seed ?? "",
    scope: s?.scope ?? "test",
    minutes: 30,
  };
}

const num = (text: string) => Number.parseFloat(text);
const prob = (text: string) => Math.min(Math.max((num(text) || 0) / 100, 0), 1);
const toMs = (text: string) => Math.round((num(text) || 0) * 1000);

interface Props {
  endpointId: string;
  target: ChaosTarget;
  onSaved: (setting: ChaosSetting | null) => void;
}

export function ChaosSettingsForm({ endpointId, target, onSaved }: Props) {
  const setting = target.chaos;
  const [f, setF] = useState<Fields>(() => fieldsFrom(setting));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (patch: Partial<Fields>) => setF((prev) => ({ ...prev, ...patch }));

  useEffect(() => {
    setF(fieldsFrom(target.chaos));
    setError("");
  }, [target.target, target.chaos]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const saved = await chaosApi.update(endpointId, target.target, {
        enabled: true,
        durationMinutes: f.minutes,
        scope: f.scope,
        ...(f.seed.trim() && { seed: f.seed.trim() }),
        duplicateProbability: prob(f.duplicatePct),
        duplicateCopies: Math.min(Math.max(Math.round(num(f.duplicateCopies) || 1), 1), 3),
        duplicateGapMs: toMs(f.duplicateGapS),
        delayProbability: prob(f.delayPct),
        delayMinMs: toMs(f.delayMinS),
        delayMaxMs: toMs(f.delayMaxS),
        reorderProbability: prob(f.reorderPct),
        reorderWindowMs: toMs(f.reorderWindowS),
        staleProbability: prob(f.stalePct),
      });
      onSaved(saved);
      toast.success(`Chaos on for ${target.label} until ${clock(saved.expiresAt ?? new Date().toISOString())}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save chaos settings");
    } finally {
      setBusy(false);
      window.dispatchEvent(new Event(CHAOS_CHANGED_EVENT));
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      await chaosApi.disable(endpointId, target.target);
      onSaved(setting ? { ...setting, enabled: false, active: false, expiresAt: null } : null);
      toast.success("Chaos mode is off for this target");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not switch chaos off");
    } finally {
      setBusy(false);
      window.dispatchEvent(new Event(CHAOS_CHANGED_EVENT));
    }
  }

  const active = Boolean(setting?.active);
  return (
    <form className="chaos-form" onSubmit={save}>
      <p className="chaos-state" data-on={active || undefined}>
        {active && setting ? (
          <>
            <b>ON</b> until {clock(setting.expiresAt!)} · {faultSummary(setting)} · seed <code>{setting.seed}</code>
          </>
        ) : (
          <>
            <b>OFF</b> Deliveries to {target.label} are left alone.
          </>
        )}
      </p>

      <fieldset className="fault-row">
        <legend>Duplicates</legend>
        <label className="fd-field"><span>chance %</span><input className="fd-input" type="number" min="0" max="100" value={f.duplicatePct} onChange={(e) => set({ duplicatePct: e.target.value })} /></label>
        <label className="fd-field"><span>extra copies</span><input className="fd-input" type="number" min="1" max="3" value={f.duplicateCopies} onChange={(e) => set({ duplicateCopies: e.target.value })} /></label>
        <label className="fd-field"><span>gap (s)</span><input className="fd-input" type="number" min="0" max="300" step="0.5" value={f.duplicateGapS} onChange={(e) => set({ duplicateGapS: e.target.value })} /></label>
      </fieldset>
      <fieldset className="fault-row">
        <legend>Delay</legend>
        <label className="fd-field"><span>chance %</span><input className="fd-input" type="number" min="0" max="100" value={f.delayPct} onChange={(e) => set({ delayPct: e.target.value })} /></label>
        <label className="fd-field"><span>min (s)</span><input className="fd-input" type="number" min="0" max="900" value={f.delayMinS} onChange={(e) => set({ delayMinS: e.target.value })} /></label>
        <label className="fd-field"><span>max (s)</span><input className="fd-input" type="number" min="0" max="900" value={f.delayMaxS} onChange={(e) => set({ delayMaxS: e.target.value })} /></label>
      </fieldset>
      <fieldset className="fault-row">
        <legend>Reorder</legend>
        <label className="fd-field"><span>chance %</span><input className="fd-input" type="number" min="0" max="100" value={f.reorderPct} onChange={(e) => set({ reorderPct: e.target.value })} /></label>
        <label className="fd-field"><span>window (s)</span><input className="fd-input" type="number" min="1" max="300" value={f.reorderWindowS} onChange={(e) => set({ reorderWindowS: e.target.value })} /></label>
      </fieldset>
      <fieldset className="fault-row">
        <legend>Stale replay</legend>
        <label className="fd-field"><span>chance %</span><input className="fd-input" type="number" min="0" max="100" value={f.stalePct} onChange={(e) => set({ stalePct: e.target.value })} /></label>
        <small className="fault-note">Replays a delivered event signed 10 minutes in the past.</small>
      </fieldset>

      <div className="chaos-form-meta">
        <label className="fd-field">
          <span>switch off after</span>
          <select className="fd-input" value={f.minutes} onChange={(e) => set({ minutes: Number(e.target.value) })}>
            {DURATIONS.map((d) => (
              <option key={d.minutes} value={d.minutes}>{d.label}</option>
            ))}
          </select>
        </label>
        <label className="fd-field">
          <span>seed</span>
          <input className="fd-input" value={f.seed} maxLength={64} onChange={(e) => set({ seed: e.target.value })} placeholder="random" />
        </label>
        <label className="fd-field fd-field--wide">
          <span>applies to</span>
          <select className="fd-input" value={f.scope} onChange={(e) => set({ scope: e.target.value as ChaosScope })}>
            <option value="test">Test payloads only (Simulator and scenarios)</option>
            <option value="all">All events, real provider traffic included (workspace owner)</option>
          </select>
          {f.scope === "all" && <small className="tone-red">Real webhooks to this target will be duplicated, delayed and reordered until chaos switches off.</small>}
        </label>
      </div>

      {error && <p className="form-error">{error}</p>}
      <div className="route-form-actions">
        <button type="submit" className="btn tower-cta" disabled={busy}>
          {busy ? "Saving…" : active ? "Save and restart timer" : "Turn chaos on"}
        </button>
        {active && (
          <button type="button" className="chip" data-tone="red" onClick={() => void turnOff()} disabled={busy}>
            Turn off
          </button>
        )}
      </div>
      <p className="fr-note">No header tells your handler a delivery is chaos, the same as real providers. Copies carry the same webhook-id and body, freshly signed.</p>
    </form>
  );
}
