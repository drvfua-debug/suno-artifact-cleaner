import { describe, expect, it } from "vitest";
import { analyzeAudio } from "@/lib/audio/analysis";
import { applyHighPass, makeDifference, processAudio, removeDcOffset, simpleLimiter } from "@/lib/audio/dsp";
import { defaultParams } from "@/lib/audio/presets";
import { mean, peak, rms } from "@/lib/audio/metrics";
import type { AudioBufferData } from "@/lib/audio/types";

function tone(freq: number, duration = 1, sampleRate = 44100, gain = 0.5): Float32Array {
  const out = new Float32Array(duration * sampleRate);
  for (let i = 0; i < out.length; i++) out[i] = gain * Math.sin(2 * Math.PI * freq * i / sampleRate);
  return out;
}

const zeroScoreSeverity = {
  harshness: { score: 0, raw: 0, overLimit: 0, saturated: false },
  sibilance: { score: 0, raw: 0, overLimit: 0, saturated: false },
  metallic: { score: 0, raw: 0, overLimit: 0, saturated: false },
  hiss: { score: 0, raw: 0, overLimit: 0, saturated: false },
  mud: { score: 0, raw: 0, overLimit: 0, saturated: false },
  clipping: { score: 0, raw: 0, overLimit: 0, saturated: false },
  truePeak: { score: 0, raw: 0, overLimit: 0, saturated: false },
  degradation: { score: 0, raw: 0, overLimit: 0, saturated: false },
  highFrequencyLoss: { score: 0, raw: 0, overLimit: 0, saturated: false }
};

describe("dsp", () => {
  it("removes DC offset", () => {
    const input = new Float32Array([0.3, 0.4, 0.5, 0.6]);
    const out = removeDcOffset(input);
    expect(Math.abs(mean(out))).toBeLessThan(1e-6);
  });

  it("reduces low-frequency content after high-pass", () => {
    const input = tone(8, 2, 44100, 0.7);
    const out = applyHighPass(input, 44100, 20);
    expect(rms(out)).toBeLessThan(rms(input) * 0.7);
  });

  it("limiter prevents 0dBFS overs", () => {
    const input = new Float32Array([0, 1.4, -1.3, 0.8]);
    const out = simpleLimiter(input, -0.5);
    expect(peak(out)).toBeLessThanOrEqual(1);
  });

  it("applies artifact headroom before repair processing", () => {
    const sampleRate = 44100;
    const source = tone(440, 1, sampleRate, 0.5);
    const flatParams = {
      ...defaultParams,
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
      outputGainDb: 0,
      truePeakCeilingDb: -0.1,
      longSongDecayFix: false
    };
    const withHeadroom = processAudio({ sampleRate, channels: [source] }, { ...flatParams, artifactHeadroomDb: -3 });
    const withoutHeadroom = processAudio({ sampleRate, channels: [source] }, { ...flatParams, artifactHeadroomDb: 0 });
    expect(withHeadroom.peakDb).toBeLessThan(withoutHeadroom.peakDb - 2.5);
    expect(withHeadroom.chain.some((item) => item.includes("Artifact safety headroom -3.0dB"))).toBe(true);
  });

  it("separates removed and added monitor signals", () => {
    const sampleRate = 44100;
    const original: AudioBufferData = { sampleRate, channels: [new Float32Array([0.8, 0.2, -0.8, -0.2])] };
    const processed: AudioBufferData = { sampleRate, channels: [new Float32Array([0.4, 0.5, -0.4, -0.5])] };
    const removed = makeDifference(original, processed, "removed").channels[0];
    const added = makeDifference(original, processed, "added").channels[0];
    expect(removed[0]).toBeCloseTo(0.4);
    expect(removed[1]).toBeCloseTo(0);
    expect(removed[2]).toBeCloseTo(-0.4);
    expect(removed[3]).toBeCloseTo(0);
    expect(added[0]).toBeCloseTo(0);
    expect(added[1]).toBeCloseTo(0.3);
    expect(added[2]).toBeCloseTo(0);
    expect(added[3]).toBeCloseTo(-0.3);
  });

  it("Long Song Decay Fix makes later metallic/hiss reduction larger", () => {
    const sampleRate = 32000;
    const duration = 90;
    const left = new Float32Array(sampleRate * duration);
    for (let i = 0; i < left.length; i++) {
      const late = i / left.length > 2 / 3;
      left[i] = 0.2 * Math.sin(2 * Math.PI * 440 * i / sampleRate) + (late ? 0.13 * Math.sin(2 * Math.PI * 10500 * i / sampleRate) : 0);
    }
    const audio: AudioBufferData = { sampleRate, channels: [left] };
    const analysis = analyzeAudio(audio, 10);
    const result = processAudio(audio, { ...defaultParams, longSongDecayFix: true, metallicReduction: 80, hissReduction: 70 }, analysis);
    const first = result.temporalProcessingCurve[0];
    const last = result.temporalProcessingCurve[result.temporalProcessingCurve.length - 1];
    expect(last.metallicReduction).toBeGreaterThan(first.metallicReduction);
    expect(last.hissReduction).toBeGreaterThanOrEqual(first.hissReduction);
    expect(result.peakDb).toBeLessThanOrEqual(0);
  });

  it("vocal forward processing keeps output under 0dBFS", () => {
    const sampleRate = 44100;
    const center = tone(1200, 1, sampleRate, 0.35);
    const side = tone(3000, 1, sampleRate, 0.18);
    const left = new Float32Array(center.length);
    const right = new Float32Array(center.length);
    for (let i = 0; i < center.length; i++) {
      left[i] = center[i] + side[i];
      right[i] = center[i] - side[i];
    }
    const result = processAudio(
      { sampleRate, channels: [left, right] },
      { ...defaultParams, vocalForward: 100, outputGainDb: 1.5, truePeakCeilingDb: -0.8 }
    );
    expect(result.chain.some((item) => item.includes("Vocal image forward"))).toBe(true);
    expect(result.peakDb).toBeLessThanOrEqual(0);
  });

  it("temporal stereo width repair is included and keeps output under 0dBFS", () => {
    const sampleRate = 32000;
    const duration = 30;
    const length = sampleRate * duration;
    const left = new Float32Array(length);
    const right = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const center = 0.25 * Math.sin(2 * Math.PI * 440 * t);
      const lateWideNoise = i > length / 2 ? 0.22 * Math.sin(2 * Math.PI * 11000 * t) : 0;
      left[i] = center + lateWideNoise;
      right[i] = center - lateWideNoise;
    }
    const result = processAudio(
      { sampleRate, channels: [left, right] },
      { ...defaultParams, stereoWidthReduction: 100, longSongDecayFix: true },
      {
        duration,
        sampleRate,
        channels: 2,
        peakDb: -6,
        rmsDb: -18,
        crestFactor: 4,
        dcOffset: 0,
        clippingCount: 0,
        estimatedTruePeakDb: -6,
        estimatedLufs: -18,
        shortTermLoudness: [],
        spectralCentroid: 0,
        spectralFlatness: 0,
        highFrequencyRatio: 0,
        bands: [],
        scores: { harshness: 0, sibilance: 0, metallic: 0, hiss: 0, mud: 0, clipping: 0, truePeak: 0, degradation: 0, highFrequencyLoss: 0 },
        scoreSeverity: zeroScoreSeverity,
        highRolloffHz: sampleRate / 2,
        highFrequencyLossScore: 0,
        timelineMetrics: [],
        referenceProfile: {
          startSec: 0,
          endSec: 10,
          avgRmsDb: -18,
          avgSpectralCentroid: 0,
          avgSpectralFlatness: 0,
          avgHighFrequencyRatio: 0,
          avgHarshnessEnergy: 0,
          avgSibilanceEnergy: 0,
          avgMetallicEnergy: 0,
          avgHissEnergy: 0,
          avgMudEnergy: 0,
          avgStereoWidth: 0,
          avgDynamicRange: 0
        },
        degradationSummary: { averageDegradationScore: 0, firstThirdScore: 0, middleThirdScore: 0, lastThirdScore: 0, maxScore: 0, maxScoreStartSec: 0, maxScoreEndSec: 0, primaryCause: "unknown", recommendedPreset: "none" },
        temporalProcessingCurve: [
          { startSec: 0, endSec: 10, harshnessReduction: 0, sibilanceReduction: 0, metallicReduction: 0, hissReduction: 0, mudReduction: 0, stereoWidthReduction: 0, outputGain: 0, limiterAmount: 0 },
          { startSec: 10, endSec: 20, harshnessReduction: 0, sibilanceReduction: 0, metallicReduction: 0, hissReduction: 40, mudReduction: 0, stereoWidthReduction: 80, outputGain: 0, limiterAmount: 0 },
          { startSec: 20, endSec: 30, harshnessReduction: 0, sibilanceReduction: 0, metallicReduction: 0, hissReduction: 70, mudReduction: 0, stereoWidthReduction: 100, outputGain: 0, limiterAmount: 0 }
        ],
        warnings: []
      }
    );
    expect(result.chain.some((item) => item.includes("Temporal stereo noise width repair"))).toBe(true);
    expect(result.peakDb).toBeLessThanOrEqual(0);
  });

  it("tone leveling and bass enhance are included and keep output under 0dBFS", () => {
    const sampleRate = 44100;
    const length = sampleRate * 2;
    const left = new Float32Array(length);
    const right = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const level = i < length / 2 ? 0.12 : 0.42;
      const value = level * Math.sin(2 * Math.PI * 90 * t) + level * 0.35 * Math.sin(2 * Math.PI * 900 * t);
      left[i] = value;
      right[i] = value;
    }
    const result = processAudio(
      { sampleRate, channels: [left, right] },
      { ...defaultParams, toneLeveling: 100, bassEnhance: 100, outputGainDb: 1, truePeakCeilingDb: -0.7 }
    );
    expect(result.chain.some((item) => item.includes("Tone leveling"))).toBe(true);
    expect(result.chain.some((item) => item.includes("Bass enhance"))).toBe(true);
    expect(result.peakDb).toBeLessThanOrEqual(0);
  });

  it("WAV air recovery remains peak-safe when high-frequency loss is detected", () => {
    const sampleRate = 44100;
    const length = sampleRate * 2;
    const left = new Float32Array(length);
    const right = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const value = 0.34 * Math.sin(2 * Math.PI * 520 * t) + 0.018 * Math.sin(2 * Math.PI * 15000 * t);
      left[i] = value;
      right[i] = value;
    }
    const audio: AudioBufferData = { sampleRate, channels: [left, right] };
    const analysis = analyzeAudio(audio, 10);
    const result = processAudio(
      audio,
      { ...defaultParams, repairAmount: 10, highTextureRepair: 0, highAirRecover: 18, truePeakCeilingDb: -0.8 },
      { ...analysis, highFrequencyLossScore: 90, scores: { ...analysis.scores, hiss: 4, metallic: 4, sibilance: 4, highFrequencyLoss: 90 } }
    );
    expect(result.chain.some((item) => item.includes("air recover 18%"))).toBe(true);
    expect(result.peakDb).toBeLessThanOrEqual(0);
  });
});
