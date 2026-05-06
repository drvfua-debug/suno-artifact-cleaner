"use client";

import { Download } from "lucide-react";
import { encodeWav } from "@/lib/audio/encodeWav";
import type { AudioAnalysis, AudioBufferData, ProcessingParams, ProcessingResult } from "@/lib/audio/types";

type Props = {
  fileName?: string;
  processed?: AudioBufferData;
  analysis?: AudioAnalysis;
  processedAnalysis?: AudioAnalysis;
  params: ProcessingParams;
  result?: ProcessingResult;
  preset: string;
  outputFileName: string;
  onWavSaved: () => void;
};

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
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

export function ExportPanel({ fileName, processed, analysis, processedAnalysis, params, result, preset, outputFileName, onWavSaved }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
      <button
        className="inline-flex items-center justify-center gap-2 rounded bg-emerald-300 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
        disabled={!processed}
        onClick={() => {
          if (!processed) return;
          downloadBlob(encodeWav(processed, 16), outputFileName);
          onWavSaved();
        }}
      >
        <Download className="h-4 w-4" /> WAV保存
      </button>
      <button
        className="inline-flex items-center justify-center gap-2 rounded border border-line bg-panel px-3 py-2 text-sm disabled:opacity-50"
        disabled={!analysis}
        onClick={() => {
          if (!analysis) return;
          const report = {
            sourceFilename: fileName,
            duration: analysis.duration,
            sampleRate: analysis.sampleRate,
            channels: analysis.channels,
            peak: analysis.peakDb,
            rms: analysis.rmsDb,
            estimatedTruePeak: analysis.estimatedTruePeakDb,
            estimatedLUFS: analysis.estimatedLufs,
            scores: analysis.scores,
            selectedPreset: preset,
            manualParameters: params,
            processingChain: result?.chain ?? [],
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
            lastThirdDegradationScore: analysis.degradationSummary.lastThirdScore,
            recommendedLongSongPreset: analysis.degradationSummary.recommendedPreset,
            temporalProcessingCurve: result?.temporalProcessingCurve ?? analysis.temporalProcessingCurve,
            processedAnalysis,
            scoreDelta: scoreDelta(analysis, processedAnalysis),
            createdAt: new Date().toISOString()
          };
          downloadBlob(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }), "analysis-report.json");
        }}
      >
        <Download className="h-4 w-4" /> Report
      </button>
    </div>
  );
}
