"use client";

import type { ProcessingParams } from "@/lib/audio/types";

type Props = {
  params: ProcessingParams;
  setParams: (params: ProcessingParams) => void;
};

type SliderProps = {
  label: string;
  description: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
};

function Slider({ label, description, value, min = 0, max = 100, step = 1, onChange }: SliderProps) {
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

export function ProcessingPanel({ params, setParams }: Props) {
  const update = (patch: Partial<ProcessingParams>) => setParams({ ...params, ...patch });

  return (
    <div className="rounded border border-line bg-panel p-4">
      <div className="mb-3">
        <h2 className="font-semibold">Manual Controls</h2>
        <p className="mt-1 text-xs text-muted">After changing settings, press Apply in the bottom bar.</p>
      </div>

      <div className="grid gap-3">
        <Slider label="Repair Amount" description="Controls the overall strength of repair. Start around 30-60 if unsure." value={params.repairAmount} onChange={(v) => update({ repairAmount: v })} />
        <Slider label="Harshness Reduction" description="Reduces painful energy around 2.5-5 kHz. Too much can push vocal edges backward." value={params.harshnessReduction} onChange={(v) => update({ harshnessReduction: v })} />
        <Slider label="Sibilance Reduction" description="Reduces sibilants, cymbal bite, and breath harshness around 5-8.5 kHz." value={params.sibilanceReduction} onChange={(v) => update({ sibilanceReduction: v })} />
        <Slider label="Metallic Reduction" description="Reduces glassy, metallic, AI-like hardness around 8.5-13 kHz." value={params.metallicReduction} onChange={(v) => update({ metallicReduction: v })} />
        <Slider label="Hiss Reduction" description="Reduces fizz, hiss, and white haze around 13-18 kHz." value={params.hissReduction} onChange={(v) => update({ hissReduction: v })} />
        <Slider label="Mud Reduction" description="Cleans cloudiness and buildup around 150-350 Hz. Avoid cutting too much low-end body." value={params.mudReduction} onChange={(v) => update({ mudReduction: v })} />
        <Slider label="Grain Smoother" description="Lightly evens out level and texture variation. Too much can sound flat." value={params.toneLeveling} onChange={(v) => update({ toneLeveling: v })} />
        <Slider label="Safe Low-End Weight" description="Adds a little low-end support. If low-mid noise appears, lower it to around 0-10." value={params.bassEnhance} onChange={(v) => update({ bassEnhance: v })} />
        <Slider label="Vocal Forward" description="Brings centered vocals or leads slightly forward. Too much can narrow the stereo image." value={params.vocalForward} onChange={(v) => update({ vocalForward: v })} />
        <Slider label="Vocal Body" description="Adds vocal body and core. Start around 10-30 when the voice feels thin." value={params.vocalBody} onChange={(v) => update({ vocalBody: v })} />
        <Slider label="Mix Warmth" description="Adds a little low-mid warmth to the backing and overall mix. Lower it if it gets muddy." value={params.mixWarmth} onChange={(v) => update({ mixWarmth: v })} />
        <Slider label="Wide Noise Reduction" description="Reduces side-heavy high-frequency roughness that spreads out in later sections." value={params.stereoWidthReduction} onChange={(v) => update({ stereoWidthReduction: v })} />
        <Slider label="Layered Spectral Repair" description="Targets only bands that are degraded over time. Use Difference Monitor to check over-repair." value={params.layeredSpectralRepair} onChange={(v) => update({ layeredSpectralRepair: v })} />
        <Slider label="High Texture Repair" description="Safely smooths grain and shimmer around 9-18 kHz." value={params.highTextureRepair} onChange={(v) => update({ highTextureRepair: v })} />
        <Slider label="High Air Recovery" description="Automatically adds a little when high-frequency loss is detected in WAV. Restores air around 14 kHz; keep it subtle for MP3 or hissy sources." value={params.highAirRecover} onChange={(v) => update({ highAirRecover: v })} />
        <Slider label="Safety Headroom dB" description="Creates headroom by lowering level before repair. Usually -1 to -1.5 dB; use -2 to -3 dB only for rough sources." value={params.artifactHeadroomDb} min={-6} max={0} step={0.5} onChange={(v) => update({ artifactHeadroomDb: v })} />
        <Slider label="Output Gain dB" description="Adjusts level before export. Avoid pushing it too high to prevent clipping." value={params.outputGainDb} min={-12} max={6} step={0.5} onChange={(v) => update({ outputGainDb: v })} />
        <Slider label="True Peak Ceiling dBTP" description="Final peak ceiling. Around -1.0 to -1.5 dBTP is safer for distribution." value={params.truePeakCeilingDb} min={-2} max={-0.5} step={0.1} onChange={(v) => update({ truePeakCeilingDb: v })} />

        <label className="grid gap-1 rounded border border-line bg-panel2 p-3 text-sm">
          <span className="flex items-center justify-between gap-3">
            <span>Preserve Brightness</span>
            <input type="checkbox" checked={params.preserveBrightness} onChange={(event) => update({ preserveBrightness: event.currentTarget.checked })} />
          </span>
          <span className="text-xs leading-relaxed text-muted">Keeps high-frequency reduction conservative.</span>
        </label>

        <label className="grid gap-1 rounded border border-line bg-panel2 p-3 text-sm">
          <span className="flex items-center justify-between gap-3">
            <span>Safe Mode</span>
            <input type="checkbox" checked={params.safeMode} onChange={(event) => update({ safeMode: event.currentTarget.checked })} />
          </span>
          <span className="text-xs leading-relaxed text-muted">Limits strong attenuation and helps prevent the sound from becoming too dull.</span>
        </label>

        <label className="grid gap-1 rounded border border-line bg-panel2 p-3 text-sm">
          <span className="flex items-center justify-between gap-3">
            <span>Long Song Decay Fix</span>
            <input type="checkbox" checked={params.longSongDecayFix} onChange={(event) => update({ longSongDecayFix: event.currentTarget.checked })} />
          </span>
          <span className="text-xs leading-relaxed text-muted">Uses the early reference to reduce roughness and spreading noise that increases later over time.</span>
        </label>
      </div>
    </div>
  );
}
