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
        <p className="mt-1 text-xs text-muted">Song Fixで選んだ補正数値を引き継いだまま、必要な時だけマスタリングを足せます。</p>
      </div>

      <div className="mb-3 rounded border border-sky-300/25 bg-sky-300/10 px-3 py-2 text-xs leading-relaxed text-sky-50">
        Song Fixの設定が引き継がれます。ここではマスタリング用の質感と音量だけを追加調整します。
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
        <Slider label="目標LUFS" description="自動音量調整ON時の目標値です。配信は-14、音圧重視は-10前後が目安です。" value={params.targetLufs} min={-18} max={-8} step={0.5} onChange={(v) => update({ targetLufs: v })} />
        <Slider label="低域の重み" description="60-120Hz付近の支えを少し調整します。上げすぎると濁ります。" value={params.lowWeight} min={-100} max={100} onChange={(v) => update({ lowWeight: v })} />
        <Slider label="ローMid整理" description="200-300Hz付近の膨らみを整理します。ミックスの曇り取り用です。" value={params.lowMidCleanup} min={0} max={100} onChange={(v) => update({ lowMidCleanup: v })} />
        <Slider label="存在感" description="3kHz付近を整え、声や主旋律の見え方を調整します。" value={params.presence} min={-100} max={100} onChange={(v) => update({ presence: v })} />
        <Slider label="Air" description="10kHz以上の空気感を軽く調整します。AIっぽい高域がある時は上げすぎ注意です。" value={params.air} min={-100} max={100} onChange={(v) => update({ air: v })} />
        <Slider label="低域モノ化 Hz" description="指定Hz以下の左右差を減らし、低域を中央に安定させます。0でOFFです。" value={params.bassMonoHz} min={0} max={160} step={5} onChange={(v) => update({ bassMonoHz: v })} />
        <Slider label="マスター幅" description="全体のステレオ幅を微調整します。後半が散る音源ではマイナス方向も有効です。" value={params.masterStereoWidth} min={-100} max={100} onChange={(v) => update({ masterStereoWidth: v })} />

        <label className="grid gap-1 rounded border border-line bg-panel2 p-3 text-sm">
          <span className="flex items-center justify-between gap-3">
            <span>自動LUFS調整</span>
            <input type="checkbox" checked={params.autoLoudness} onChange={(event) => update({ autoLoudness: event.currentTarget.checked })} />
          </span>
          <span className="text-xs leading-relaxed text-muted">近似LUFSで目標音量に寄せます。最終段のリミッターでピークを保護します。</span>
        </label>

        <label className="grid gap-1 rounded border border-line bg-panel2 p-3 text-sm">
          <span className="flex items-center justify-between gap-3">
            <span>A/B音量マッチ</span>
            <input type="checkbox" checked={params.playbackLoudnessMatch} onChange={(event) => update({ playbackLoudnessMatch: event.currentTarget.checked })} />
          </span>
          <span className="text-xs leading-relaxed text-muted">再生比較時だけ音量差を揃えます。大きいから良く聞こえる錯覚を減らします。</span>
        </label>

        <label className="grid gap-1 rounded border border-line bg-panel2 p-3 text-sm">
          <span className="flex items-center justify-between gap-3">
            <span>Lookaheadリミッター</span>
            <input type="checkbox" checked={params.lookaheadLimiter} onChange={(event) => update({ lookaheadLimiter: event.currentTarget.checked })} />
          </span>
          <span className="text-xs leading-relaxed text-muted">ピークを少し先読みして抑えます。書き出し時の割れ防止に使います。</span>
        </label>
      </div>

      <div className="mt-4 rounded border border-fuchsia-300/25 bg-fuchsia-300/10 p-3">
        <button
          disabled={!canApply || busy}
          onClick={onApply}
          className="w-full rounded bg-fuchsia-300 px-4 py-3 text-sm font-semibold text-slate-950 disabled:opacity-40"
        >
          マスタリング込みで適用
        </button>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          MasteringがONなら、現在の補正設定にマスタリング処理を足して再処理します。OFFなら補正のみで再処理します。
        </p>
      </div>
    </div>
  );
}
