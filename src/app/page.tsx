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
import { buildRecommendedParams, buildRepairOptions, recommendForAnalysis } from "@/lib/audio/recommendation";
import type { RepairOption } from "@/lib/audio/recommendation";
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
  { id: "long", label: "Song Fix", subLabel: "長尺劣化補正" },
  { id: "manual", label: "Manual", subLabel: "Easy mastering" },
  { id: "report", label: "Report", subLabel: "解析レポート" }
];

const quickPresets = [
  { id: "natural", label: "Natural Clean" },
  { id: "de-harsh-vocal", label: "Vocal De-Harsh" },
  { id: "ai-glass", label: "AI Glass Reducer" },
  { id: "decay-balanced", label: "Long Song Decay Fix" }
];

const quickPresetIds = new Set(quickPresets.map((preset) => preset.id));
const otherPresetOptions = presets.filter((preset) => !quickPresetIds.has(preset.id));
const negativeOnlyPresetIds = new Set([...quickPresetIds, "decay-gentle", "decay-strong"]);

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
  if (score <= 20) return "問題なし";
  if (score <= 40) return "軽度";
  if (score <= 60) return "中程度";
  if (score <= 80) return "強め";
  return "重度";
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
    harshness: "刺さり",
    sibilance: "歯擦音",
    metallic: "金属感",
    hiss: "高域チリつき",
    clipping: "クリッピング",
    dynamic_range_loss: "音像の潰れ",
    stereo_instability: "ステレオ不安定",
    unknown: "不明"
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
  if (id === "manual-custom") return "完全マニュアル";
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

function clearPositiveParams(params: ProcessingParams): ProcessingParams {
  return {
    ...params,
    highAirRecover: 0,
    bassEnhance: 0,
    vocalForward: 0,
    vocalBody: 0,
    lowWeight: 0,
    air: 0,
    presence: 0,
    mixWarmth: 0
  };
}

function applyNoiseReductionPreset(base: ProcessingParams, presetId: string): ProcessingParams {
  const next = applyPreset(base, presetId);
  return negativeOnlyPresetIds.has(presetId) ? clearPositiveParams(next) : next;
}

function analyzeAudioAsync(audio: AudioBufferData, chunkSeconds = 10, referenceOverride?: { startSec: number; endSec: number }): Promise<AudioAnalysis> {
  if (typeof Worker === "undefined") return Promise.resolve(analyzeAudio(audio, chunkSeconds, referenceOverride));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../lib/audio/workers/analysisWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<{ analysis: AudioAnalysis }>) => {
      worker.terminate();
      resolve(event.data.analysis);
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "Analysis worker failed."));
    };
    worker.postMessage({ audio, chunkSeconds, referenceOverride });
  });
}

function processAudioAsync(audio: AudioBufferData, params: ProcessingParams, analysis?: AudioAnalysis): Promise<ProcessingResult> {
  if (typeof Worker === "undefined") return Promise.resolve(processAudio(audio, params, analysis));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../lib/audio/workers/processWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<{ result: ProcessingResult }>) => {
      worker.terminate();
      resolve(event.data.result);
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "Process worker failed."));
    };
    worker.postMessage({ audio, params, analysis });
  });
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
      label: "高域エアを少し戻す",
      description: "WAVの高域欠落が目立つ場合だけ使います。ノイズ除去ではなく、明るさを足す処理です。",
      params: {},
      recommended: true
    });
  }
  if (analysis.scores.harshness < 70 && analysis.scores.sibilance < 70) {
    suggestions.push({
      id: "vocal-body",
      label: "ボーカルの芯を少し前へ",
      description: "声の存在感と中域の芯を軽く足します。刺さりが強い曲では控えめ推奨です。",
      params: { vocalForward: 16, vocalBody: 14, presence: 4 },
      recommended: artifactRisk < 42
    });
  }
  if (analysis.scores.mud < 72) {
    suggestions.push({
      id: "low-weight",
      label: "低音と背景を少し太く",
      description: "低域の厚みと背景の温かさを足します。こもりが強い曲では使いすぎ注意です。",
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

function qualityAssessment(before: AudioAnalysis | undefined, after: AudioAnalysis | undefined): { score: number; notes: string[]; warnings: string[] } | undefined {
  if (!before || !after) return undefined;
  const delta = scoreDelta(before, after);
  if (!delta) return undefined;
  const artifactGain =
    Math.max(0, delta.harshness) * 0.14 +
    Math.max(0, delta.sibilance) * 0.16 +
    Math.max(0, delta.metallic) * 0.16 +
    Math.max(0, delta.hiss) * 0.22 +
    Math.max(0, delta.maxDegradationScore) * 0.18 +
    Math.max(0, delta.lastThirdScore) * 0.14;
  const loudnessLoss = Math.max(0, before.rmsDb - after.rmsDb - 1.8);
  const peakTooLow = after.peakDb < -10 ? 5 : 0;
  const mudIncrease = Math.max(0, after.scores.mud - before.scores.mud) * 0.18;
  const highLossIncrease = Math.max(0, after.highFrequencyLossScore - before.highFrequencyLossScore) * 0.1;
  const score = Math.round(Math.max(0, Math.min(100, 55 + artifactGain - loudnessLoss * 6 - peakTooLow - mudIncrease - highLossIncrease)));
  const notes = [
    delta.hiss > 0 ? "高域ノイズは減っています。" : "高域ノイズの改善は小さめです。",
    delta.harshness + delta.sibilance > 0 ? "刺さり・歯擦音は抑えられています。" : "刺さり成分は残っています。",
    after.peakDb > -1 ? "ピーク余裕が少ないため保存前に注意してください。" : "ピークには余裕があります。"
  ];
  const warnings: string[] = [];
  if (loudnessLoss > 1.5) warnings.push("音量が下がりすぎて、大人しく聞こえる可能性があります。");
  if (mudIncrease > 5) warnings.push("中低域が増え、こもりや太りすぎに注意です。");
  if (after.highFrequencyLossScore > before.highFrequencyLossScore + 12) warnings.push("高域の抜けが減りすぎている可能性があります。");
  return { score, notes, warnings };
}

function buildReport(fileName: string | undefined, analysis: AudioAnalysis | undefined, processedAnalysis: AudioAnalysis | undefined, params: ProcessingParams, result: ProcessingResult | undefined, preset: string) {
  if (!analysis) return {};
  const delta = scoreDelta(analysis, processedAnalysis);
  const severityDelta = scoreSeverityDelta(analysis, processedAnalysis);
  const quality = qualityAssessment(analysis, processedAnalysis);
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
    qualityAssessment: quality,
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
          {hasAfter ? `${improved ? "改善 " : worsened ? "増加 " : "変化 "} ${Math.abs(delta).toFixed(1)}${suffix}` : "補正後に表示"}
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

function fmtNumber(value: number | undefined, digits = 1, suffix = ""): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${value.toFixed(digits)}${suffix}`;
}

function ReportTableRow({ label, before, after, suffix = "", digits = 1, lowerIsBetter = true }: { label: string; before?: number; after?: number; suffix?: string; digits?: number; lowerIsBetter?: boolean }) {
  const hasAfter = typeof after === "number" && Number.isFinite(after);
  const delta = hasAfter && typeof before === "number" ? after - before : undefined;
  const improved = typeof delta === "number" ? lowerIsBetter ? delta < 0 : delta > 0 : false;
  const worsened = typeof delta === "number" ? lowerIsBetter ? delta > 0 : delta < 0 : false;
  const deltaText = typeof delta === "number" ? `${delta >= 0 ? "+" : ""}${delta.toFixed(digits)}${suffix}` : "-";
  return (
    <tr className="border-t border-line/70">
      <td className="py-2 pr-3 font-medium text-slate-200">{label}</td>
      <td className="py-2 pr-3 text-right text-muted">{fmtNumber(before, digits, suffix)}</td>
      <td className="py-2 pr-3 text-right text-muted">{fmtNumber(after, digits, suffix)}</td>
      <td className={`py-2 pr-3 text-right ${improved ? "text-emerald-200" : worsened ? "text-amber-200" : "text-muted"}`}>{deltaText}</td>
      <td className={`py-2 text-right text-xs ${improved ? "text-emerald-200" : worsened ? "text-amber-200" : "text-muted"}`}>
        {hasAfter ? improved ? "改善" : worsened ? "要確認" : "変化なし" : "補正後なし"}
      </td>
    </tr>
  );
}

function ReportBeforeAfterTable({ before, after }: { before?: AudioAnalysis; after?: AudioAnalysis }) {
  if (!before) {
    return (
      <div className="rounded border border-line bg-panel p-4 text-sm text-muted">
        音声ファイルを読み込むと、ここに解析結果の表を表示します。
      </div>
    );
  }
  return (
    <div className="rounded border border-line bg-panel p-4">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-semibold">ビフォー / アフター比較表</h2>
          <p className="text-xs text-muted">スコアは100が目安です。基本的に低いほど耳障りな成分が少ない状態です。</p>
        </div>
        <div className="text-xs text-muted">{after ? "補正後解析あり" : "補正後は未作成"}</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="text-xs text-muted">
            <tr>
              <th className="py-2 pr-3 text-left">項目</th>
              <th className="py-2 pr-3 text-right">補正前</th>
              <th className="py-2 pr-3 text-right">補正後</th>
              <th className="py-2 pr-3 text-right">差分</th>
              <th className="py-2 text-right">判定</th>
            </tr>
          </thead>
          <tbody>
            <ReportTableRow label="後半劣化スコア" before={before.degradationSummary.lastThirdScore} after={after?.degradationSummary.lastThirdScore} />
            <ReportTableRow label="最大劣化スコア" before={before.degradationSummary.maxScore} after={after?.degradationSummary.maxScore} />
            <ReportTableRow label="刺さり" before={before.scores.harshness} after={after?.scores.harshness} />
            <ReportTableRow label="歯擦音" before={before.scores.sibilance} after={after?.scores.sibilance} />
            <ReportTableRow label="金属感" before={before.scores.metallic} after={after?.scores.metallic} />
            <ReportTableRow label="高域ノイズ" before={before.scores.hiss} after={after?.scores.hiss} />
            <ReportTableRow label="こもり" before={before.scores.mud} after={after?.scores.mud} />
            <ReportTableRow label="クリップ" before={before.scores.clipping} after={after?.scores.clipping} />
            <ReportTableRow label="True Peak推定" before={before.scores.truePeak} after={after?.scores.truePeak} />
            <ReportTableRow label="高域欠落" before={before.highFrequencyLossScore} after={after?.highFrequencyLossScore} />
            <ReportTableRow label="Peak" before={before.peakDb} after={after?.peakDb} suffix=" dBFS" lowerIsBetter={false} />
            <ReportTableRow label="RMS" before={before.rmsDb} after={after?.rmsDb} suffix=" dBFS" lowerIsBetter={false} />
            <ReportTableRow label="LUFS推定" before={before.estimatedLufs} after={after?.estimatedLufs} lowerIsBetter={false} />
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReportSummaryPanel({ fileName, analysis, processedAnalysis, preset, chainLength }: { fileName?: string; analysis?: AudioAnalysis; processedAnalysis?: AudioAnalysis; preset: string; chainLength: number }) {
  const summary = analysis?.degradationSummary;
  const cards = [
    { label: "ファイル", value: fileName ?? "-" },
    { label: "長さ", value: analysis ? formatTime(analysis.duration) : "-" },
    { label: "形式", value: analysis ? `${analysis.sampleRate}Hz / ${analysis.channels}ch` : "-" },
    { label: "前半基準", value: analysis ? `${formatTime(analysis.referenceProfile.startSec)} - ${formatTime(analysis.referenceProfile.endSec)}` : "-" },
    { label: "最大劣化区間", value: summary ? `${formatTime(summary.maxScoreStartSec)} - ${formatTime(summary.maxScoreEndSec)}` : "-" },
    { label: "主原因", value: summary ? causeLabel(summary.primaryCause) : "-" },
    { label: "選択プリセット", value: presetDisplayName(preset, preset) },
    { label: "処理チェーン", value: `${chainLength} steps` },
    { label: "補正後解析", value: processedAnalysis ? "あり" : "なし" }
  ];
  return (
    <div className="rounded border border-line bg-panel p-4">
      <h2 className="mb-3 font-semibold">レポート概要</h2>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded bg-panel2 px-3 py-2 text-sm">
            <div className="text-xs text-muted">{card.label}</div>
            <div className="mt-1 break-words text-slate-100">{card.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScoreComparisonPanel({ before, after }: { before?: AudioAnalysis; after?: AudioAnalysis }) {
  if (!before) return null;
  const quality = qualityAssessment(before, after);
  return (
    <div className="rounded border border-line bg-panel p-4">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-semibold">補正後スコア / Before・After</h2>
          <p className="text-xs text-muted">補正前後を同じ解析ロジックで再評価します。数値は推定です。</p>
        </div>
        {quality ? <div className="rounded bg-emerald-300/15 px-3 py-2 text-sm font-semibold text-emerald-100">改善度 {quality.score} / 100</div> : after && <div className="text-xs text-emerald-200">補正後解析済み</div>}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <ComparisonRow label="後半劣化" before={before.degradationSummary.lastThirdScore} after={after?.degradationSummary.lastThirdScore} />
        <ComparisonRow label="最大劣化" before={before.degradationSummary.maxScore} after={after?.degradationSummary.maxScore} />
        <ComparisonRow label="刺さり" before={before.scores.harshness} after={after?.scores.harshness} />
        <ComparisonRow label="歯擦音" before={before.scores.sibilance} after={after?.scores.sibilance} />
        <ComparisonRow label="金属感" before={before.scores.metallic} after={after?.scores.metallic} />
        <ComparisonRow label="高域ノイズ" before={before.scores.hiss} after={after?.scores.hiss} />
        <ComparisonRow label="こもり" before={before.scores.mud} after={after?.scores.mud} />
        <ComparisonRow label="高域欠落" before={before.highFrequencyLossScore} after={after?.highFrequencyLossScore} />
      </div>
      {after && (
        <div className="mt-3 grid gap-2 text-xs text-muted sm:grid-cols-3">
          <div className="rounded bg-panel2 px-3 py-2">補正後Peak: <span className="text-slate-100">{after.peakDb.toFixed(1)} dBFS</span></div>
          <div className="rounded bg-panel2 px-3 py-2">補正後LUFS推定: <span className="text-slate-100">{after.estimatedLufs.toFixed(1)}</span></div>
          <div className="rounded bg-panel2 px-3 py-2">補正後最大区間: <span className="text-slate-100">{formatTime(after.degradationSummary.maxScoreStartSec)} - {formatTime(after.degradationSummary.maxScoreEndSec)}</span></div>
        </div>
      )}
      {quality && (
        <div className="mt-3 rounded border border-line bg-panel2 p-3 text-xs leading-relaxed text-muted">
          <div className="font-semibold text-slate-100">自動品質判定</div>
          <div className="mt-1 grid gap-1 sm:grid-cols-3">
            {quality.notes.map((note) => <span key={note}>{note}</span>)}
          </div>
          {quality.warnings.length > 0 && <div className="mt-2 text-amber-200">{quality.warnings.join(" / ")}</div>}
        </div>
      )}
    </div>
  );
}

function SaturationRescuePanel({ before, after }: { before?: AudioAnalysis; after?: AudioAnalysis }) {
  if (!before) return null;
  const labels: Record<keyof AudioAnalysis["scoreSeverity"], string> = {
    harshness: "刺さり",
    sibilance: "歯擦音",
    metallic: "金属感",
    hiss: "高域ノイズ",
    mud: "こもり",
    clipping: "クリップ",
    truePeak: "True Peak",
    degradation: "長尺劣化",
    highFrequencyLoss: "高域欠落"
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
    ? "救済案: 最大劣化区間だけを中心に、Hiss / Metallic / Sibilanceを少しずつ追加してください。全体を強く削るより安全です。"
    : worst.key === "degradation"
      ? "救済案: 劣化タイムラインのMAX区間をループし、Difference Monitorで主成分が出ない範囲まで補正を上げてください。"
      : "救済案: Strongへ一気に上げず、Safe Mode ONのまま原因別スライダーを小さく足してください。";
  return (
    <div className="rounded border border-rose-300/35 bg-rose-400/10 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-semibold text-rose-50">100点張り付き救済</h2>
          <p className="mt-1 text-sm leading-relaxed text-rose-100/85">
            表示スコアが100のままでも、内部重症度で改善量を確認できます。100超えが大きい音源は、一度の補正で正常域まで戻らない場合があります。
          </p>
        </div>
        {bothPinned && <span className="rounded bg-rose-200 px-2 py-1 text-xs font-bold text-slate-950">Before/Afterとも100</span>}
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
        {rows.map((row) => (
          <div key={row.key} className="rounded border border-rose-200/20 bg-slate-950/45 p-3 text-xs">
            <div className="font-semibold text-slate-100">{row.label}</div>
            <div className="mt-2 text-muted">表示: {row.beforeScore.toFixed(0)}{typeof row.afterScore === "number" ? ` → ${row.afterScore.toFixed(0)}` : ""}</div>
            <div className="mt-1 text-rose-100">内部: {row.beforeRaw.toFixed(0)}{typeof row.afterRaw === "number" ? ` → ${row.afterRaw.toFixed(0)}` : ""}</div>
            {typeof row.improved === "number" && (
              <div className={row.improved > 0 ? "mt-1 text-emerald-200" : "mt-1 text-amber-200"}>
                {row.improved > 0 ? "改善" : "悪化"} {Math.abs(row.improved).toFixed(0)}
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-rose-100/90">{rescueHint}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Difference Monitorでメインボーカルや楽器本体が大きく聞こえる場合は、補正が強すぎます。その場合は補正量を下げ、対象区間だけに寄せてください。
      </p>
    </div>
  );
}

function InternalSeverityPanel({ before, after }: { before?: AudioAnalysis; after?: AudioAnalysis }) {
  if (!before) return null;
  const labels: Record<keyof AudioAnalysis["scoreSeverity"], string> = {
    harshness: "刺さり",
    sibilance: "歯擦音",
    metallic: "金属感",
    hiss: "高域ノイズ",
    mud: "こもり",
    clipping: "クリップ",
    truePeak: "True Peak",
    degradation: "長尺劣化",
    highFrequencyLoss: "高域欠落"
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
    ? "長尺劣化が高い場合は、劣化タイムラインのMAX区間を聴きながら、その区間だけ補正が効いているか確認してください。"
    : worst.key === "hiss" || worst.key === "metallic" || worst.key === "sibilance"
      ? "高域系が100を超える場合は、Hiss / Metallic / Sibilanceを少しずつ足し、Difference Monitorで主成分を削っていないか確認してください。"
      : "100超えが残る場合でも、音が自然なら無理に0へ近づける必要はありません。目標は数値より聴感の改善です。";
  return (
    <div className="rounded border border-rose-300/35 bg-rose-400/10 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-semibold text-rose-50">内部重症度 / 100が基準</h2>
          <p className="mt-1 text-sm leading-relaxed text-rose-100/85">
            100以下が目標です。表示スコアは100で止まりますが、この表では100を超えた内部値をそのまま出します。
          </p>
          <p className="mt-1 text-xs text-muted">
            補正ボタン後に数値が変わらない場合は、設定変更後の再補正が未実行、補正対象外の帯域、または補正量が弱すぎる可能性があります。
          </p>
        </div>
        {pinned && <span className="rounded bg-rose-200 px-2 py-1 text-xs font-bold text-slate-950">100超えあり</span>}
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-xs">
          <thead className="text-left text-muted">
            <tr className="border-b border-line">
              <th className="py-2 pr-3">項目</th>
              <th className="py-2 pr-3">補正前</th>
              <th className="py-2 pr-3">補正後</th>
              <th className="py-2 pr-3">改善量</th>
              <th className="py-2 pr-3">判定</th>
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
                  <td className="py-2 pr-3 text-muted">{current > 100 ? "100超え" : "100以下"}</td>
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
    harshness: "刺さり",
    sibilance: "歯擦音",
    metallic: "金属感",
    hiss: "高域ノイズ",
    mud: "こもり",
    clipping: "クリップ",
    truePeak: "True Peak",
    degradation: "長尺劣化",
    highFrequencyLoss: "高域欠落"
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
          <h2 className="font-semibold text-rose-50">内部重症度 / 100が基準</h2>
          <p className="mt-1 text-sm leading-relaxed text-rose-100/85">
            100以下が目標です。100を超えるほど、その成分が強く残っています。補正後に増えた項目は赤で「悪化」と表示します。
          </p>
          <p className="mt-1 text-xs text-muted">
            ある項目を下げる処理で別の項目が少し増えることがあります。音が自然なら許容、耳に痛い場合は該当スライダーを下げて再補正してください。
          </p>
        </div>
        {hasWorse && <span className="rounded bg-amber-200 px-2 py-1 text-xs font-bold text-slate-950">悪化項目あり</span>}
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-xs">
          <thead className="text-left text-muted">
            <tr className="border-b border-line">
              <th className="py-2 pr-3">項目</th>
              <th className="py-2 pr-3">補正前</th>
              <th className="py-2 pr-3">補正後</th>
              <th className="py-2 pr-3">差分</th>
              <th className="py-2 pr-3">判定</th>
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
                    {worsened ? "悪化" : improved ? "改善" : current > 100 ? "100超え" : "100以下"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        Difference Monitorでボーカルや楽器本体が大きく聞こえる場合は削りすぎです。逆に数値が残っていても聴感が自然なら、無理に100以下へ押し込まない方が良いです。
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
  if (score <= 20) return { bg: "bg-emerald-400/70", border: "border-emerald-300/70", text: "text-emerald-100", label: "問題なし" };
  if (score <= 40) return { bg: "bg-sky-400/75", border: "border-sky-300/70", text: "text-sky-100", label: "軽度" };
  if (score <= 60) return { bg: "bg-amber-300/80", border: "border-amber-200/70", text: "text-amber-100", label: "中程度" };
  if (score <= 80) return { bg: "bg-orange-400/85", border: "border-orange-300/80", text: "text-orange-100", label: "強め" };
  return { bg: "bg-rose-500/90", border: "border-rose-300/80", text: "text-rose-100", label: "重度" };
}

function DegradationTimeline({ metrics, onSelect, title = "劣化タイムライン" }: { metrics: TimelineMetric[]; onSelect: (start: number, end: number) => void; title?: string }) {
  if (!metrics.length) return <div className="rounded border border-line bg-panel p-4 text-sm text-muted">音声ファイルを読み込むと劣化タイムラインを表示します。</div>;
  const maxMetric = metrics.reduce((best, metric) => (metric.degradationRawScore ?? metric.degradationScore) > (best.degradationRawScore ?? best.degradationScore) ? metric : best, metrics[0]);
  const maxEnd = metrics[metrics.length - 1].endSec;
  return (
    <div className="rounded border border-line bg-panel p-4">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-xs text-muted">横軸は時間、色と高さは劣化スコアです。区間を押すと同じ場所をループ再生します。</p>
        </div>
        <div className="text-xs text-rose-100">
          内部最大: 表示 {maxMetric.degradationScore.toFixed(0)} / 内部 {(maxMetric.degradationRawScore ?? maxMetric.degradationScore).toFixed(0)}
          最大: {formatTime(maxMetric.startSec)} - {formatTime(maxMetric.endSec)} / {maxMetric.degradationScore.toFixed(0)}
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
                title={`${formatTime(metric.startSec)}-${formatTime(metric.endSec)} / 表示 ${score.toFixed(0)} / 内部 ${rawScore.toFixed(0)} / ${tone.label}`}
                onClick={() => onSelect(metric.startSec, metric.endSec)}
              >
                {isMax && <span className="absolute left-1 top-1 rounded bg-rose-300 px-1 text-[9px] font-bold text-slate-950">MAX</span>}
                <span className={`block w-full rounded ${tone.bg}`} style={{ height: `${Math.max(10, Math.min(100, rawScore))}%` }} />
                <span className="mt-1 block truncate text-center text-[10px] font-semibold text-slate-100">{score.toFixed(0)}</span>
                <span className={`block truncate text-center text-[9px] ${rawScore > 100 ? "text-rose-100" : "text-muted"}`}>内{rawScore.toFixed(0)}</span>
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
        <span className="rounded bg-emerald-400/15 px-1 py-1 text-emerald-100">0-20 問題なし</span>
        <span className="rounded bg-sky-400/15 px-1 py-1 text-sky-100">21-40 軽度</span>
        <span className="rounded bg-amber-300/15 px-1 py-1 text-amber-100">41-60 中程度</span>
        <span className="rounded bg-orange-400/15 px-1 py-1 text-orange-100">61-80 強め</span>
        <span className="rounded bg-rose-500/15 px-1 py-1 text-rose-100">81-100 重度</span>
      </div>
    </div>
  );
}

export default function Home() {
  const [mode, setMode] = useState<AppMode>("long");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("WAVまたはMP3を読み込んでください");
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
    if (!audio || !fileMeta) return "未読み込み";
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
    setStatus("補正処理中...");
    window.setTimeout(async () => {
      try {
        await waitForPaint();
        const next = await processAudioAsync(audio, nextParams, analysis);
        setStatus("補正後スコアを解析中...");
        const nextProcessedAnalysis = await analyzeAudioAsync(next.audio, 10, analysis ? { startSec: analysis.referenceProfile.startSec, endSec: analysis.referenceProfile.endSec } : undefined);
        setProcessed(next.audio);
        setProcessedAnalysis(nextProcessedAnalysis);
        setResult(next);
        setSettingsDirty(false);
        const delta = scoreDelta(analysis, nextProcessedAnalysis);
        const improvement = delta ? ` / 後半劣化 ${delta.lastThirdScore >= 0 ? "-" : "+"}${Math.abs(delta.lastThirdScore).toFixed(0)}` : "";
        setStatus(`補正完了。出力Peak ${next.peakDb.toFixed(1)} dBFS${improvement}`);
      } catch (error) {
        console.error(error);
        setStatus("補正処理に失敗しました。");
      } finally {
        setBusy(false);
      }
    }, 20);
  }, [audio, busy, analysis]);

  const runProcess = useCallback(() => processWithParams(params), [processWithParams, params]);

  const loadFile = useCallback(async (file: File) => {
    const format = inputFormat(file);
    if (!format) {
      alert("読み込みはWAVまたはMP3に対応しています。保存はWAV形式です。");
      return;
    }
    if (file.size > 300 * 1024 * 1024 && !confirm("巨大ファイルです。処理に時間がかかり、ブラウザメモリを多く使います。続行しますか？")) return;
    setBusy(true);
    setStatus("デコード中...");
    setProcessed(undefined);
    setProcessedAnalysis(undefined);
    setResult(undefined);
    setWavSaveCount(0);
    setSettingsDirty(false);
    try {
      const decoded = await decodeAudioFile(file);
      setAudio(decoded.data);
      setFileMeta({ name: file.name, size: file.size, bitDepth: decoded.bitDepth, format });
      setStatus("解析中...");
      const nextAnalysis = await analyzeAudioAsync(decoded.data, 10);
      const auto = buildRecommendedParams(nextAnalysis, format, defaultParams);
      const recommendation = auto.recommendation;
      const autoPresetId = recommendation.presetId;
      const autoParams = {
        ...auto.params,
        masteringEnabled: false,
        autoLoudness: false,
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
      const airMessage = format === "WAV" && autoParams.highAirRecover > 0 ? ` WAV向けの高域エア補完を${Math.round(autoParams.highAirRecover)}%入れました。` : "";
      setStatus(`解析完了。おすすめ補正タイプ「${presetDisplayName(autoPresetId, recommendedPresetLabel(nextAnalysis.degradationSummary.recommendedPreset))}」と提案数値を自動設定しました。${airMessage}${recommendation.reason} ${auto.notes.join(" ")} 次に「補正する」を押してください。`);
    } catch (error) {
      console.error(error);
      setStatus("読み込みまたは解析に失敗しました。");
    } finally {
      setBusy(false);
    }
  }, []);

  const selectPreset = (id: string) => {
    setPreset(id);
    if (id === "decay-gentle") setLongSongStrength("gentle");
    if (id === "decay-balanced") setLongSongStrength("balanced");
    if (id === "decay-strong") setLongSongStrength("strong");
    setParams((current) => applyNoiseReductionPreset(current, id));
    setSettingsDirty(true);
    setStatus("補正タイプを選択しました。次に「補正する」を押してください。");
  };

  const selectMasteringPreset = (id: string) => {
    setMasteringPreset(id);
    setParams((current) => applyMasteringPreset(current, id));
    setSettingsDirty(true);
    setStatus("マスタリング設定を選択しました。必要なら「マスタリング込みで適用」を押してください。");
  };

  const chooseRecommendedPreset = () => {
    const auto = analysis ? buildRecommendedParams(analysis, fileMeta?.format ?? "WAV", params) : undefined;
    const id = auto ? auto.recommendation.presetId : recommendedPresetId(longSongStrength);
    const nextParams = {
      ...(auto ? auto.params : applyNoiseReductionPreset(params, id)),
      masteringEnabled: params.masteringEnabled,
      autoLoudness: params.autoLoudness
    };
    setPreset(id);
    setParams(nextParams);
    setSettingsDirty(true);
    setStatus(`おすすめ設定と提案数値に戻しました。${auto ? auto.notes.join(" ") : ""} 次に「補正する」を押してください。`);
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
    setStatus("完全マニュアルモードにしました。プリセットは使わず、Manual / Easy mastering のスライダーで必要な補正だけ追加してください。");
  };

  const recalcReference = () => {
    if (!audio) return;
    const startSec = params.referenceStartSec ?? analysis?.referenceProfile.startSec ?? 20;
    const endSec = params.referenceEndSec ?? analysis?.referenceProfile.endSec ?? 60;
    setBusy(true);
    setStatus("Reference Sectionで再解析中...");
    window.setTimeout(async () => {
      try {
        const nextAnalysis = await analyzeAudioAsync(audio, 10, { startSec, endSec });
        setAnalysis(nextAnalysis);
        setProcessed(undefined);
        setProcessedAnalysis(undefined);
        setResult(undefined);
        setSettingsDirty(true);
        setStatus("再解析完了。適用で再処理してください。");
      } finally {
        setBusy(false);
      }
    }, 20);
  };

  const summary = analysis?.degradationSummary;
  const lastScore = summary?.lastThirdScore ?? 0;
  const maxScore = summary?.maxScore ?? 0;
  const recommended = summary ? recommendedPresetLabel(summary.recommendedPreset) : "解析後に表示";
  const activeRecommendation = analysis ? recommendForAnalysis(analysis, fileMeta?.format ?? "WAV") : undefined;
  const recommendedAutoId = activeRecommendation?.presetId ?? "";
  const recommendedAutoLabel = analysis ? presetDisplayName(recommendedAutoId, recommended) : recommended;
  const repairOptions = useMemo(() => analysis ? buildRepairOptions(analysis, fileMeta?.format ?? "WAV", defaultParams) : [], [analysis, fileMeta?.format]);
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
    setStatus("プラス補正をクリアしました。ノイズを減らすマイナス補正設定は残しています。次に「補正する」を押すと反映されます。");
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
    setStatus(`プラス補正「${suggestion.label}」を追加しました。次に「補正する」を押すと反映されます。`);
  };

  const applyRepairOption = (option: RepairOption) => {
    setPreset(option.recommendation.presetId);
    setParams({
      ...option.params,
      masteringEnabled: params.masteringEnabled,
      autoLoudness: params.autoLoudness
    });
    if (option.recommendation.presetId === "decay-gentle") setLongSongStrength("gentle");
    if (option.recommendation.presetId === "decay-balanced") setLongSongStrength("balanced");
    if (option.recommendation.presetId === "decay-strong") setLongSongStrength("strong");
    setSettingsDirty(true);
    setStatus(`${option.label} の提案数値を選択しました。${option.notes.join(" ")} 次に「補正する」を押してください。`);
  };

  return (
    <main className="min-h-screen pb-72 sm:pb-48">
      <header className="sticky top-0 z-10 border-b border-line bg-slate-950/90 px-4 py-3 backdrop-blur">
        <a href="/lando_hp/artifactcleaner_eg/" className="absolute right-24 top-3 inline-flex items-center rounded border border-sky-300/40 bg-sky-400/10 px-3 py-2 text-xs font-semibold text-sky-100">
          English
        </a>
        <a href="https://ko-fi.com/au987716" target="_blank" rel="noreferrer" className="absolute right-4 top-3 inline-flex items-center gap-2 rounded border border-rose-300/40 bg-rose-400/15 px-3 py-2 text-xs font-semibold text-rose-100">
          <Coffee className="h-4 w-4" /> Ko-fi
        </a>
        <div className="mx-auto max-w-[1600px] pr-44">
          <div className="flex items-center gap-2 text-lg font-semibold"><Activity className="h-5 w-5 text-sky-300" /> Suno Artifact Cleaner</div>
          <div className="mt-1 break-all text-xs text-muted">{fileInfo}</div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="hidden items-center gap-2 rounded border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-xs text-emerald-100 md:flex">
              <ShieldCheck className="h-4 w-4" /> ブラウザ内処理 / 外部送信なし / 解析値は推定
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
            <div className="rounded border border-line bg-panel p-4">
              <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-xs text-sky-100">1. 診断</div>
                  <h2 className="text-lg font-semibold">この曲で目立つ劣化を先に判定します</h2>
                  <p className="mt-1 text-sm text-muted">アップロード後に自動解析し、後半劣化・最大劣化区間・主原因をここに表示します。</p>
                </div>
                {analysis && <div className="text-xs text-muted">基準区間 {formatTime(analysis.referenceProfile.startSec)} - {formatTime(analysis.referenceProfile.endSec)}</div>}
              </div>
              <div className="grid gap-3 md:grid-cols-6">
                <StatCard label="後半劣化スコア" value={`${lastScore.toFixed(0)} / 100`} tone={severityClass(lastScore)} />
                <StatCard label="判定" value={analysis ? severity(Math.max(lastScore, maxScore)) : "-"} tone={analysis ? severityClass(Math.max(lastScore, maxScore)) : ""} />
                <StatCard label="主原因" value={summary ? causeLabel(summary.primaryCause) : "-"} />
                <StatCard label="最大劣化区間" value={summary ? `${formatTime(summary.maxScoreStartSec)} - ${formatTime(summary.maxScoreEndSec)}` : "-"} />
                <StatCard label="推奨" value={recommendedAutoLabel.replace("Long Song Decay Fix - ", "")} />
                <StatCard label="高域欠落" value={analysis ? `${analysis.highFrequencyLossScore.toFixed(0)} / 100` : "-"} tone={analysis ? severityClass(analysis.highFrequencyLossScore) : ""} />
              </div>
            </div>
            <div className="rounded border border-sky-300/25 bg-sky-300/10 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-xs text-sky-100">2. マイナス補正</div>
                  <h2 className="mt-1 text-lg font-semibold">補正タイプと提案数値を自動選択します</h2>
                  <p className="mt-1 text-sm text-muted">解析結果から各スライダー値まで自動で入れます。基本はノイズを削り、細くなりそうな曲だけ控えめに太さを戻します。</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 md:min-w-[360px]">
                  <button disabled={!analysis || busy} onClick={chooseRecommendedPreset} className="rounded border border-fuchsia-300/50 bg-fuchsia-300/15 px-4 py-3 text-sm font-semibold text-fuchsia-50 disabled:opacity-40">
                    <span className="block">おすすめに戻す</span>
                    <span className="block text-[11px] font-medium">解析結果の推奨へ戻す</span>
                  </button>
                  <button disabled={!audio || busy} onClick={chooseManualMode} className="rounded border border-slate-500/70 bg-slate-800/70 px-4 py-3 text-sm font-semibold text-slate-100 disabled:opacity-40">
                    <span className="block">完全マニュアル</span>
                    <span className="block text-[11px] font-medium">プリセットを使用せず調整</span>
                  </button>
                </div>
              </div>
              <div className="mt-3 rounded border border-line bg-panel2 px-3 py-2 text-xs text-muted">
                WAV / MP3読み込み後におすすめ補正タイプと推奨スライダー値を自動選択します。MP3も解析と補正はできますが、保存は音質確認しやすいWAV形式です。プリセットを使わず自分で作る場合は「完全マニュアル」を選んでください。
              </div>
              {repairOptions.length > 0 && (
                <div className="mt-4 rounded border border-fuchsia-300/20 bg-slate-950/30 p-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-fuchsia-50">自動リペア3案</h3>
                      <p className="mt-1 text-xs leading-relaxed text-muted">同じ解析結果から、原音優先・推奨・強めの3案を数値で生成します。通常はBalancedが自動選択されます。</p>
                    </div>
                    <span className="text-[11px] text-muted">Ozone/RX風の比較用</span>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-3">
                    {repairOptions.map((option) => (
                      <button
                        key={option.id}
                        onClick={() => applyRepairOption(option)}
                        className={`rounded border p-3 text-left text-xs transition ${option.id === "balanced" ? "border-fuchsia-300 bg-fuchsia-400/15" : "border-line bg-panel2 hover:border-slate-500"}`}
                      >
                        <span className="block text-sm font-semibold text-slate-100">{option.label}</span>
                        <span className="mt-1 block leading-relaxed text-muted">{option.description}</span>
                        <span className="mt-2 block text-slate-300">
                          Hiss {option.params.hissReduction} / 刺さり {option.params.harshnessReduction} / 幅ノイズ {option.params.stereoWidthReduction}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
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
                      {item.id === "natural" ? "原音を保ちながら軽く整える" :
                        item.id === "de-harsh-vocal" ? "サ行と刺さりを抑える" :
                          item.id === "ai-glass" ? "金属感・ガラス感を抑える" :
                            "長い曲の中盤後半の荒れを狙って補正"}
                    </span>
                  </button>
                ))}
              </div>
              <div className="mt-3 rounded border border-line bg-panel p-3">
                <label className="grid gap-2 text-sm">
                  <span className="font-semibold">その他のプリセット</span>
                  <select
                    className="rounded border border-line bg-panel2 px-3 py-2 text-sm"
                    value={otherPresetOptions.some((item) => item.id === preset) ? preset : ""}
                    onChange={(event) => {
                      if (event.currentTarget.value) selectPreset(event.currentTarget.value);
                    }}
                  >
                    <option value="">その他のプリセットを選択</option>
                    {otherPresetOptions.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                  <span className="text-xs leading-relaxed text-muted">Vocal Front Clean、Late Wide Noise Focus、Strong Repairなどはここから選べます。</span>
                </label>
              </div>
              {positiveSuggestions.length > 0 && (
                <div className="mt-3 rounded border border-emerald-300/25 bg-emerald-300/10 p-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-emerald-50">任意のプラス補正 / 音を足す処理</h3>
                      <p className="mt-1 text-xs leading-relaxed text-emerald-100/80">
                        自動選択はノイズを減らすマイナス補正だけです。明るさ、太さ、ボーカル前出しは必要な場合だけここから追加してください。
                      </p>
                    </div>
                    <span className="text-[11px] text-muted">追加後は「補正する」で反映</span>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      disabled={!hasPositiveEnhancements}
                      onClick={clearPositiveEnhancements}
                      className="rounded border border-emerald-300/30 px-3 py-2 text-xs font-semibold text-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      プラス補正をクリア
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
                          {item.recommended && <span className="rounded bg-emerald-200 px-1.5 py-0.5 text-[10px] text-slate-950">案内</span>}
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
                  現在の選択: <span className="font-semibold text-slate-100">{presetDisplayName(preset, recommended)}</span>
                  {analysis && preset !== "manual-custom" && <span className="ml-2 text-sky-200">解析後に自動選択済み</span>}
                  {preset === "manual-custom" && <span className="ml-2 text-slate-200">プリセット未使用</span>}
                  {params.masteringEnabled && <span className="ml-2 text-fuchsia-200">Mastering ON</span>}
                  {activeRecommendation && <span className="mt-1 block text-slate-300">自動判定: {activeRecommendation.reason}</span>}
                </div>
                <button disabled={!audio || busy} onClick={runProcess} className="rounded bg-fuchsia-300 px-5 py-3 text-sm font-semibold text-slate-950 disabled:opacity-40">
                  補正する
                </button>
              </div>
            </div>
            <div className="space-y-3">
              <div className="rounded border border-line bg-panel p-4">
                <div className="text-xs text-sky-100">3. 確認</div>
                <h2 className="text-lg font-semibold">補正後の変化をスコアと耳で確認します</h2>
                <p className="mt-1 text-sm text-muted">補正後にスコア表、劣化タイムライン、下部プレイヤーのOriginal / Processed / 削った音で確認してください。</p>
              </div>
              <ScoreComparisonPanel before={analysis} after={processedAnalysis} />
            </div>
            <InternalSeverityTable before={analysis} after={processedAnalysis} />
            {mp3HighLossNotice && (
              <div className="rounded border border-sky-300/30 bg-sky-300/10 p-3 text-sm leading-relaxed text-sky-50">
                MP3由来の高域欠落を強く検出しています。これはMP3圧縮やエンコード時の高域ロールオフによる可能性があり、AI劣化や補正ミスとは限りません。保存は確認しやすいWAV形式で行います。
              </div>
            )}
            {wavAirRecoverNotice && (
              <div className="rounded border border-emerald-300/30 bg-emerald-300/10 p-3 text-sm leading-relaxed text-emerald-50">
                WAV音源の高域欠落を検出したため、高域エア補完を自動で {Math.round(params.highAirRecover)}% 入れています。ヒスや金属感を強く持ち上げないよう、安全モード内で薄く空気感だけを戻します。
              </div>
            )}
            <div className="rounded border border-line bg-panel p-4">
              <h2 className="font-semibold">診断コメント</h2>
              <p className="mt-2 text-sm text-muted">
                {summary ? `曲中の最大劣化区間は ${formatTime(summary.maxScoreStartSec)} - ${formatTime(summary.maxScoreEndSec)} です。${causeLabel(summary.primaryCause)} の増加を中心に検出しています。推奨は ${recommendedAutoLabel} です。` : "音声ファイルを読み込むと診断コメントを表示します。"}
              </p>
              {activeRecommendation && <p className="mt-2 text-xs text-slate-300">選定理由: {activeRecommendation.reason} 信頼度 {Math.round(activeRecommendation.confidence * 100)}%</p>}
              {mp3HighLossNotice && <p className="mt-2 text-xs text-sky-200">補足: 高域欠落スコアはMP3圧縮由来の可能性があります。強いAir補完や高域ブーストは控えめに確認してください。</p>}
              {wavAirRecoverNotice && <p className="mt-2 text-xs text-emerald-200">補足: WAVの高域補完は自動検出です。Difference Monitorでメイン楽器が大きく出る場合は、高域エア補完を少し下げてください。</p>}
              {summary && (
                <button onClick={() => setLoop({ start: summary.maxScoreStartSec, end: summary.maxScoreEndSec })} className="mt-3 rounded border border-sky-300/40 px-3 py-2 text-sm text-sky-100">
                  この区間を聴く
                </button>
              )}
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <StatCard label="前半スコア" value={`${(summary?.firstThirdScore ?? 0).toFixed(0)}`} />
              <StatCard label="中盤スコア" value={`${(summary?.middleThirdScore ?? 0).toFixed(0)}`} />
              <StatCard label="後半スコア" value={`${(summary?.lastThirdScore ?? 0).toFixed(0)}`} tone={severityClass(lastScore)} />
            </div>
            {summary && summary.lastThirdScore > summary.firstThirdScore && <div className="rounded border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">後半は前半より +{(summary.lastThirdScore - summary.firstThirdScore).toFixed(0)} 悪化しています。</div>}
            <DegradationTimeline metrics={analysis?.timelineMetrics ?? []} onSelect={(start, end) => setLoop({ start, end })} title="補正前 劣化タイムライン" />
            {processedAnalysis && (
              <DegradationTimeline metrics={processedAnalysis.timelineMetrics} onSelect={(start, end) => setLoop({ start, end })} title="補正後 劣化タイムライン" />
            )}
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded border border-line bg-panel p-4">
                <h2 className="mb-3 font-semibold">前半基準 / Reference Section</h2>
                <div className="text-sm text-muted">自動選定: {analysis ? `${formatTime(analysis.referenceProfile.startSec)} - ${formatTime(analysis.referenceProfile.endSec)}` : "-"}</div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <label className="grid gap-1">開始秒<input className="rounded border border-line bg-panel2 px-2 py-2" type="number" value={params.referenceStartSec ?? analysis?.referenceProfile.startSec ?? 20} onChange={(e) => updateParams({ ...params, referenceStartSec: Number(e.currentTarget.value) })} /></label>
                  <label className="grid gap-1">終了秒<input className="rounded border border-line bg-panel2 px-2 py-2" type="number" value={params.referenceEndSec ?? analysis?.referenceProfile.endSec ?? 60} onChange={(e) => updateParams({ ...params, referenceEndSec: Number(e.currentTarget.value) })} /></label>
                </div>
                <button disabled={!audio || busy} onClick={recalcReference} className="mt-3 rounded bg-sky-300 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40">
                  基準区間で再解析
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
                Song Fixで選んだ補正タイプと数値を引き継いでいます。ここでスライダーやMasteringを調整した後は、Mastering下部または画面下部の「現在の設定を適用」で再処理してください。
              </div>
              {settingsDirty && processed && <div className="rounded border border-fuchsia-300/30 bg-fuchsia-300/10 p-3 text-xs text-fuchsia-100">設定が変更されています。「現在の設定を適用」で再処理してください。</div>}
              <ProcessingPanel params={params} setParams={updateParams} />
              <div className="grid gap-4 lg:grid-cols-2">
                <WaveformView original={audio} processed={processed} loop={loop} />
                <SpectrumView original={audio} processed={processed} />
              </div>
            </div>
          </section>
        )}

        {mode === "report" && (
          <section className="space-y-4">
            <ReportSummaryPanel fileName={fileMeta?.name} analysis={analysis} processedAnalysis={processedAnalysis} preset={preset} chainLength={result?.chain.length ?? 0} />
            <ReportBeforeAfterTable before={analysis} after={processedAnalysis} />
            <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
              <div className="rounded border border-line bg-panel p-4 text-sm">
                <h2 className="mb-3 font-semibold">時間解析 / Timeline Summary</h2>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded bg-panel2 px-3 py-2">
                    <div className="text-xs text-muted">前半 / 中盤 / 後半</div>
                    <div className="mt-1 text-slate-100">
                      {summary ? `${summary.firstThirdScore.toFixed(0)} / ${summary.middleThirdScore.toFixed(0)} / ${summary.lastThirdScore.toFixed(0)}` : "-"}
                    </div>
                  </div>
                  <div className="rounded bg-panel2 px-3 py-2">
                    <div className="text-xs text-muted">Timeline chunks</div>
                    <div className="mt-1 text-slate-100">{analysis?.timelineMetrics.length ?? 0}</div>
                  </div>
                  <div className="rounded bg-panel2 px-3 py-2">
                    <div className="text-xs text-muted">補正後chunks</div>
                    <div className="mt-1 text-slate-100">{processedAnalysis?.timelineMetrics.length ?? 0}</div>
                  </div>
                  <div className="rounded bg-panel2 px-3 py-2">
                    <div className="text-xs text-muted">推奨Long Song preset</div>
                    <div className="mt-1 text-slate-100">{summary ? recommendedPresetLabel(summary.recommendedPreset) : "-"}</div>
                  </div>
                </div>
              </div>
              <div className="rounded border border-line bg-panel p-4">
                <h2 className="mb-3 font-semibold">処理チェーン / Processing Chain</h2>
                <div className="space-y-2 text-sm text-muted">
                  {(result?.chain ?? ["適用後に処理チェーンを表示します"]).map((item) => <div key={item} className="rounded bg-panel2 px-3 py-2">{item}</div>)}
                </div>
              </div>
            </div>
            <details className="rounded border border-line bg-panel p-4" open>
              <summary className="cursor-pointer font-semibold">analysis-report.json preview</summary>
              <pre className="mt-3 max-h-[55vh] overflow-auto rounded bg-slate-950 p-3 text-xs text-slate-200">{JSON.stringify(report, null, 2)}</pre>
            </details>
          </section>
        )}
      </div>

      <div className="mx-auto max-w-[1600px] px-5 pb-6 text-sm text-muted">{status}</div>
      <AudioPlayer original={audio} processed={processed} loop={loop} setLoop={setLoop} loudnessMatch={params.playbackLoudnessMatch} outputFileName={outputFileName} onWavSaved={() => setWavSaveCount((count) => count + 1)} onProcess={runProcess} busy={busy} canProcess={!!audio} hasPositiveEnhancements={hasPositiveEnhancements} />
    </main>
  );
}
