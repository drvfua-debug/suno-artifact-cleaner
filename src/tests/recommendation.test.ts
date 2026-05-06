import { describe, expect, it } from "vitest";
import { buildRecommendedParams, recommendForAnalysis } from "@/lib/audio/recommendation";
import type { AudioAnalysis } from "@/lib/audio/types";

type AnalysisOverrides = Partial<Omit<AudioAnalysis, "scores" | "degradationSummary">> & {
  scores?: Partial<AudioAnalysis["scores"]>;
  degradationSummary?: Partial<AudioAnalysis["degradationSummary"]>;
};

function scoreSeverity(scores: AudioAnalysis["scores"]): AudioAnalysis["scoreSeverity"] {
  return Object.fromEntries(Object.entries(scores).map(([key, score]) => [
    key,
    { score, raw: score, overLimit: Math.max(0, score - 100), saturated: score >= 99 }
  ])) as AudioAnalysis["scoreSeverity"];
}

function makeAnalysis(overrides: AnalysisOverrides = {}): AudioAnalysis {
  const baseScores = { harshness: 12, sibilance: 10, metallic: 8, hiss: 8, mud: 20, clipping: 0, truePeak: 0, degradation: 20, highFrequencyLoss: 10 };
  const base: AudioAnalysis = {
    duration: 240,
    sampleRate: 44100,
    channels: 2,
    peakDb: -6,
    rmsDb: -18,
    crestFactor: 8,
    dcOffset: 0,
    clippingCount: 0,
    estimatedTruePeakDb: -6,
    estimatedLufs: -18,
    shortTermLoudness: [],
    spectralCentroid: 1200,
    spectralFlatness: 0.05,
    highFrequencyRatio: 0.02,
    highRolloffHz: 18000,
    highFrequencyLossScore: 10,
    bands: [],
    scores: baseScores,
    scoreSeverity: scoreSeverity(baseScores),
    timelineMetrics: [],
    referenceProfile: {
      startSec: 20,
      endSec: 60,
      avgRmsDb: -18,
      avgSpectralCentroid: 1000,
      avgSpectralFlatness: 0.04,
      avgHighFrequencyRatio: 0.01,
      avgHarshnessEnergy: 0,
      avgSibilanceEnergy: 0,
      avgMetallicEnergy: 0,
      avgHissEnergy: 0,
      avgMudEnergy: 0,
      avgStereoWidth: 0.3,
      avgDynamicRange: 10
    },
    degradationSummary: {
      averageDegradationScore: 22,
      firstThirdScore: 18,
      middleThirdScore: 22,
      lastThirdScore: 24,
      maxScore: 36,
      maxScoreStartSec: 120,
      maxScoreEndSec: 130,
      primaryCause: "unknown",
      recommendedPreset: "none"
    },
    temporalProcessingCurve: [],
    warnings: []
  };
  return {
    ...base,
    ...overrides,
    scores: { ...base.scores, ...(overrides.scores ?? {}) },
    scoreSeverity: scoreSeverity({ ...base.scores, ...(overrides.scores ?? {}) }),
    degradationSummary: { ...base.degradationSummary, ...(overrides.degradationSummary ?? {}) }
  };
}

describe("auto recommendation", () => {
  it("selects Long Song Decay Fix only when temporal rise is convincing", () => {
    const recommendation = recommendForAnalysis(makeAnalysis({
      scores: { hiss: 52, metallic: 45 },
      degradationSummary: {
        recommendedPreset: "balanced",
        firstThirdScore: 18,
        middleThirdScore: 56,
        lastThirdScore: 64,
        averageDegradationScore: 42,
        maxScore: 82,
        maxScoreStartSec: 170,
        maxScoreEndSec: 180,
        primaryCause: "hiss"
      }
    }));
    expect(recommendation.presetId).toBe("decay-balanced");
    expect(recommendation.profile).toBe("temporal_decay");
  });

  it("does not select Long Song Decay Fix for an isolated early spike", () => {
    const recommendation = recommendForAnalysis(makeAnalysis({
      scores: { hiss: 18, metallic: 14, harshness: 18 },
      degradationSummary: {
        recommendedPreset: "balanced",
        firstThirdScore: 35,
        middleThirdScore: 36,
        lastThirdScore: 34,
        averageDegradationScore: 30,
        maxScore: 85,
        maxScoreStartSec: 18,
        maxScoreEndSec: 28,
        primaryCause: "hiss"
      }
    }));
    expect(recommendation.presetId).not.toMatch(/^decay-/);
  });

  it("selects vocal de-harsh for whole-song harshness and sibilance", () => {
    const recommendation = recommendForAnalysis(makeAnalysis({
      scores: { harshness: 68, sibilance: 62, metallic: 20, hiss: 18 }
    }));
    expect(recommendation.presetId).toBe("de-harsh-vocal");
  });

  it("selects AI Glass Reducer for whole-song metallic hiss", () => {
    const recommendation = recommendForAnalysis(makeAnalysis({
      scores: { harshness: 25, sibilance: 22, metallic: 62, hiss: 58 }
    }));
    expect(recommendation.presetId).toBe("ai-glass");
  });

  it("does not treat MP3 high-frequency loss alone as AI glass", () => {
    const recommendation = recommendForAnalysis(makeAnalysis({
      highFrequencyLossScore: 100,
      scores: { highFrequencyLoss: 100, harshness: 12, sibilance: 8, metallic: 6, hiss: 4 }
    }), "MP3");
    expect(recommendation.presetId).toBe("natural");
    expect(recommendation.profile).toBe("natural");
  });

  it("keeps automatic recommendation subtractive even when WAV high end is missing", () => {
    const recommendation = recommendForAnalysis(makeAnalysis({
      highFrequencyLossScore: 75,
      scores: { highFrequencyLoss: 75, harshness: 20, sibilance: 12, metallic: 10, hiss: 8 }
    }), "WAV");
    expect(recommendation.presetId).toBe("natural");
    expect(recommendation.profile).toBe("natural");
  });

  it("builds adaptive numeric params instead of only copying a preset", () => {
    const analysis = makeAnalysis({
      peakDb: -4.8,
      rmsDb: -18,
      scores: { harshness: 25, sibilance: 20, metallic: 7, hiss: 45, mud: 30 },
      degradationSummary: {
        recommendedPreset: "balanced",
        firstThirdScore: 36,
        middleThirdScore: 59,
        lastThirdScore: 78,
        averageDegradationScore: 58,
        maxScore: 90,
        maxScoreStartSec: 220,
        maxScoreEndSec: 230,
        primaryCause: "hiss"
      }
    });
    const auto = buildRecommendedParams(analysis, "WAV");
    expect(auto.recommendation.presetId).toMatch(/^decay-/);
    expect(auto.params.hissReduction).toBeGreaterThan(auto.params.harshnessReduction);
    expect(auto.params.outputGainDb).toBeGreaterThan(0);
    expect(auto.params.vocalBody).toBeGreaterThan(0);
    expect(auto.params.masteringEnabled).toBe(false);
  });
});
