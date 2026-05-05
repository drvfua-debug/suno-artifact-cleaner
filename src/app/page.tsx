"use client";

import { useCallback, useMemo, useState } from "react";
import { Activity, Coffee, ShieldCheck } from "lucide-react";
import { AudioPlayer } from "@/components/AudioPlayer";
import { Dropzone } from "@/components/Dropzone";
import { ExportPanel } from "@/components/ExportPanel";
import { MasteringPanel } from "@/components/MasteringPanel";
import { ProcessingPanel } from "@/components/ProcessingPanel";
import { SpectrogramView } from "@/components/SpectrogramView";
import { SpectrumView } from "@/components/SpectrumView";
import { WaveformView } from "@/components/WaveformView";
import { analyzeAudio } from "@/lib/audio/analysis";
import { decodeAudioFile } from "@/lib/audio/decode";
import { processAudio } from "@/lib/audio/dsp";
import { applyMasteringPreset, applyPreset, defaultParams, presets } from "@/lib/audio/presets";
import { recommendForAnalysis } from "@/lib/audio/recommendation";
import type { AudioAnalysis, AudioBufferData, DegradationSummary, ProcessingParams, ProcessingResult, TimelineMetric } from "@/lib/audio/types";

type FileMeta = { name: string; size: number; bitDepth?: number; format: "WAV" | "MP3" };
type AppMode = "long" | "manual" | "report";
type PositiveSuggestion = {
  id: "air" | "vocal-body" | "low-weight";
  label: string;
  description: string;
  params: Partial<ProcessingParams>;
  recommended?: boolean;
};

const tabs: Array<{ id: AppMode; label: string; subLabel?: string }> = [
  { id: "long", label: "Song Fix", subLabel: "Long Song Decay Fix" },
  { id: "manual", label: "Manual", subLabel: "Easy mastering" },
  { id: "report", label: "Report", subLabel: "Analysis Report" }
];

const quickPresets = [
  { id: "natural", label: "Natural Clean" },
  { id: "de-harsh-vocal", label: "Vocal De-Harsh" },
  { id: "ai-glass", label: "AI Glass Reducer" },
  { id: "decay-balanced", label: "Long Song Decay Fix" }
];

const quickPresetIds = new Set(quickPresets.map((preset) => preset.id));
const otherPresetOptions = presets.filter((preset) => !quickPresetIds.has(preset.id));

function fmtBytes(bytes: number): string {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
}

function waitForPaint(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

function makeOutputFileName(sourceName: string | undefined, saveCount: number): string {
  const fallback = "processed";
  const clean = (sourceName ?? fallback).replace(/\.[^.]+$/, "") || fallback;
  return `${clean}${String(saveCount + 1).padStart(2, "0")}.wav`;
}

function inputFormat(file: File): FileMeta["format"] | undefined {
  const name = file.name.toLowerCase();
  if (name.endsWith(".wav")) return "WAV";
  if (name.endsWith(".mp3")) return "MP3";
  if (file.type === "audio/wav" || file.type === "audio/x-wav") return "WAV";
  if (file.type === "audio/mpeg" || file.type === "audio/mp3") return "MP3";
  return undefined;
}

function severity(score: number): string {
  if (score <= 20) return "Clean";
  if (score <= 40) return "Mild";
  if (score <= 60) return "Moderate";
  if (score <= 80) return "High";
  return "Severe";
}

function severityClass(score: number): string {
  if (score <= 20) return "text-emerald-200";
  if (score <= 40) return "text-sky-200";
  if (score <= 60) return "text-amber-200";
  if (score <= 80) return "text-orange-200";
  return "text-rose-200";
}

function causeLabel(cause: DegradationSummary["primaryCause"]): string {
  const labels: Record<DegradationSummary["primaryCause"], string> = {
    harshness: "Harshness",
    sibilance: "Sibilance",
    metallic: "Metallic tone",
    hiss: "High-end fizz",
    clipping: "Clipping",
    dynamic_range_loss: "Image flattening",
    stereo_instability: "Stereo instability",
    unknown: "Unknown"
  };
  return labels[cause];
}

function recommendedPresetLabel(preset: DegradationSummary["recommendedPreset"]): string {
  if (preset === "gentle") return "Long Song Decay Fix - Gentle";
  if (preset === "balanced") return "Long Song Decay Fix - Balanced";
  if (preset === "strong") return "Long Song Decay Fix - Strong";
  return "None";
}

function recommendedPresetId(preset: DegradationSummary["recommendedPreset"]): string {
  if (preset === "gentle") return "decay-gentle";
  if (preset === "strong") return "decay-strong";
  if (preset === "balanced") return "decay-balanced";
  return "natural";
}

function presetDisplayName(id: string, fallback: string): string {
  if (id === "manual-custom") return "Full Manual";
  return presets.find((item) => item.id === id)?.name ?? fallback;
}

function manualNeutralParams(current: ProcessingParams): ProcessingParams {
  return {
    ...current,
    repairAmount: 0,
    harshnessReduction: 0,
    sibilanceReduction: 0,
    metallicReduction: 0,
    hissReduction: 0,
    mudReduction: 0,
    toneLeveling: 0,
    bassEnhance: 0,
    vocalForward: 0,
    stereoWidthReduction: 0,
    layeredSpectralRepair: 0,
    highTextureRepair: 0,
    highAirRecover: 0,
    artifactHeadroomDb: -1.5,
    outputGainDb: 0,
    masteringEnabled: false,
    autoLoudness: false,
    lowWeight: 0,
    lowMidCleanup: 0,
    presence: 0,
    air: 0,
    vocalBody: 0,
    mixWarmth: 0,
    masterStereoWidth: 0,
    preserveBrightness: true,
    safeMode: true,
    longSongDecayFix: false,
    lookaheadLimiter: true
  };
}

function applyWavAirRecovery(params: ProcessingParams, analysis: AudioAnalysis, format: FileMeta["format"]): ProcessingParams {
  const current = params.highAirRecover ?? 0;
  if (format !== "WAV") return { ...params, highAirRecover: 0 };
  const loss = analysis.highFrequencyLossScore;
  const artifactRisk = Math.max(analysis.scores.hiss, analysis.scores.metallic, analysis.scores.sibilance);
  if (artifactRisk >= 48 || loss < 35) return params;
  let suggested = 0;
  if (loss >= 80 && artifactRisk < 34) suggested = 18;
  else if (loss >= 60 && artifactRisk < 38) suggested = 13;
  else if (loss >= 45 && artifactRisk < 42) suggested = 8;
  if (suggested <= 0) return params;
  return { ...params, highAirRecover: Math.max(current, suggested), preserveBrightness: true, safeMode: true };
}

function recommendedArtifactHeadroomDb(analysis: AudioAnalysis): number {
  const artifactSeverity = Math.max(
    analysis.scoreSeverity.hiss.raw,
    analysis.scoreSeverity.metallic.raw,
    analysis.scoreSeverity.sibilance.raw,
    analysis.scoreSeverity.harshness.raw,
    analysis.scoreSeverity.degradation.raw
  );
  if (artifactSeverity >= 140 || analysis.degradationSummary.maxScore >= 90) return -3;
  if (artifactSeverity >= 105 || analysis.degradationSummary.maxScore >= 70) return -2;
  if (artifactSeverity >= 70 || analysis.degradationSummary.maxScore >= 45) return -1.5;
  return -1;
}

function getPositiveSuggestions(analysis: AudioAnalysis | undefined, format: FileMeta["format"] | undefined): PositiveSuggestion[] {
  if (!analysis) return [];
  const suggestions: PositiveSuggestion[] = [];
  const artifactRisk = Math.max(analysis.scores.hiss, analysis.scores.metallic, analysis.scores.sibilance);
  if (format === "WAV" && analysis.highFrequencyLossScore >= 35 && artifactRisk < 48) {
    suggestions.push({
      id: "air",
      label: "Restore a little high-end air",
      description: "Use this only when a WAV clearly lacks high-end air. This adds brightness; it is not noise removal.",
      params: {},
      recommended: true
    });
  }
  if (analysis.scores.harshness < 70 && analysis.scores.sibilance < 70) {
    suggestions.push({
      id: "vocal-body",
      label: "Bring the vocal core slightly forward",
      description: "Adds a little vocal presence and midrange core. Keep it subtle on harsh tracks.",
      params: { vocalForward: 16, vocalBody: 14, presence: 4 },
      recommended: artifactRisk < 42
    });
  }
  if (analysis.scores.mud < 72) {
    suggestions.push({
      id: "low-weight",
      label: "Add a little low-end and background weight",
      description: "Adds low-end weight and background warmth. Use sparingly on muddy tracks.",
      params: { lowWeight: 12, bassEnhance: 10, mixWarmth: 10 },
      recommended: analysis.scores.mud < 48
    });
  }
  return suggestions;
}

function scoreDelta(before: AudioAnalysis | undefined, after: AudioAnalysis | undefined) {
  if (!before || !after) return undefined;
  return {
    lastThirdScore: before.degradationSummary.lastThirdScore - after.degradationSummary.lastThirdScore,
    maxDegradationScore: before.degradationSummary.maxScore - after.degradationSummary.maxScore,
    harshness: before.scores.harshness - after.scores.harshness,
    sibilance: before.scores.sibilance - after.scores.sibilance,
    metallic: before.scores.metallic - after.scores.metallic,
    hiss: before.scores.hiss - after.scores.hiss,
    mud: before.scores.mud - after.scores.mud,
    highFrequencyLoss: before.highFrequencyLossScore - after.highFrequencyLossScore,
    peakDb: after.peakDb - before.peakDb,
    estimatedLufs: after.estimatedLufs - before.estimatedLufs
  };
}

function scoreSeverityDelta(before: AudioAnalysis | undefined, after: AudioAnalysis | undefined) {
  if (!before || !after) return undefined;
  const keys = Object.keys(before.scoreSeverity) as Array<keyof AudioAnalysis["scoreSeverity"]>;
  return Object.fromEntries(keys.map((key) => [
    key,
    {
      rawBefore: before.scoreSeverity[key].raw,
      rawAfter: after.scoreSeverity[key].raw,
      rawImprovement: before.scoreSeverity[key].raw - after.scoreSeverity[key].raw,
      scoreBefore: before.scoreSeverity[key].score,
      scoreAfter: after.scoreSeverity[key].score
    }
  ]));
}

function buildReport(fileName: string | undefined, analysis: AudioAnalysis | undefined, processedAnalysis: AudioAnalysis | undefined, params: ProcessingParams, result: ProcessingResult | undefined, preset: string) {
  if (!analysis) return {};
  const delta = scoreDelta(analysis, processedAnalysis);
  const severityDelta = scoreSeverityDelta(analysis, processedAnalysis);
  return {
    sourceFilename: fileName,
    duration: analysis.duration,
    sampleRate: analysis.sampleRate,
    channels: analysis.channels,
    peak: analysis.peakDb,
    rms: analysis.rmsDb,
    estimatedTruePeak: analysis.estimatedTruePeakDb,
    estimatedLUFS: analysis.estimatedLufs,
    highRolloffHz: analysis.highRolloffHz,
    highFrequencyLossScore: analysis.highFrequencyLossScore,
    scoreSeverity: analysis.scoreSeverity,
    referenceProfile: analysis.referenceProfile,
    timelineMetrics: analysis.timelineMetrics,
    degradationSummary: analysis.degradationSummary,
    maxDegradationSection: {
      startSec: analysis.degradationSummary.maxScoreStartSec,
      endSec: analysis.degradationSummary.maxScoreEndSec
    },
    averageDegradationScore: analysis.degradationSummary.averageDegradationScore,
    firstThirdScore: analysis.degradationSummary.firstThirdScore,
    middleThirdScore: analysis.degradationSummary.middleThirdScore,
    lastThirdScore: analysis.degradationSummary.lastThirdScore,
    recommendedLongSongPreset: analysis.degradationSummary.recommendedPreset,
    temporalProcessingCurve: result?.temporalProcessingCurve ?? analysis.temporalProcessingCurve,
    processedAnalysis,
    processedScoreSeverity: processedAnalysis?.scoreSeverity,
    scoreDelta: delta,
    scoreSeverityDelta: severityDelta,
    selectedPreset: preset,
    manualParameters: params,
    processingChain: result?.chain ?? [],
    createdAt: new Date().toISOString()
  };
}

function ComparisonRow({ label, before, after, suffix = "", inverse = false }: { label: string; before: number; after?: number; suffix?: string; inverse?: boolean }) {
  const hasAfter = typeof after === "number" && Number.isFinite(after);
  const delta = hasAfter ? before - after : 0;
  const improved = inverse ? delta < 0 : delta > 0;
  const worsened = inverse ? delta > 0 : delta < 0;
  const afterWidth = hasAfter ? Math.max(2, Math.min(100, Math.abs(after))) : 0;
  return (
    <div className="rounded border border-line bg-panel2 p-3">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-slate-200">{label}</span>
        <span className={hasAfter ? improved ? "text-emerald-200" : worsened ? "text-amber-200" : "text-muted" : "text-muted"}>
          {hasAfter ? `${improved ? "Improved " : worsened ? "Increased " : "Changed "} ${Math.abs(delta).toFixed(1)}${suffix}` : "Shown after processing"}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-[52px_1fr_54px] items-center gap-2 text-[11px] text-muted">
        <span>Before</span>
        <div className="h-2 overflow-hidden rounded bg-slate-800"><div className="h-full rounded bg-sky-300" style={{ width: `${Math.max(2, Math.min(100, Math.abs(before)))}%` }} /></div>
        <span className="text-right">{before.toFixed(1)}{suffix}</span>
        <span>After</span>
        <div className="h-2 overflow-hidden rounded bg-slate-800"><div className="h-full rounded bg-fuchsia-300" style={{ width: `${afterWidth}%` }} /></div>
        <span className="text-right">{hasAfter ? `${after.toFixed(1)}${suffix}` : "-"}</span>
      </div>
    </div>
  );
}

function ScoreComparisonPanel({ before, after }: { before?: AudioAnalysis; after?: AudioAnalysis }) {
  if (!before) return null;
  return (
    <div className="rounded border border-line bg-panel p-4">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-semibold">Processed Score / Before-After</h2>
          <p className="text-xs text-muted">Re-analyzes before and after with the same approximate analysis logic.</p>
        </div>
        {after && <div className="text-xs text-emerald-200">Processed analysis complete</div>}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <ComparisonRow label="Late-section decay" before={before.degradationSummary.lastThirdScore} after={after?.degradationSummary.lastThirdScore} />
        <ComparisonRow label="Max decay" before={before.degradationSummary.maxScore} after={after?.degradationSummary.maxScore} />
        <ComparisonRow label="Harshness" before={before.scores.harshness} after={after?.scores.harshness} />
        <ComparisonRow label="Sibilance" before={before.scores.sibilance} after={after?.scores.sibilance} />
        <ComparisonRow label="Metallic tone" before={before.scores.metallic} after={after?.scores.metallic} />
        <ComparisonRow label="High-frequency noise" before={before.scores.hiss} after={after?.scores.hiss} />
        <ComparisonRow label="Mud" before={before.scores.mud} after={after?.scores.mud} />
        <ComparisonRow label="High-frequency loss" before={before.highFrequencyLossScore} after={after?.highFrequencyLossScore} />
      </div>
      {after && (
        <div className="mt-3 grid gap-2 text-xs text-muted sm:grid-cols-3">
          <div className="rounded bg-panel2 px-3 py-2">Processed Peak: <span className="text-slate-100">{after.peakDb.toFixed(1)} dBFS</span></div>
          <div className="rounded bg-panel2 px-3 py-2">Processed LUFS estimate: <span className="text-slate-100">{after.estimatedLufs.toFixed(1)}</span></div>
          <div className="rounded bg-panel2 px-3 py-2">Processed max section: <span className="text-slate-100">{formatTime(after.degradationSummary.maxScoreStartSec)} - {formatTime(after.degradationSummary.maxScoreEndSec)}</span></div>
        </div>
      )}
    </div>
  );
}

function SaturationRescuePanel({ before, after }: { before?: AudioAnalysis; after?: AudioAnalysis }) {
  if (!before) return null;
  const labels: Record<keyof AudioAnalysis["scoreSeverity"], string> = {
    harshness: "Harshness",
    sibilance: "Sibilance",
    metallic: "Metallic tone",
    hiss: "High-frequency noise",
    mud: "Mud",
    clipping: "Clips",
    truePeak: "True Peak",
    degradation: "Long-song decay",
    highFrequencyLoss: "High-frequency loss"
  };
  const rows = (Object.keys(before.scoreSeverity) as Array<keyof AudioAnalysis["scoreSeverity"]>)
    .map((key) => {
      const b = before.scoreSeverity[key];
      const a = after?.scoreSeverity[key];
      return {
        key,
        label: labels[key],
        beforeRaw: b.raw,
        afterRaw: a?.raw,
        beforeScore: b.score,
        afterScore: a?.score,
        saturated: b.saturated || (a?.saturated ?? false),
        improved: typeof a?.raw === "number" ? b.raw - a.raw : undefined
      };
    })
    .filter((row) => row.saturated || row.beforeRaw >= 92 || (row.afterRaw ?? 0) >= 92)
    .sort((a, b) => b.beforeRaw - a.beforeRaw)
    .slice(0, 5);
  if (!rows.length) return null;
  const bothPinned = rows.some((row) => row.beforeScore >= 99 && (row.afterScore ?? 0) >= 99 && typeof row.improved === "number");
  const worst = rows[0];
  const rescueHint = worst.key === "hiss" || worst.key === "metallic" || worst.key === "sibilance"
    ? "Rescue tip: focus on the max decay section and add Hiss / Metallic / Sibilance reduction gradually. This is safer than cutting the whole song hard."
    : worst.key === "degradation"
      ? "Rescue tip: loop the MAX section in the decay timeline and raise repair only until the Difference Monitor does not expose core musical elements."
      : "Rescue tip: do not jump straight to Strong. Keep Safe Mode on and add cause-specific sliders in small steps.";
  return (
    <div className="rounded border border-rose-300/35 bg-rose-400/10 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-semibold text-rose-50">100-Point Saturation Rescue</h2>
          <p className="mt-1 text-sm leading-relaxed text-rose-100/85">
            Even if the visible score stays at 100, the internal severity shows whether it improved. Sources far above 100 may not return to normal range in one pass.
          </p>
        </div>
        {bothPinned && <span className="rounded bg-rose-200 px-2 py-1 text-xs font-bold text-slate-950">Before/After both 100</span>}
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
        {rows.map((row) => (
          <div key={row.key} className="rounded border border-rose-200/20 bg-slate-950/45 p-3 text-xs">
            <div className="font-semibold text-slate-100">{row.label}</div>
            <div className="mt-2 text-muted">Display: {row.beforeScore.toFixed(0)}{typeof row.afterScore === "number" ? ` → ${row.afterScore.toFixed(0)}` : ""}</div>
            <div className="mt-1 text-rose-100">Internal: {row.beforeRaw.toFixed(0)}{typeof row.afterRaw === "number" ? ` → ${row.afterRaw.toFixed(0)}` : ""}</div>
            {typeof row.improved === "number" && (
              <div className={row.improved > 0 ? "mt-1 text-emerald-200" : "mt-1 text-amber-200"}>
                {row.improved > 0 ? "Improved" : "Worse"} {Math.abs(row.improved).toFixed(0)}
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-rose-100/90">{rescueHint}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        If the Difference Monitor contains a loud main vocal or instrument body, the repair is too strong. Reduce the amount and focus it on the target section.
      </p>
    </div>
  );
}

function InternalSeverityPanel({ before, after }: { before?: AudioAnalysis; after?: AudioAnalysis }) {
  if (!before) return null;
  const labels: Record<keyof AudioAnalysis["scoreSeverity"], string> = {
    harshness: "Harshness",
    sibilance: "Sibilance",
    metallic: "Metallic tone",
    hiss: "High-frequency noise",
    mud: "Mud",
    clipping: "Clips",
    truePeak: "True Peak",
    degradation: "Long-song decay",
    highFrequencyLoss: "High-frequency loss"
  };
  const rows = (Object.keys(labels) as Array<keyof AudioAnalysis["scoreSeverity"]>).map((key) => {
    const beforeScore = before.scoreSeverity[key];
    const afterScore = after?.scoreSeverity[key];
    const improvement = typeof afterScore?.raw === "number" ? beforeScore.raw - afterScore.raw : undefined;
    return { key, label: labels[key], beforeScore, afterScore, improvement };
  }).sort((a, b) => b.beforeScore.raw - a.beforeScore.raw);
  const pinned = rows.some((row) => row.beforeScore.raw >= 100 || (row.afterScore?.raw ?? 0) >= 100);
  const worst = rows[0];
  const hint = worst.key === "degradation"
    ? "When long-song decay is high, loop the MAX section in the Decay Timeline and confirm that repair is focused there."
    : worst.key === "hiss" || worst.key === "metallic" || worst.key === "sibilance"
      ? "When high-frequency items exceed 100, add Hiss / Metallic / Sibilance reduction gradually and check that core musical content is not removed."
      : "Even if values remain over 100, do not force them toward zero if the sound is natural. Listening improvement matters more than the number.";
  return (
    <div className="rounded border border-rose-300/35 bg-rose-400/10 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-semibold text-rose-50">Internal Severity / 100 Is the Reference</h2>
          <p className="mt-1 text-sm leading-relaxed text-rose-100/85">
            Aim for 100 or below. The display score is capped at 100, but this table shows internal values above 100.
          </p>
          <p className="mt-1 text-xs text-muted">
            If the number does not change after processing, the settings may not have been re-applied, the band may be outside the repair target, or the amount may be too low.
          </p>
        </div>
        {pinned && <span className="rounded bg-rose-200 px-2 py-1 text-xs font-bold text-slate-950">Over 100 detected</span>}
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-xs">
          <thead className="text-left text-muted">
            <tr className="border-b border-line">
              <th className="py-2 pr-3">Item</th>
              <th className="py-2 pr-3">Before</th>
              <th className="py-2 pr-3">After</th>
              <th className="py-2 pr-3">Improvement</th>
              <th className="py-2 pr-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const afterRaw = row.afterScore?.raw;
              const current = afterRaw ?? row.beforeScore.raw;
              return (
                <tr key={row.key} className="border-b border-line/70">
                  <td className="py-2 pr-3 font-semibold text-slate-100">{row.label}</td>
                  <td className={`py-2 pr-3 ${row.beforeScore.raw > 100 ? "text-rose-100" : "text-emerald-200"}`}>{row.beforeScore.raw.toFixed(0)}</td>
                  <td className={`py-2 pr-3 ${typeof afterRaw === "number" && afterRaw > 100 ? "text-rose-100" : "text-emerald-200"}`}>{typeof afterRaw === "number" ? afterRaw.toFixed(0) : "-"}</td>
                  <td className={typeof row.improvement === "number" && row.improvement > 0 ? "py-2 pr-3 text-emerald-200" : "py-2 pr-3 text-muted"}>
                    {typeof row.improvement === "number" ? `${row.improvement > 0 ? "-" : "+"}${Math.abs(row.improvement).toFixed(0)}` : "-"}
                  </td>
                  <td className="py-2 pr-3 text-muted">{current > 100 ? "Over 100" : "100 or less"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-rose-100/90">{hint}</p>
    </div>
  );
}

function InternalSeverityTable({ before, after }: { before?: AudioAnalysis; after?: AudioAnalysis }) {
  if (!before) return null;
  const labels: Record<keyof AudioAnalysis["scoreSeverity"], string> = {
    harshness: "Harshness",
    sibilance: "Sibilance",
    metallic: "Metallic tone",
    hiss: "High-frequency noise",
    mud: "Mud",
    clipping: "Clips",
    truePeak: "True Peak",
    degradation: "Long-song decay",
    highFrequencyLoss: "High-frequency loss"
  };
  const rows = (Object.keys(labels) as Array<keyof AudioAnalysis["scoreSeverity"]>).map((key) => {
    const beforeScore = before.scoreSeverity[key];
    const afterScore = after?.scoreSeverity[key];
    const delta = typeof afterScore?.raw === "number" ? afterScore.raw - beforeScore.raw : undefined;
    return { key, label: labels[key], beforeScore, afterScore, delta };
  }).sort((a, b) => b.beforeScore.raw - a.beforeScore.raw);
  const hasWorse = rows.some((row) => typeof row.delta === "number" && row.delta > 0.5);
  return (
    <div className="rounded border border-rose-300/35 bg-rose-400/10 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-semibold text-rose-50">Internal Severity / 100 Is the Reference</h2>
          <p className="mt-1 text-sm leading-relaxed text-rose-100/85">
            Aim for 100 or less. The higher the value above 100, the stronger that component remains. Items that increase after processing are marked as Worse.
          </p>
          <p className="mt-1 text-xs text-muted">
            Reducing one item can slightly raise another. If it sounds natural, it is acceptable; if it hurts, lower the related slider and process again.
          </p>
        </div>
        {hasWorse && <span className="rounded bg-amber-200 px-2 py-1 text-xs font-bold text-slate-950">Worse items detected</span>}
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-xs">
          <thead className="text-left text-muted">
            <tr className="border-b border-line">
              <th className="py-2 pr-3">Item</th>
              <th className="py-2 pr-3">Before</th>
              <th className="py-2 pr-3">After</th>
              <th className="py-2 pr-3">Delta</th>
              <th className="py-2 pr-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const afterRaw = row.afterScore?.raw;
              const current = afterRaw ?? row.beforeScore.raw;
              const delta = row.delta;
              const improved = typeof delta === "number" && delta < -0.5;
              const worsened = typeof delta === "number" && delta > 0.5;
              return (
                <tr key={row.key} className="border-b border-line/70">
                  <td className="py-2 pr-3 font-semibold text-slate-100">{row.label}</td>
                  <td className={`py-2 pr-3 ${row.beforeScore.raw > 100 ? "text-rose-100" : "text-emerald-200"}`}>{row.beforeScore.raw.toFixed(0)}</td>
                  <td className={`py-2 pr-3 ${typeof afterRaw === "number" && afterRaw > 100 ? "text-rose-100" : "text-emerald-200"}`}>{typeof afterRaw === "number" ? afterRaw.toFixed(0) : "-"}</td>
                  <td className={improved ? "py-2 pr-3 text-emerald-200" : worsened ? "py-2 pr-3 text-amber-200" : "py-2 pr-3 text-muted"}>
                    {typeof delta === "number" ? `${delta > 0 ? "+" : ""}${delta.toFixed(0)}` : "-"}
                  </td>
                  <td className={worsened ? "py-2 pr-3 font-semibold text-amber-200" : improved ? "py-2 pr-3 font-semibold text-emerald-200" : "py-2 pr-3 text-muted"}>
                    {worsened ? "Worse" : improved ? "Improved" : current > 100 ? "Over 100" : "100 or less"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        If vocals or instrument bodies are loud in Difference Monitor, the repair is too aggressive. If it sounds natural even with some score remaining, do not force everything below 100.
      </p>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded border border-line bg-panel p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${tone ?? ""}`}>{value}</div>
    </div>
  );
}

function timelineTone(score: number): { bg: string; border: string; text: string; label: string } {
  if (score <= 20) return { bg: "bg-emerald-400/70", border: "border-emerald-300/70", text: "text-emerald-100", label: "Clean" };
  if (score <= 40) return { bg: "bg-sky-400/75", border: "border-sky-300/70", text: "text-sky-100", label: "Mild" };
  if (score <= 60) return { bg: "bg-amber-300/80", border: "border-amber-200/70", text: "text-amber-100", label: "Moderate" };
  if (score <= 80) return { bg: "bg-orange-400/85", border: "border-orange-300/80", text: "text-orange-100", label: "High" };
  return { bg: "bg-rose-500/90", border: "border-rose-300/80", text: "text-rose-100", label: "Severe" };
}

function DegradationTimeline({ metrics, onSelect, title = "Decay Timeline" }: { metrics: TimelineMetric[]; onSelect: (start: number, end: number) => void; title?: string }) {
  if (!metrics.length) return <div className="rounded border border-line bg-panel p-4 text-sm text-muted">Load an audio file to show the Decay Timeline.</div>;
  const maxMetric = metrics.reduce((best, metric) => (metric.degradationRawScore ?? metric.degradationScore) > (best.degradationRawScore ?? best.degradationScore) ? metric : best, metrics[0]);
  const maxEnd = metrics[metrics.length - 1].endSec;
  return (
    <div className="rounded border border-line bg-panel p-4">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-xs text-muted">The horizontal axis is time; color and height show the decay score. Click a section to loop it.</p>
        </div>
        <div className="text-xs text-rose-100">
          Internal max: display {maxMetric.degradationScore.toFixed(0)} / internal {(maxMetric.degradationRawScore ?? maxMetric.degradationScore).toFixed(0)}
          Max: {formatTime(maxMetric.startSec)} - {formatTime(maxMetric.endSec)} / {maxMetric.degradationScore.toFixed(0)}
        </div>
      </div>
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-[720px] items-end gap-1">
          {metrics.map((metric, index) => {
            const score = metric.degradationScore;
            const rawScore = metric.degradationRawScore ?? metric.degradationScore;
            const tone = timelineTone(score);
            const isMax = metric === maxMetric;
            const showLabel = index % Math.max(1, Math.ceil(metrics.length / 8)) === 0 || isMax || index === metrics.length - 1;
            return (
              <button
                key={`${metric.startSec}-${metric.endSec}`}
                className={`group relative flex h-32 min-w-12 flex-1 flex-col justify-end rounded border bg-slate-900/70 p-1 text-left transition hover:border-sky-200 focus:outline-none focus:ring-2 focus:ring-sky-300 ${isMax ? "border-rose-200 shadow-[0_0_0_1px_rgba(251,113,133,0.65)]" : tone.border}`}
                title={`${formatTime(metric.startSec)}-${formatTime(metric.endSec)} / display ${score.toFixed(0)} / internal ${rawScore.toFixed(0)} / ${tone.label}`}
                onClick={() => onSelect(metric.startSec, metric.endSec)}
              >
                {isMax && <span className="absolute left-1 top-1 rounded bg-rose-300 px-1 text-[9px] font-bold text-slate-950">MAX</span>}
                <span className={`block w-full rounded ${tone.bg}`} style={{ height: `${Math.max(10, Math.min(100, rawScore))}%` }} />
                <span className="mt-1 block truncate text-center text-[10px] font-semibold text-slate-100">{score.toFixed(0)}</span>
                <span className={`block truncate text-center text-[9px] ${rawScore > 100 ? "text-rose-100" : "text-muted"}`}>raw {rawScore.toFixed(0)}</span>
                {showLabel && <span className="block truncate text-center text-[9px] text-muted">{formatTime(metric.startSec)}</span>}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex min-w-[720px] justify-between text-[10px] text-muted">
          <span>0:00</span>
          <span>{formatTime(maxEnd / 4)}</span>
          <span>{formatTime(maxEnd / 2)}</span>
          <span>{formatTime(maxEnd * 0.75)}</span>
          <span>{formatTime(maxEnd)}</span>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-5 gap-1 text-center text-[10px]">
        <span className="rounded bg-emerald-400/15 px-1 py-1 text-emerald-100">0-20 Clean</span>
        <span className="rounded bg-sky-400/15 px-1 py-1 text-sky-100">21-40 Mild</span>
        <span className="rounded bg-amber-300/15 px-1 py-1 text-amber-100">41-60 Moderate</span>
        <span className="rounded bg-orange-400/15 px-1 py-1 text-orange-100">61-80 High</span>
        <span className="rounded bg-rose-500/15 px-1 py-1 text-rose-100">81-100 Severe</span>
      </div>
    </div>
  );
}

export default function Home() {
  const [mode, setMode] = useState<AppMode>("long");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Load a WAV or MP3 file");
  const [fileMeta, setFileMeta] = useState<FileMeta>();
  const [audio, setAudio] = useState<AudioBufferData>();
  const [processed, setProcessed] = useState<AudioBufferData>();
  const [analysis, setAnalysis] = useState<AudioAnalysis>();
  const [processedAnalysis, setProcessedAnalysis] = useState<AudioAnalysis>();
  const [result, setResult] = useState<ProcessingResult>();
  const [params, setParams] = useState<ProcessingParams>(defaultParams);
  const [preset, setPreset] = useState("natural");
  const [masteringPreset, setMasteringPreset] = useState("");
  const [loop, setLoop] = useState<{ start: number; end: number }>();
  const [wavSaveCount, setWavSaveCount] = useState(0);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [longSongStrength, setLongSongStrength] = useState<"gentle" | "balanced" | "strong">("balanced");

  const fileInfo = useMemo(() => {
    if (!audio || !fileMeta) return "No file loaded";
    const duration = audio.channels[0].length / audio.sampleRate;
    const bitDepth = fileMeta.format === "WAV" ? ` / ${fileMeta.bitDepth ?? "?"}bit` : "";
    return `${fileMeta.name} / ${fileMeta.format} / ${duration.toFixed(1)}s / ${audio.sampleRate}Hz / ${audio.channels.length}ch${bitDepth} / ${fmtBytes(fileMeta.size)}`;
  }, [audio, fileMeta]);
  const outputFileName = useMemo(() => makeOutputFileName(fileMeta?.name, wavSaveCount), [fileMeta?.name, wavSaveCount]);
  const report = useMemo(() => buildReport(fileMeta?.name, analysis, processedAnalysis, params, result, preset), [fileMeta?.name, analysis, processedAnalysis, params, result, preset]);

  const updateParams = (next: ProcessingParams) => {
    setParams(next);
    setSettingsDirty(true);
  };

  const processWithParams = useCallback((nextParams: ProcessingParams) => {
    if (!audio || busy) return;
    setBusy(true);
    setProcessed(undefined);
    setProcessedAnalysis(undefined);
    setResult(undefined);
    setStatus("Processing...");
    window.setTimeout(async () => {
      try {
        await waitForPaint();
        const next = processAudio(audio, nextParams, analysis);
        setStatus("Analyzing processed score...");
        const nextProcessedAnalysis = analyzeAudio(next.audio, 10, analysis ? { startSec: analysis.referenceProfile.startSec, endSec: analysis.referenceProfile.endSec } : undefined);
        setProcessed(next.audio);
        setProcessedAnalysis(nextProcessedAnalysis);
        setResult(next);
        setSettingsDirty(false);
        const delta = scoreDelta(analysis, nextProcessedAnalysis);
        const improvement = delta ? ` / Late-section decay ${delta.lastThirdScore >= 0 ? "-" : "+"}${Math.abs(delta.lastThirdScore).toFixed(0)}` : "";
        setStatus(`Processing complete. Output peak ${next.peakDb.toFixed(1)} dBFS${improvement}`);
      } catch (error) {
        console.error(error);
        setStatus("Processing failed.");
      } finally {
        setBusy(false);
      }
    }, 20);
  }, [audio, busy, analysis]);

  const runProcess = useCallback(() => processWithParams(params), [processWithParams, params]);

  const loadFile = useCallback(async (file: File) => {
    const format = inputFormat(file);
    if (!format) {
      alert("Input supports WAV or MP3. Export is WAV.");
      return;
    }
    if (file.size > 300 * 1024 * 1024 && !confirm("This is a large file. Processing may take time and use a lot of browser memory. Continue?")) return;
    setBusy(true);
    setStatus("Decoding...");
    setProcessed(undefined);
    setProcessedAnalysis(undefined);
    setResult(undefined);
    setWavSaveCount(0);
    setSettingsDirty(false);
    try {
      const decoded = await decodeAudioFile(file);
      setAudio(decoded.data);
      setFileMeta({ name: file.name, size: file.size, bitDepth: decoded.bitDepth, format });
      setStatus("Analyzing...");
      const nextAnalysis = analyzeAudio(decoded.data, 10);
      const recommendation = recommendForAnalysis(nextAnalysis, format);
      const autoPresetId = recommendation.presetId;
      const autoParams = {
        ...applyPreset(defaultParams, autoPresetId),
        masteringEnabled: false,
        autoLoudness: false,
        highAirRecover: 0,
        bassEnhance: 0,
        vocalForward: 0,
        vocalBody: 0,
        lowWeight: 0,
        air: 0,
        artifactHeadroomDb: recommendedArtifactHeadroomDb(nextAnalysis)
      };
      setAnalysis(nextAnalysis);
      setPreset(autoPresetId);
      if (autoPresetId === "decay-gentle") setLongSongStrength("gentle");
      if (autoPresetId === "decay-balanced") setLongSongStrength("balanced");
      if (autoPresetId === "decay-strong") setLongSongStrength("strong");
      setParams(autoParams);
      setMasteringPreset("");
      setMode("long");
      const airMessage = format === "WAV" && autoParams.highAirRecover > 0 ? ` Added ${Math.round(autoParams.highAirRecover)}% high-air recovery for WAV. ` : "";
      setStatus(`Analysis complete. Auto-selected repair type: "${presetDisplayName(autoPresetId, recommendedPresetLabel(nextAnalysis.degradationSummary.recommendedPreset))}". ${airMessage}${recommendation.reason} Next, press Process.`);
    } catch (error) {
      console.error(error);
      setStatus("Loading or analysis failed.");
    } finally {
      setBusy(false);
    }
  }, []);

  const selectPreset = (id: string) => {
    setPreset(id);
    if (id === "decay-gentle") setLongSongStrength("gentle");
    if (id === "decay-balanced") setLongSongStrength("balanced");
    if (id === "decay-strong") setLongSongStrength("strong");
    setParams((current) => applyPreset(current, id));
    setSettingsDirty(true);
    setStatus("Repair type selected. Next, press Process.");
  };

  const selectMasteringPreset = (id: string) => {
    setMasteringPreset(id);
    setParams((current) => applyMasteringPreset(current, id));
    setSettingsDirty(true);
    setStatus("Mastering preset selected. Press Apply with Mastering if needed.");
  };

  const chooseRecommendedPreset = () => {
    const id = analysis ? recommendForAnalysis(analysis, fileMeta?.format ?? "WAV").presetId : recommendedPresetId(longSongStrength);
    const nextParams = { ...applyPreset(params, id), masteringEnabled: params.masteringEnabled, autoLoudness: params.autoLoudness };
    setPreset(id);
    setParams(nextParams);
    setSettingsDirty(true);
    setStatus("Returned to the recommended settings. Next, press Process.");
  };

  const chooseManualMode = () => {
    setPreset("manual-custom");
    setMasteringPreset("");
    setParams((current) => manualNeutralParams(current));
    setProcessed(undefined);
    setProcessedAnalysis(undefined);
    setResult(undefined);
    setSettingsDirty(true);
    setMode("manual");
    setStatus("Full Manual mode enabled. No preset is used; add only the needed changes with Manual / Easy mastering sliders.");
  };

  const recalcReference = () => {
    if (!audio) return;
    const startSec = params.referenceStartSec ?? analysis?.referenceProfile.startSec ?? 20;
    const endSec = params.referenceEndSec ?? analysis?.referenceProfile.endSec ?? 60;
    setBusy(true);
    setStatus("Re-analyzing with the Reference Section...");
    window.setTimeout(() => {
      try {
        const nextAnalysis = analyzeAudio(audio, 10, { startSec, endSec });
        setAnalysis(nextAnalysis);
        setProcessed(undefined);
        setProcessedAnalysis(undefined);
        setResult(undefined);
        setSettingsDirty(true);
        setStatus("Re-analysis complete. Apply again to reprocess.");
      } finally {
        setBusy(false);
      }
    }, 20);
  };

  const summary = analysis?.degradationSummary;
  const lastScore = summary?.lastThirdScore ?? 0;
  const maxScore = summary?.maxScore ?? 0;
  const recommended = summary ? recommendedPresetLabel(summary.recommendedPreset) : "Shown after analysis";
  const activeRecommendation = analysis ? recommendForAnalysis(analysis, fileMeta?.format ?? "WAV") : undefined;
  const recommendedAutoId = activeRecommendation?.presetId ?? "";
  const recommendedAutoLabel = analysis ? presetDisplayName(recommendedAutoId, recommended) : recommended;
  const positiveSuggestions = useMemo(() => getPositiveSuggestions(analysis, fileMeta?.format), [analysis, fileMeta?.format]);
  const mp3HighLossNotice = fileMeta?.format === "MP3" && analysis && analysis.highFrequencyLossScore >= 60;
  const wavAirRecoverNotice = fileMeta?.format === "WAV" && analysis && params.highAirRecover >= 6 && analysis.highFrequencyLossScore >= 35;
  const hasPositiveEnhancements =
    params.highAirRecover > 0 ||
    params.bassEnhance > 0 ||
    params.vocalForward > 0 ||
    params.vocalBody > 0 ||
    params.lowWeight > 0 ||
    params.air > 0 ||
    params.presence > 0 ||
    params.mixWarmth > 0;

  const clearPositiveEnhancements = () => {
    setParams((current) => ({
      ...current,
      highAirRecover: 0,
      bassEnhance: 0,
      vocalForward: 0,
      vocalBody: 0,
      lowWeight: 0,
      air: 0,
      presence: 0,
      mixWarmth: 0
    }));
    setSettingsDirty(true);
    setStatus("Cleared additive enhancements. Noise-reduction settings remain. Press Process to apply.");
  };

  const applyPositiveSuggestion = (id: PositiveSuggestion["id"]) => {
    const suggestion = positiveSuggestions.find((item) => item.id === id);
    if (!suggestion) return;
    setParams((current) => {
      if (id === "air" && analysis && fileMeta?.format) {
        return applyWavAirRecovery(current, analysis, fileMeta.format);
      }
      return { ...current, ...suggestion.params, safeMode: true, preserveBrightness: true };
    });
    setSettingsDirty(true);
    setStatus(`Added enhancement "${suggestion.label}". Press Process to apply.`);
  };

  return (
    <main className="min-h-screen pb-56 sm:pb-40">
      <header className="sticky top-0 z-10 border-b border-line bg-slate-950/90 px-4 py-3 backdrop-blur">
        <a href="/lando_hp/artifactcleaner/" className="absolute right-24 top-3 inline-flex items-center rounded border border-sky-300/40 bg-sky-400/10 px-3 py-2 text-xs font-semibold text-sky-100">
          Japanese
        </a>
        <a href="https://ko-fi.com/au987716" target="_blank" rel="noreferrer" className="absolute right-4 top-3 inline-flex items-center gap-2 rounded border border-rose-300/40 bg-rose-400/15 px-3 py-2 text-xs font-semibold text-rose-100">
          <Coffee className="h-4 w-4" /> Ko-fi
        </a>
        <div className="mx-auto max-w-[1600px] pr-44">
          <div className="flex items-center gap-2 text-lg font-semibold"><Activity className="h-5 w-5 text-sky-300" /> Suno Artifact Cleaner</div>
          <div className="mt-1 break-all text-xs text-muted">{fileInfo}</div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="hidden items-center gap-2 rounded border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-xs text-emerald-100 md:flex">
              <ShieldCheck className="h-4 w-4" /> Browser-only processing / No upload / Estimated analysis
            </div>
            <ExportPanel fileName={fileMeta?.name} processed={processed} analysis={analysis} processedAnalysis={processedAnalysis} params={params} result={result} preset={preset} outputFileName={outputFileName} onWavSaved={() => setWavSaveCount((count) => count + 1)} />
          </div>
        </div>
      </header>

      <nav className="sticky top-[104px] z-10 border-b border-line bg-slate-950/95 px-3 py-2 backdrop-blur sm:top-[116px]">
        <div className="mx-auto grid max-w-[1600px] grid-cols-3 gap-1 rounded border border-line bg-panel2 p-1 text-xs sm:flex sm:w-fit">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setMode(tab.id)} className={`rounded px-2 py-2 font-semibold ${mode === tab.id ? "bg-sky-300 text-slate-950" : "text-muted"}`}>
              <span className="block leading-tight">{tab.label}</span>
              {tab.subLabel && <span className="block text-[10px] leading-tight opacity-80">{tab.subLabel}</span>}
            </button>
          ))}
        </div>
      </nav>

      <div className="mx-auto max-w-[1600px] space-y-4 p-4">
        {mode === "long" && (
          <section className="space-y-4">
            {!audio && <Dropzone onFile={loadFile} busy={busy} />}
            <div className="rounded border border-sky-300/25 bg-sky-300/10 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-xs text-sky-100">Simple Repair</div>
                  <h2 className="mt-1 text-lg font-semibold">Auto-selects the recommended repair type</h2>
                  <p className="mt-1 text-sm text-muted">Drop a WAV / MP3 and the repair type is selected after analysis. If unsure, press Process as-is.</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 md:min-w-[360px]">
                  <button disabled={!analysis || busy} onClick={chooseRecommendedPreset} className="rounded border border-fuchsia-300/50 bg-fuchsia-300/15 px-4 py-3 text-sm font-semibold text-fuchsia-50 disabled:opacity-40">
                    <span className="block">Restore Recommendation</span>
                    <span className="block text-[11px] font-medium">Back to analysis recommendation</span>
                  </button>
                  <button disabled={!audio || busy} onClick={chooseManualMode} className="rounded border border-slate-500/70 bg-slate-800/70 px-4 py-3 text-sm font-semibold text-slate-100 disabled:opacity-40">
                    <span className="block">Full Manual</span>
                    <span className="block text-[11px] font-medium">Adjust without presets</span>
                  </button>
                </div>
              </div>
              <div className="mt-3 rounded border border-line bg-panel2 px-3 py-2 text-xs text-muted">
                After loading WAV / MP3, the recommended repair type is selected automatically. MP3 can be analyzed and processed, but export is WAV for easier quality checking. Choose Full Manual if you do not want to use a preset.
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {quickPresets.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => selectPreset(item.id)}
                    className={`rounded border p-3 text-left text-sm transition ${
                      preset === item.id || (item.id === "decay-balanced" && preset.startsWith("decay-"))
                        ? "border-fuchsia-300 bg-fuchsia-400/20"
                        : "border-line bg-panel2 hover:border-slate-500"
                    }`}
                  >
                    <span className="block font-semibold">{item.label}</span>
                    <span className="mt-1 block text-xs text-muted">
                      {item.id === "natural" ? "Light cleanup while preserving the source" :
                        item.id === "de-harsh-vocal" ? "Reduce sibilance and harshness" :
                          item.id === "ai-glass" ? "Reduce metallic/glassy tone" :
                            "Targets mid-late artifacts in long songs"}
                    </span>
                  </button>
                ))}
              </div>
              <div className="mt-3 rounded border border-line bg-panel p-3">
                <label className="grid gap-2 text-sm">
                  <span className="font-semibold">Other Presets</span>
                  <select
                    className="rounded border border-line bg-panel2 px-3 py-2 text-sm"
                    value={otherPresetOptions.some((item) => item.id === preset) ? preset : ""}
                    onChange={(event) => {
                      if (event.currentTarget.value) selectPreset(event.currentTarget.value);
                    }}
                  >
                    <option value="">Select another preset</option>
                    {otherPresetOptions.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                  <span className="text-xs leading-relaxed text-muted">Choose options such as Vocal Front Clean, Late Wide Noise Focus, and Strong Repair here.</span>
                </label>
              </div>
              {positiveSuggestions.length > 0 && (
                <div className="mt-3 rounded border border-emerald-300/25 bg-emerald-300/10 p-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-emerald-50">Additive Enhancement Suggestions</h3>
                      <p className="mt-1 text-xs leading-relaxed text-emerald-100/80">
                        Auto-selection only chooses subtractive noise reduction. Add brightness, weight, or vocal forwardness here only when needed.
                      </p>
                    </div>
                    <span className="text-[11px] text-muted">Press Process after adding</span>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      disabled={!hasPositiveEnhancements}
                      onClick={clearPositiveEnhancements}
                      className="rounded border border-emerald-300/30 px-3 py-2 text-xs font-semibold text-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Clear additive enhancements
                    </button>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-3">
                    {positiveSuggestions.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => applyPositiveSuggestion(item.id)}
                        className="rounded border border-emerald-300/25 bg-slate-950/35 p-3 text-left text-xs transition hover:border-emerald-200"
                      >
                        <span className="flex items-center justify-between gap-2 font-semibold text-emerald-50">
                          {item.label}
                          {item.recommended && <span className="rounded bg-emerald-200 px-1.5 py-0.5 text-[10px] text-slate-950">Suggested</span>}
                        </span>
                        <span className="mt-1 block leading-relaxed text-muted">{item.description}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {preset.startsWith("decay") && (
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs sm:max-w-md">
                  {(["gentle", "balanced", "strong"] as const).map((item) => (
                    <button key={item} onClick={() => { setLongSongStrength(item); selectPreset(recommendedPresetId(item)); }} className={`rounded border px-2 py-2 ${longSongStrength === item ? "border-fuchsia-300 bg-fuchsia-400/15" : "border-line bg-panel2"}`}>
                      {item}
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-4 grid gap-2 md:grid-cols-[1fr_auto] md:items-center">
                <div className="text-xs text-muted">
                  Current selection: <span className="font-semibold text-slate-100">{presetDisplayName(preset, recommended)}</span>
                  {analysis && preset !== "manual-custom" && <span className="ml-2 text-sky-200">Auto-selected after analysis</span>}
                  {preset === "manual-custom" && <span className="ml-2 text-slate-200">No preset used</span>}
                  {params.masteringEnabled && <span className="ml-2 text-fuchsia-200">Mastering ON</span>}
                  {activeRecommendation && <span className="mt-1 block text-slate-300">Auto decision: {activeRecommendation.reason}</span>}
                </div>
                <button disabled={!audio || busy} onClick={runProcess} className="rounded bg-fuchsia-300 px-5 py-3 text-sm font-semibold text-slate-950 disabled:opacity-40">
                  Process
                </button>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-6">
              <StatCard label="Late Decay Score" value={`${lastScore.toFixed(0)} / 100`} tone={severityClass(lastScore)} />
              <StatCard label="Status" value={severity(Math.max(lastScore, maxScore))} tone={severityClass(Math.max(lastScore, maxScore))} />
              <StatCard label="Primary Cause" value={summary ? causeLabel(summary.primaryCause) : "-"} />
              <StatCard label="Max Decay Section" value={summary ? `${formatTime(summary.maxScoreStartSec)} - ${formatTime(summary.maxScoreEndSec)}` : "-"} />
              <StatCard label="Recommended" value={recommendedAutoLabel.replace("Long Song Decay Fix - ", "")} />
              <StatCard label="High-frequency loss" value={analysis ? `${analysis.highFrequencyLossScore.toFixed(0)} / 100` : "-"} tone={analysis ? severityClass(analysis.highFrequencyLossScore) : ""} />
            </div>
            <ScoreComparisonPanel before={analysis} after={processedAnalysis} />
            <InternalSeverityTable before={analysis} after={processedAnalysis} />
            {mp3HighLossNotice && (
              <div className="rounded border border-sky-300/30 bg-sky-300/10 p-3 text-sm leading-relaxed text-sky-50">
                Strong high-frequency loss likely caused by MP3 was detected. This may come from MP3 compression or encoder roll-off, and does not necessarily mean AI degradation or a repair mistake. Export is WAV for easier checking.
              </div>
            )}
            {wavAirRecoverNotice && (
              <div className="rounded border border-emerald-300/30 bg-emerald-300/10 p-3 text-sm leading-relaxed text-emerald-50">
                High-frequency loss was detected in this WAV, so High Air Recovery was automatically set to {Math.round(params.highAirRecover)}%. It gently restores air inside Safe Mode without strongly boosting hiss or metallic tone.
              </div>
            )}
            <div className="rounded border border-line bg-panel p-4">
              <h2 className="font-semibold">Diagnostic Comment</h2>
              <p className="mt-2 text-sm text-muted">
                {summary ? `The max decay section is ${formatTime(summary.maxScoreStartSec)} - ${formatTime(summary.maxScoreEndSec)}. Primary increase: ${causeLabel(summary.primaryCause)}. Recommended: ${recommendedAutoLabel}.` : "Load an audio file to show the diagnostic comment."}
              </p>
              {activeRecommendation && <p className="mt-2 text-xs text-slate-300">Selection reason: {activeRecommendation.reason} confidence {Math.round(activeRecommendation.confidence * 100)}%</p>}
              {mp3HighLossNotice && <p className="mt-2 text-xs text-sky-200">Note: high-frequency loss may be caused by MP3 compression. Use strong air recovery or high-end boosts cautiously.</p>}
              {wavAirRecoverNotice && <p className="mt-2 text-xs text-emerald-200">Note: WAV high-air recovery is auto-detected. If main instruments appear loudly in the Difference Monitor, lower High Air Recovery.</p>}
              {summary && (
                <button onClick={() => setLoop({ start: summary.maxScoreStartSec, end: summary.maxScoreEndSec })} className="mt-3 rounded border border-sky-300/40 px-3 py-2 text-sm text-sky-100">
                  Listen to this section
                </button>
              )}
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <StatCard label="First Third Score" value={`${(summary?.firstThirdScore ?? 0).toFixed(0)}`} />
              <StatCard label="Middle Third Score" value={`${(summary?.middleThirdScore ?? 0).toFixed(0)}`} />
              <StatCard label="Last Third Score" value={`${(summary?.lastThirdScore ?? 0).toFixed(0)}`} tone={severityClass(lastScore)} />
            </div>
            {summary && summary.lastThirdScore > summary.firstThirdScore && <div className="rounded border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">The last third is +{(summary.lastThirdScore - summary.firstThirdScore).toFixed(0)} worse than the first third.</div>}
            <DegradationTimeline metrics={analysis?.timelineMetrics ?? []} onSelect={(start, end) => setLoop({ start, end })} title="Before Decay Timeline" />
            {processedAnalysis && (
              <DegradationTimeline metrics={processedAnalysis.timelineMetrics} onSelect={(start, end) => setLoop({ start, end })} title="After Decay Timeline" />
            )}
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded border border-line bg-panel p-4">
                <h2 className="mb-3 font-semibold">Reference Section</h2>
                <div className="text-sm text-muted">Auto-selected: {analysis ? `${formatTime(analysis.referenceProfile.startSec)} - ${formatTime(analysis.referenceProfile.endSec)}` : "-"}</div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <label className="grid gap-1">Start sec<input className="rounded border border-line bg-panel2 px-2 py-2" type="number" value={params.referenceStartSec ?? analysis?.referenceProfile.startSec ?? 20} onChange={(e) => updateParams({ ...params, referenceStartSec: Number(e.currentTarget.value) })} /></label>
                  <label className="grid gap-1">End sec<input className="rounded border border-line bg-panel2 px-2 py-2" type="number" value={params.referenceEndSec ?? analysis?.referenceProfile.endSec ?? 60} onChange={(e) => updateParams({ ...params, referenceEndSec: Number(e.currentTarget.value) })} /></label>
                </div>
                <button disabled={!audio || busy} onClick={recalcReference} className="mt-3 rounded bg-sky-300 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40">
                  Recalculate with reference
                  <span className="ml-2 text-xs font-medium">Recalculate</span>
                </button>
              </div>
              <SpectrogramView data={audio} timeline={analysis?.timelineMetrics} onSelect={(start, end) => setLoop({ start, end })} />
            </div>
          </section>
        )}

        {mode === "manual" && (
          <section className="grid gap-4 lg:grid-cols-[380px_1fr]">
            <div className="space-y-4">
              <MasteringPanel selected={masteringPreset} params={params} setParams={updateParams} onPreset={selectMasteringPreset} onApply={runProcess} canApply={!!audio} busy={busy} />
            </div>
            <div className="space-y-4">
              <div className="rounded border border-sky-300/25 bg-sky-300/10 p-3 text-xs leading-relaxed text-sky-50">
                The repair type and values selected in Song Fix are carried over. After adjusting sliders or Mastering here, reprocess from the Mastering panel or the bottom Apply Current Settings button.
              </div>
              {settingsDirty && processed && <div className="rounded border border-fuchsia-300/30 bg-fuchsia-300/10 p-3 text-xs text-fuchsia-100">Settings have changed. Press Apply Current Settings to reprocess.</div>}
              <ProcessingPanel params={params} setParams={updateParams} />
              <div className="grid gap-4 lg:grid-cols-2">
                <WaveformView original={audio} processed={processed} loop={loop} />
                <SpectrumView original={audio} processed={processed} />
              </div>
            </div>
          </section>
        )}

        {mode === "report" && (
          <section className="grid gap-4 lg:grid-cols-[1fr_420px]">
            <div className="rounded border border-line bg-panel p-4">
              <h2 className="mb-3 font-semibold">Analysis Report preview / analysis-report.json</h2>
              <pre className="max-h-[65vh] overflow-auto rounded bg-slate-950 p-3 text-xs text-slate-200">{JSON.stringify(report, null, 2)}</pre>
            </div>
            <div className="space-y-4">
              <div className="rounded border border-line bg-panel p-4 text-sm">
                <h2 className="mb-2 font-semibold">Summary</h2>
                <div className="space-y-1 text-muted">
                  <div>degradationSummary: {summary ? JSON.stringify(summary) : "-"}</div>
                  <div>referenceProfile: {analysis ? `${formatTime(analysis.referenceProfile.startSec)} - ${formatTime(analysis.referenceProfile.endSec)}` : "-"}</div>
                  <div>timelineMetrics: {analysis?.timelineMetrics.length ?? 0} chunks</div>
                  <div>processedAnalysis: {processedAnalysis ? `${processedAnalysis.timelineMetrics.length} chunks / last ${processedAnalysis.degradationSummary.lastThirdScore.toFixed(1)}` : "-"}</div>
                </div>
              </div>
              <div className="rounded border border-line bg-panel p-4">
                <h2 className="mb-3 font-semibold">Processing Chain</h2>
                <div className="space-y-2 text-sm text-muted">
                  {(result?.chain ?? ["Processing chain appears after applying settings"]).map((item) => <div key={item} className="rounded bg-panel2 px-3 py-2">{item}</div>)}
                </div>
              </div>
            </div>
          </section>
        )}
      </div>

      <div className="mx-auto max-w-[1600px] px-5 pb-6 text-sm text-muted">{status}</div>
      <AudioPlayer original={audio} processed={processed} loop={loop} setLoop={setLoop} loudnessMatch={params.playbackLoudnessMatch} outputFileName={outputFileName} onWavSaved={() => setWavSaveCount((count) => count + 1)} onProcess={runProcess} busy={busy} canProcess={!!audio} hasPositiveEnhancements={hasPositiveEnhancements} />
    </main>
  );
}
