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
        <p className="mt-1 text-xs text-muted">設定後は下部固定バーの「適用」を押してください。</p>
      </div>

      <div className="grid gap-3">
        <Slider label="全体補正量" description="各補正の効き具合をまとめて調整します。迷ったら30-60程度から試してください。" value={params.repairAmount} onChange={(v) => update({ repairAmount: v })} />
        <Slider label="刺さり軽減" description="2.5kHz-5kHz付近の耳に痛い成分を抑えます。上げすぎると声の輪郭が奥に下がります。" value={params.harshnessReduction} onChange={(v) => update({ harshnessReduction: v })} />
        <Slider label="歯擦音軽減" description="5kHz-8.5kHz付近のサ行、シンバル、息の刺さりを抑えます。" value={params.sibilanceReduction} onChange={(v) => update({ sibilanceReduction: v })} />
        <Slider label="金属感軽減" description="8.5kHz-13kHz付近のガラスっぽさ、金属的な響き、AIっぽい硬さを抑えます。" value={params.metallicReduction} onChange={(v) => update({ metallicReduction: v })} />
        <Slider label="高域ノイズ軽減" description="13kHz-18kHz付近のチリチリ、ヒス、白く濁る高域を抑えます。" value={params.hissReduction} onChange={(v) => update({ hissReduction: v })} />
        <Slider label="こもり軽減" description="150Hz-350Hz付近の濁りや膨らみを整理します。低音の厚みまで削りすぎないよう注意。" value={params.mudReduction} onChange={(v) => update({ mudReduction: v })} />
        <Slider label="粒立ち整理" description="音量や質感のばらつきを軽く揃えます。強くすると平坦に聞こえることがあります。" value={params.toneLeveling} onChange={(v) => update({ toneLeveling: v })} />
        <Slider label="安全低域追加" description="低域の支えを少し足します。中低域ノイズが出る場合は0-10程度に下げてください。" value={params.bassEnhance} onChange={(v) => update({ bassEnhance: v })} />
        <Slider label="ボーカル前出し" description="中央の声や主旋律を少し前に出します。上げすぎるとステレオ感が狭くなります。" value={params.vocalForward} onChange={(v) => update({ vocalForward: v })} />
        <Slider label="ボーカルの太さ" description="声の胴鳴りや芯を足します。スカスカ感がある時は10-30程度から試してください。" value={params.vocalBody} onChange={(v) => update({ vocalBody: v })} />
        <Slider label="背景の暖かさ" description="伴奏や全体の中低域を少し厚くします。濁る場合は下げてください。" value={params.mixWarmth} onChange={(v) => update({ mixWarmth: v })} />
        <Slider label="広がりノイズ抑制" description="後半で横に広がるザラつきやSide側の高域ノイズを抑えます。" value={params.stereoWidthReduction} onChange={(v) => update({ stereoWidthReduction: v })} />
        <Slider label="階層スペクトル補正" description="時間ごとの劣化が強い帯域だけを細かく抑えます。Difference Monitorで削りすぎを確認してください。" value={params.layeredSpectralRepair} onChange={(v) => update({ layeredSpectralRepair: v })} />
        <Slider label="高域質感補正" description="9kHz-18kHz付近の粒子感やシマー成分を、スペクトル上で安全に整えます。" value={params.highTextureRepair} onChange={(v) => update({ highTextureRepair: v })} />
        <Slider label="高域エア補完" description="WAVで高域欠落を検出した時は自動で少し入ります。14kHz付近の空気感を戻しますが、MP3やヒスが多い音源では控えめ推奨です。" value={params.highAirRecover} onChange={(v) => update({ highAirRecover: v })} />
        <Slider label="安全ヘッドルーム dB" description="補正前に少し音量を下げて余白を作ります。通常は-1から-1.5dB、荒れが強い曲だけ-2から-3dBにします。" value={params.artifactHeadroomDb} min={-6} max={0} step={0.5} onChange={(v) => update({ artifactHeadroomDb: v })} />
        <Slider label="出力ゲイン dB" description="書き出し前の音量を調整します。音割れ防止のため上げすぎない設定にしてください。" value={params.outputGainDb} min={-12} max={6} step={0.5} onChange={(v) => update({ outputGainDb: v })} />
        <Slider label="True Peak上限 dBTP" description="最終ピークの上限です。配信用途では-1.0から-1.5dBTP付近が安全です。" value={params.truePeakCeilingDb} min={-2} max={-0.5} step={0.1} onChange={(v) => update({ truePeakCeilingDb: v })} />

        <label className="grid gap-1 rounded border border-line bg-panel2 p-3 text-sm">
          <span className="flex items-center justify-between gap-3">
            <span>明るさを保つ</span>
            <input type="checkbox" checked={params.preserveBrightness} onChange={(event) => update({ preserveBrightness: event.currentTarget.checked })} />
          </span>
          <span className="text-xs leading-relaxed text-muted">高域を削りすぎないよう補正量を控えめにします。</span>
        </label>

        <label className="grid gap-1 rounded border border-line bg-panel2 p-3 text-sm">
          <span className="flex items-center justify-between gap-3">
            <span>安全モード</span>
            <input type="checkbox" checked={params.safeMode} onChange={(event) => update({ safeMode: event.currentTarget.checked })} />
          </span>
          <span className="text-xs leading-relaxed text-muted">強い減衰を制限し、音が丸くなりすぎるのを防ぎます。</span>
        </label>

        <label className="grid gap-1 rounded border border-line bg-panel2 p-3 text-sm">
          <span className="flex items-center justify-between gap-3">
            <span>長尺劣化補正</span>
            <input type="checkbox" checked={params.longSongDecayFix} onChange={(event) => update({ longSongDecayFix: event.currentTarget.checked })} />
          </span>
          <span className="text-xs leading-relaxed text-muted">前半を基準に、後半だけ増えるザラつきや広がりノイズを時間変化で抑えます。</span>
        </label>
      </div>
    </div>
  );
}
