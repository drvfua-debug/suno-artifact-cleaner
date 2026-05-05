"use client";

import type { AudioAnalysis } from "@/lib/audio/types";

const scoreLabels: Record<string, string> = {
  harshness: "Harshness",
  sibilance: "Sibilance",
  metallic: "Metallic tone",
  hiss: "High-frequency noise",
  mud: "Mud",
  clipping: "Clips",
  truePeak: "True Peak",
  degradation: "Late-section decay"
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
  if (!analysis) return <div className="rounded border border-line bg-panel p-4 text-sm text-muted">Analysis results appear here.</div>;
  return (
    <div className="space-y-4 rounded border border-line bg-panel p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Analysis Scores</h2>
        <span className="text-xs text-muted">Estimated</span>
      </div>
      <div className="grid gap-3">
        {Object.entries(analysis.scores).map(([key, value]) => <Bar key={key} label={scoreLabels[key] ?? key} value={value} />)}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs text-muted">
        <div>Peak {analysis.peakDb.toFixed(1)} dBFS</div>
        <div>RMS {analysis.rmsDb.toFixed(1)} dBFS</div>
        <div>LUFS estimate {analysis.estimatedLufs.toFixed(1)}</div>
        <div>TP estimate {analysis.estimatedTruePeakDb.toFixed(1)} dBTP</div>
        <div>Centroid {analysis.spectralCentroid.toFixed(0)} Hz</div>
        <div>Flatness {analysis.spectralFlatness.toFixed(2)}</div>
      </div>
      <div className="border-t border-line pt-3 text-xs">
        <div className="mb-2 font-semibold text-ink">Long Song Decay Fix</div>
        <div className="grid gap-1 text-muted">
          <div>Reference: {analysis.referenceProfile.startSec.toFixed(0)}s - {analysis.referenceProfile.endSec.toFixed(0)}s</div>
          <div>First: {analysis.degradationSummary.firstThirdScore.toFixed(0)} / Middle: {analysis.degradationSummary.middleThirdScore.toFixed(0)} / Last: {analysis.degradationSummary.lastThirdScore.toFixed(0)}</div>
          <div>Max Decay Section: {analysis.degradationSummary.maxScoreStartSec.toFixed(0)}s - {analysis.degradationSummary.maxScoreEndSec.toFixed(0)}s</div>
          <div>Recommended: {analysis.degradationSummary.recommendedPreset}</div>
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
