import { describe, expect, it } from "vitest";
import { analyzeAudio, makeTemporalCurve, selectReferenceProfile } from "@/lib/audio/analysis";
import { peak, rms } from "@/lib/audio/metrics";
import type { AudioBufferData } from "@/lib/audio/types";

function sine(freq: number, t: number, sampleRate: number): number {
  return Math.sin(2 * Math.PI * freq * t / sampleRate);
}

function makeSignal(durationSec: number, sampleRate = 32000, mode: "clean" | "late-metallic" | "late-hiss" | "severe-hiss" | "late-louder" | "quiet-intro-hiss" = "clean"): AudioBufferData {
  const length = durationSec * sampleRate;
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const third = i / length;
    const quietIntro = mode === "quiet-intro-hiss" && i < sampleRate * 10;
    const loudnessGain = quietIntro ? 0.02 : mode === "late-louder" && third > 2 / 3 ? 1.45 : 1;
    let v = loudnessGain * (0.22 * sine(440, i, sampleRate) + 0.08 * sine(1300, i, sampleRate));
    if (mode === "late-metallic" && third > 2 / 3) {
      v += 0.13 * sine(10500, i, sampleRate) + 0.05 * sine(13800, i, sampleRate);
    }
    if (mode === "late-hiss" && third > 2 / 3) {
      v += 0.12 * sine(15000, i, sampleRate) + 0.06 * sine(16800, i, sampleRate);
    }
    if (mode === "severe-hiss") {
      v += 0.42 * sine(15000, i, sampleRate) + 0.2 * sine(16800, i, sampleRate);
    }
    if (mode === "quiet-intro-hiss" && quietIntro) {
      v += 0.02 * sine(15000, i, sampleRate);
    }
    left[i] = v;
    right[i] = v * 0.96;
  }
  return { sampleRate, channels: [left, right] };
}

describe("audio analysis", () => {
  it("calculates RMS and peak", () => {
    const samples = new Float32Array([0.5, -0.25, 0.25, -0.5]);
    expect(peak(samples)).toBeCloseTo(0.5);
    expect(rms(samples)).toBeCloseTo(Math.sqrt((0.25 + 0.0625 + 0.0625 + 0.25) / 4));
  });

  it("generates timelineMetrics for chunks", () => {
    const analysis = analyzeAudio(makeSignal(35), 10);
    expect(analysis.timelineMetrics).toHaveLength(4);
    for (const metric of analysis.timelineMetrics) {
      expect(metric.recommendedRepairAmount).toBeGreaterThanOrEqual(0);
      expect(metric.recommendedRepairAmount).toBeLessThanOrEqual(100);
      expect(metric.degradationScore).toBeGreaterThanOrEqual(0);
      expect(metric.degradationScore).toBeLessThanOrEqual(100);
      expect(metric.degradationRawScore ?? 0).toBeGreaterThanOrEqual(metric.degradationScore);
    }
  });

  it("calculates a referenceProfile", () => {
    const analysis = analyzeAudio(makeSignal(70), 10);
    const ref = selectReferenceProfile(analysis.timelineMetrics, analysis.duration);
    expect(ref.endSec).toBeGreaterThan(ref.startSec);
    expect(ref.avgRmsDb).toBeLessThan(0);
  });

  it("raises lastThirdScore when late 8kHz-13kHz noise increases", () => {
    const analysis = analyzeAudio(makeSignal(180, 32000, "late-metallic"), 15);
    expect(analysis.degradationSummary.lastThirdScore).toBeGreaterThan(analysis.degradationSummary.firstThirdScore + 10);
  });

  it("does not over-score balanced loudness increase alone", () => {
    const analysis = analyzeAudio(makeSignal(180, 32000, "late-louder"), 15);
    expect(analysis.degradationSummary.lastThirdScore).toBeLessThan(35);
  });

  it("leans toward hiss as primary cause when 13kHz-18kHz energy rises", () => {
    const analysis = analyzeAudio(makeSignal(180, 44100, "late-hiss"), 10);
    expect(analysis.degradationSummary.primaryCause).toBe("hiss");
    expect(analysis.degradationSummary.recommendedPreset).not.toBe("strong");
  });

  it("global internal severity samples the whole song, not only the intro", () => {
    const clean = analyzeAudio(makeSignal(180, 44100, "clean"), 10);
    const lateHiss = analyzeAudio(makeSignal(180, 44100, "late-hiss"), 10);
    expect(lateHiss.scoreSeverity.hiss.raw).toBeGreaterThan(clean.scoreSeverity.hiss.raw);
  });

  it("does not pick a quiet 0-10s intro as max degradation", () => {
    const analysis = analyzeAudio(makeSignal(90, 44100, "quiet-intro-hiss"), 10);
    expect(analysis.degradationSummary.maxScoreStartSec).toBeGreaterThanOrEqual(10);
    expect(analysis.referenceProfile.startSec).toBeGreaterThanOrEqual(10);
  });

  it("reports maxDegradationSection on 10-second chunk boundaries", () => {
    const analysis = analyzeAudio(makeSignal(180, 32000, "late-metallic"), 10);
    expect(analysis.degradationSummary.maxScoreStartSec % 10).toBeCloseTo(0);
    expect(analysis.degradationSummary.maxScoreEndSec - analysis.degradationSummary.maxScoreStartSec).toBeLessThanOrEqual(10);
  });

  it("keeps raw score severity for 100-point saturation rescue", () => {
    const analysis = analyzeAudio(makeSignal(60, 44100, "severe-hiss"), 10);
    expect(analysis.scoreSeverity.hiss.score).toBeLessThanOrEqual(100);
    expect(analysis.scoreSeverity.hiss.raw).toBeGreaterThanOrEqual(analysis.scoreSeverity.hiss.score);
    expect(analysis.scoreSeverity.degradation.raw).toBeGreaterThanOrEqual(analysis.scoreSeverity.degradation.score);
    expect(analysis.degradationSummary.maxRawScore ?? 0).toBeGreaterThanOrEqual(analysis.degradationSummary.maxScore);
  });

  it("creates a smooth temporalProcessingCurve", () => {
    const analysis = analyzeAudio(makeSignal(90, 32000, "late-metallic"), 10);
    const curve = makeTemporalCurve(analysis.timelineMetrics);
    expect(curve).toHaveLength(analysis.timelineMetrics.length);
    for (let i = 1; i < curve.length; i++) {
      expect(Math.abs(curve[i].metallicReduction - curve[i - 1].metallicReduction)).toBeLessThanOrEqual(40);
    }
  });
});
