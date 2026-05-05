"use client";

import type { AudioAnalysis } from "@/lib/audio/types";

const scoreLabels: Record<string, string> = {
  harshness: "刺さり",
  sibilance: "歯擦音",
  metallic: "金属感",
  hiss: "高域ノイズ",
  mud: "こもり",
  clipping: "クリップ",
  truePeak: "True Peak",
  degradation: "後半劣化"
};

function Bar({ label, value }: { label: string; value: number }) {
  const color = value > 70 ? "bg-rose-400" : value > 40 ? "bg-amber-300" : "bg-emerald-400";
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs"><span>{label}</span><span>{value.toFixed(0)}</span></div>
      <div className="h-2 rounded bg-slate-800"><div className={`h-2 rounded ${color}`} style={{ width: `${Math.min(100, value)}%` }} /></div>
    </div>
  );
}

export function AnalysisPanel({ analysis }: { analysis?: AudioAnalysis }) {
  if (!analysis) return <div className="rounded border border-line bg-panel p-4 text-sm text-muted">解析結果はここに表示されます。</div>;
  return (
    <div className="space-y-4 rounded border border-line bg-panel p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">解析スコア</h2>
        <span className="text-xs text-muted">推定値</span>
      </div>
      <div className="grid gap-3">
        {Object.entries(analysis.scores).map(([key, value]) => <Bar key={key} label={scoreLabels[key] ?? key} value={value} />)}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs text-muted">
        <div>Peak {analysis.peakDb.toFixed(1)} dBFS</div>
        <div>RMS {analysis.rmsDb.toFixed(1)} dBFS</div>
        <div>LUFS推定 {analysis.estimatedLufs.toFixed(1)}</div>
        <div>TP推定 {analysis.estimatedTruePeakDb.toFixed(1)} dBTP</div>
        <div>Centroid {analysis.spectralCentroid.toFixed(0)} Hz</div>
        <div>Flatness {analysis.spectralFlatness.toFixed(2)}</div>
      </div>
      <div className="border-t border-line pt-3 text-xs">
        <div className="mb-2 font-semibold text-ink">長尺劣化補正</div>
        <div className="grid gap-1 text-muted">
          <div>前半基準: {analysis.referenceProfile.startSec.toFixed(0)}s - {analysis.referenceProfile.endSec.toFixed(0)}s</div>
          <div>前半: {analysis.degradationSummary.firstThirdScore.toFixed(0)} / 中盤: {analysis.degradationSummary.middleThirdScore.toFixed(0)} / 後半: {analysis.degradationSummary.lastThirdScore.toFixed(0)}</div>
          <div>最大劣化区間: {analysis.degradationSummary.maxScoreStartSec.toFixed(0)}s - {analysis.degradationSummary.maxScoreEndSec.toFixed(0)}s</div>
          <div>推奨: {analysis.degradationSummary.recommendedPreset}</div>
        </div>
      </div>
      {analysis.warnings.length > 0 && (
        <div className="rounded border border-amber-300/30 bg-amber-300/10 p-3 text-xs text-amber-100">
          {analysis.warnings.map((warning) => <div key={warning}>{warning}</div>)}
        </div>
      )}
    </div>
  );
}
