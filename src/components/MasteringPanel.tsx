"use client";

import { masteringPresets } from "@/lib/audio/presets";
import type { ProcessingParams } from "@/lib/audio/types";

type Props = {
  selected: string;
  params: ProcessingParams;
  onPreset: (id: string) => void;
  setParams: (params: ProcessingParams) => void;
  onApply: () => void;
  canApply: boolean;
  busy: boolean;
};

function Slider({
  label,
  description,
  value,
  min,
  max,
  step = 1,
  onChange
}: {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-1.5 text-xs">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-slate-100">{label}</span>
        <span className="shrink-0 text-muted">{value}</span>
      </div>
      <div className="leading-relaxed text-muted">{description}</div>
      <input className="range w-full" type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.currentTarget.value))} />
    </label>
  );
}

export function MasteringPanel({ selected, params, onPreset, setParams, onApply, canApply, busy }: Props) {
  const update = (patch: Partial<ProcessingParams>) => setParams({ ...params, ...patch });

  return (
    <div className="rounded border border-line bg-panel p-4">
      <div className="mb-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">Mastering</h2>
          <label className="inline-flex items-center gap-2 text-sm">
            <span>{params.masteringEnabled ? "ON" : "OFF"}</span>
            <input type="checkbox" checked={params.masteringEnabled} onChange={(event) => update({ masteringEnabled: event.currentTarget.checked })} />
          </label>
        </div>
        <p className="mt-1 text-xs text-muted">Keeps the Song Fix values and lets you add mastering only when needed.</p>
      </div>

      <div className="mb-3 rounded border border-sky-300/25 bg-sky-300/10 px-3 py-2 text-xs leading-relaxed text-sky-50">
        Song Fix settings are carried over. Adjust only mastering tone and loudness here.
      </div>

      <div className="mb-4 grid gap-2 opacity-100">
        {masteringPresets.map((preset) => (
          <button
            key={preset.id}
            onClick={() => onPreset(preset.id)}
            className={`rounded border p-3 text-left text-sm transition ${selected === preset.id ? "border-fuchsia-300 bg-fuchsia-400/15" : "border-line bg-panel2 hover:border-slate-500"}`}
          >
            <div className="font-medium">{preset.name}</div>
            <div className="mt-1 text-xs leading-relaxed text-muted">{preset.description}</div>
            {preset.warning && <div className="mt-2 text-xs text-amber-200">{preset.warning}</div>}
          </button>
        ))}
      </div>

      <div className={`grid gap-3 ${params.masteringEnabled ? "" : "opacity-45"}`}>
        <Slider label="Target LUFS" description="Target value for automatic loudness. -14 is typical for streaming; around -10 is louder." value={params.targetLufs} min={-18} max={-8} step={0.5} onChange={(v) => update({ targetLufs: v })} />
        <Slider label="Low-end weight" description="Adjusts support around 60-120 Hz. Too much can sound muddy." value={params.lowWeight} min={-100} max={100} onChange={(v) => update({ lowWeight: v })} />
        <Slider label="Low-mid cleanup" description="Cleans buildup around 200-300 Hz to reduce mix cloudiness." value={params.lowMidCleanup} min={0} max={100} onChange={(v) => update({ lowMidCleanup: v })} />
        <Slider label="Presence" description="Shapes around 3 kHz to adjust vocal or lead presence." value={params.presence} min={-100} max={100} onChange={(v) => update({ presence: v })} />
        <Slider label="Air" description="Lightly adjusts air above 10 kHz. Be careful with AI-like high-end artifacts." value={params.air} min={-100} max={100} onChange={(v) => update({ air: v })} />
        <Slider label="Bass mono Hz" description="Reduces stereo difference below the selected Hz to stabilize bass in the center. 0 is off." value={params.bassMonoHz} min={0} max={160} step={5} onChange={(v) => update({ bassMonoHz: v })} />
        <Slider label="Master width" description="Fine-tunes overall stereo width. Negative values can help when later sections spread unnaturally." value={params.masterStereoWidth} min={-100} max={100} onChange={(v) => update({ masterStereoWidth: v })} />

        <label className="grid gap-1 rounded border border-line bg-panel2 p-3 text-sm">
          <span className="flex items-center justify-between gap-3">
            <span>Auto LUFS</span>
            <input type="checkbox" checked={params.autoLoudness} onChange={(event) => update({ autoLoudness: event.currentTarget.checked })} />
          </span>
          <span className="text-xs leading-relaxed text-muted">Moves toward the target using approximate LUFS. The final limiter protects peaks.</span>
        </label>

        <label className="grid gap-1 rounded border border-line bg-panel2 p-3 text-sm">
          <span className="flex items-center justify-between gap-3">
            <span>A/B loudness match</span>
            <input type="checkbox" checked={params.playbackLoudnessMatch} onChange={(event) => update({ playbackLoudnessMatch: event.currentTarget.checked })} />
          </span>
          <span className="text-xs leading-relaxed text-muted">Matches loudness only during playback comparison, reducing the louder-is-better illusion.</span>
        </label>

        <label className="grid gap-1 rounded border border-line bg-panel2 p-3 text-sm">
          <span className="flex items-center justify-between gap-3">
            <span>Lookahead limiter</span>
            <input type="checkbox" checked={params.lookaheadLimiter} onChange={(event) => update({ lookaheadLimiter: event.currentTarget.checked })} />
          </span>
          <span className="text-xs leading-relaxed text-muted">Looks ahead slightly to control peaks and prevent export clipping.</span>
        </label>
      </div>

      <div className="mt-4 rounded border border-fuchsia-300/25 bg-fuchsia-300/10 p-3">
        <button
          disabled={!canApply || busy}
          onClick={onApply}
          className="w-full rounded bg-fuchsia-300 px-4 py-3 text-sm font-semibold text-slate-950 disabled:opacity-40"
        >
          Apply with Mastering
        </button>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          If Mastering is ON, mastering is added to the current repair settings. If OFF, only repair is processed.
        </p>
      </div>
    </div>
  );
}
