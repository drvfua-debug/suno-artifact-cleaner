import { ampToDb, clamp, clippingCount, dynamicRangeApprox, estimateLufs, estimateTruePeak, mean, mergeToMono, peak, rms, stereoWidthApprox, transientDensityApprox } from "./metrics";
import type { AudioAnalysis, AudioBufferData, BandAnalysis, DegradationSummary, ReferenceProfile, ScoreSeverity, ScoreSeverityDetail, TemporalCurvePoint, TimelineMetric } from "./types";

export const problemBands = [
  { key: "subRumble", label: "sub rumble", fromHz: 0, toHz: 20 },
  { key: "lowMud", label: "low mud", fromHz: 150, toHz: 350 },
  { key: "boxiness", label: "boxiness", fromHz: 350, toHz: 600 },
  { key: "presenceHarshness", label: "Harshness", fromHz: 2500, toHz: 5000 },
  { key: "sibilance", label: "Sibilance", fromHz: 5000, toHz: 8500 },
  { key: "metallic", label: "Metallic tone", fromHz: 8500, toHz: 13000 },
  { key: "hiss", label: "High-end fizz", fromHz: 13000, toHz: 18000 },
  { key: "ultrasonic", label: "ultrasonic edge", fromHz: 18000, toHz: 24000 }
] as const;

type SpectrumStats = {
  centroid: number;
  flatness: number;
  highRatio: number;
  totalEnergy: number;
  bandEnergy: Record<string, number>;
  bandPeak: Record<string, number>;
};

function goertzelPower(samples: Float32Array, sampleRate: number, freq: number): number {
  const omega = (2 * Math.PI * freq) / sampleRate;
  const coeff = 2 * Math.cos(omega);
  let s0 = 0, s1 = 0, s2 = 0;
  for (let i = 0; i < samples.length; i++) {
    s0 = samples[i] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return Math.max(0, s1 * s1 + s2 * s2 - coeff * s1 * s2) / Math.max(1, samples.length);
}

function spectrumStats(samples: Float32Array, sampleRate: number): SpectrumStats {
  const maxHz = Math.min(sampleRate / 2, 22000);
  const points = 128;
  let weighted = 0;
  let total = 0;
  let geo = 0;
  let high = 0;
  const bandEnergy: Record<string, number> = {};
  const bandPeak: Record<string, number> = {};
  for (const band of problemBands) {
    bandEnergy[band.key] = 0;
    bandPeak[band.key] = 0;
  }
  for (let i = 1; i <= points; i++) {
    const hz = 35 * Math.pow(maxHz / 35, i / points);
    const power = goertzelPower(samples, sampleRate, hz) + 1e-14;
    weighted += hz * power;
    total += power;
    geo += Math.log(power);
    if (hz >= 8000) high += power;
    for (const band of problemBands) {
      if (hz >= band.fromHz && hz < band.toHz) {
        bandEnergy[band.key] += power;
        bandPeak[band.key] = Math.max(bandPeak[band.key], power);
      }
    }
  }
  for (const band of problemBands) {
    bandEnergy[band.key] = bandEnergy[band.key] / Math.max(1e-12, total);
    bandPeak[band.key] = bandPeak[band.key] / Math.max(1e-12, total);
  }
  return {
    centroid: weighted / Math.max(1e-12, total),
    flatness: clamp(Math.exp(geo / points) / Math.max(1e-12, total / points), 0, 1),
    highRatio: clamp(high / Math.max(1e-12, total), 0, 1),
    totalEnergy: total,
    bandEnergy,
    bandPeak
  };
}

function representativeSample(samples: Float32Array, maxSamples: number): Float32Array {
  if (samples.length <= maxSamples) return samples;
  const out = new Float32Array(maxSamples);
  const windows = Math.min(16, Math.max(4, Math.floor(maxSamples / 4096)));
  const windowSize = Math.floor(maxSamples / windows);
  let offset = 0;
  for (let w = 0; w < windows; w++) {
    const position = windows === 1 ? 0 : w / (windows - 1);
    const start = Math.min(samples.length - windowSize, Math.floor(position * Math.max(0, samples.length - windowSize)));
    for (let i = 0; i < windowSize && offset < out.length; i++) {
      out[offset++] = samples[start + i];
    }
  }
  return out;
}

function scoreEnergy(value: number, scale: number): number {
  return clamp(scoreEnergyRaw(value, scale), 0, 100);
}

function scoreEnergyRaw(value: number, scale: number): number {
  return Math.log10(1 + value / scale) * 42;
}

function bandScoreRaw(averageEnergy: number, contrast: number): number {
  return scoreEnergyRaw(averageEnergy, 0.01) + Math.max((contrast - 1.8) * 12, 0);
}

function severityDetail(score: number, rawScore = score): ScoreSeverityDetail {
  const raw = Number.isFinite(rawScore) ? Math.max(0, rawScore) : score;
  return {
    score: clamp(score, 0, 100),
    raw,
    overLimit: Math.max(0, raw - 100),
    saturated: score >= 99 || raw > 100
  };
}

function makeBandAnalysis(stats: SpectrumStats): BandAnalysis[] {
  return problemBands.map((band) => {
    const local = stats.bandEnergy[band.key] ?? 0;
    const surrounding = 1 / 128;
    const contrast = local / Math.max(1e-12, surrounding);
    return {
      key: band.key,
      label: band.label,
      fromHz: band.fromHz,
      toHz: band.toHz,
      averageEnergy: local,
      peakEnergy: stats.bandPeak[band.key] ?? 0,
      contrast,
      score: clamp(bandScoreRaw(local, contrast), 0, 100)
    };
  });
}

function detectHighRolloff(samples: Float32Array, sampleRate: number): { rolloffHz: number; lossScore: number } {
  const nyquist = sampleRate / 2;
  const freqs = [10000, 12000, 14000, 16000, 18000, 20000].filter((hz) => hz < nyquist - 100);
  if (freqs.length < 3) return { rolloffHz: nyquist, lossScore: 0 };
  const powers = freqs.map((hz) => goertzelPower(samples, sampleRate, hz) + 1e-14);
  const base = (powers[0] + powers[1]) * 0.5;
  let rolloffHz = Math.min(nyquist, 20000);
  for (let i = 2; i < freqs.length; i++) {
    const dbDrop = 10 * Math.log10(Math.max(1e-14, powers[i]) / Math.max(1e-14, base));
    if (dbDrop < -18) {
      rolloffHz = freqs[i];
      break;
    }
  }
  const top = powers.slice(Math.max(2, powers.length - 2)).reduce((a, b) => a + b, 0) / Math.max(1, powers.length - 2);
  const lossDb = -10 * Math.log10(Math.max(1e-14, top) / Math.max(1e-14, base));
  return {
    rolloffHz,
    lossScore: clamp((lossDb - 10) * 4.5, 0, 100)
  };
}

function averageMetric(metrics: TimelineMetric[], key: keyof TimelineMetric): number {
  if (!metrics.length) return 0;
  return metrics.reduce((sum, item) => sum + Number(item[key]), 0) / metrics.length;
}

export function selectReferenceProfile(metrics: TimelineMetric[], duration: number, override?: { startSec: number; endSec: number }): ReferenceProfile {
  const manual = override ? metrics.filter((m) => m.startSec >= override.startSec && m.endSec <= override.endSec) : [];
  const preferred = manual.length ? manual : metrics.filter((m) => m.startSec >= 10 && m.startSec >= Math.min(20, Math.max(10, duration * 0.05)) && m.endSec <= Math.min(60, duration * 0.45));
  const fallback = metrics.filter((m) => m.startSec >= 10).slice(0, Math.max(1, Math.ceil(metrics.length / 3)));
  const viable = (preferred.length ? preferred : fallback).filter((m) => (
    m.rmsDb > -40 &&
    m.clippingCount < 8 &&
    m.spectralFlatness < 0.65 &&
    m.crestFactor > 4 &&
    m.highFrequencyRatio < 0.5
  ));
  const selected = viable.length ? viable : (preferred.length ? preferred : fallback.length ? fallback : metrics.slice(0, 1));
  return {
    startSec: selected[0]?.startSec ?? 0,
    endSec: selected[selected.length - 1]?.endSec ?? Math.min(duration, 30),
    avgRmsDb: averageMetric(selected, "rmsDb"),
    avgSpectralCentroid: averageMetric(selected, "spectralCentroid"),
    avgSpectralFlatness: averageMetric(selected, "spectralFlatness"),
    avgHighFrequencyRatio: averageMetric(selected, "highFrequencyRatio"),
    avgHarshnessEnergy: averageMetric(selected, "harshnessEnergy"),
    avgSibilanceEnergy: averageMetric(selected, "sibilanceEnergy"),
    avgMetallicEnergy: averageMetric(selected, "metallicEnergy"),
    avgHissEnergy: averageMetric(selected, "hissEnergy"),
    avgMudEnergy: averageMetric(selected, "mudEnergy"),
    avgStereoWidth: averageMetric(selected, "stereoWidth"),
    avgDynamicRange: averageMetric(selected, "dynamicRange")
  };
}

function ratioRise(value: number, reference: number, weight: number): number {
  return clamp(((value / Math.max(1e-12, reference)) - 1.12) * weight, 0, weight * 2.2);
}

function computeDegradation(metric: TimelineMetric, ref: ReferenceProfile): { score: number; rawScore: number; cause: DegradationSummary["primaryCause"] } {
  if (metric.startSec < 10 || metric.rmsDb < -46 || metric.rmsDb < ref.avgRmsDb - 14) {
    return { score: 0, rawScore: 0, cause: "unknown" };
  }
  const causes = {
    harshness: ratioRise(metric.harshnessEnergy, ref.avgHarshnessEnergy, 22),
    sibilance: ratioRise(metric.sibilanceEnergy, ref.avgSibilanceEnergy, 24),
    metallic: ratioRise(metric.metallicEnergy, ref.avgMetallicEnergy, 18),
    hiss: ratioRise(metric.hissEnergy, ref.avgHissEnergy, 30),
    clipping: clamp(metric.clippingCount / 30, 0, 18),
    dynamic_range_loss: clamp((ref.avgDynamicRange - metric.dynamicRange - 1.5) * 5, 0, 18),
    stereo_instability: clamp((Math.abs(metric.stereoWidth - ref.avgStereoWidth) - 0.25) * 22, 0, 16)
  };
  const texture = clamp((metric.spectralFlatness - ref.avgSpectralFlatness - 0.035) * 105, 0, 24);
  const highOnly = clamp((metric.highFrequencyRatio - ref.avgHighFrequencyRatio - 0.035) * 130, 0, 25);
  const crestLoss = clamp((ref.avgDynamicRange > 0 ? ref.avgDynamicRange - metric.dynamicRange : 0) * 1.5, 0, 10);
  const looksLikeBalancedLoudnessRise =
    metric.rmsDb > ref.avgRmsDb + 3 &&
    Math.abs(metric.highFrequencyRatio - ref.avgHighFrequencyRatio) < 0.035 &&
    Math.abs(metric.spectralFlatness - ref.avgSpectralFlatness) < 0.05;
  const targetedHighRise =
    metric.harshnessEnergy > ref.avgHarshnessEnergy * 1.55 ||
    metric.sibilanceEnergy > ref.avgSibilanceEnergy * 1.55 ||
    metric.metallicEnergy > ref.avgMetallicEnergy * 1.45 ||
    metric.hissEnergy > ref.avgHissEnergy * 1.4;
  const entries = Object.entries(causes) as Array<[DegradationSummary["primaryCause"], number]>;
  const [cause] = entries.reduce((best, entry) => entry[1] > best[1] ? entry : best, ["unknown", 0] as [DegradationSummary["primaryCause"], number]);
  const rawScore = Object.values(causes).reduce((a, b) => a + b, 0) + texture + highOnly + crestLoss;
  const adjustedRaw = !targetedHighRise && looksLikeBalancedLoudnessRise
    ? Math.min(rawScore * 0.45, 25)
    : looksLikeBalancedLoudnessRise ? rawScore * 0.65 : rawScore;
  const score = clamp(adjustedRaw, 0, 100);
  return { score, rawScore: adjustedRaw, cause: score > 12 ? cause : "unknown" };
}

function maxSectionRank(metric: TimelineMetric, duration: number, ref: ReferenceProfile): number {
  const progress = duration > 0 ? metric.startSec / duration : 0;
  const postReferenceFocus = metric.startSec >= Math.max(ref.endSec + 60, duration * 0.45) ? 8 : 0;
  const lateMidFocus = clamp((progress - 0.5) * 10, 0, 4);
  const veryLatePenalty = progress > 0.82 ? (progress - 0.82) * 18 : 0;
  return metric.degradationScore + postReferenceFocus + lateMidFocus - veryLatePenalty;
}

function chooseMaxSection(metrics: TimelineMetric[], ref: ReferenceProfile): TimelineMetric {
  const fallback = metrics[0] ?? ({ degradationScore: 0, startSec: 0, endSec: 0 } as TimelineMetric);
  const duration = metrics[metrics.length - 1]?.endSec ?? 0;
  const candidates = metrics.filter((m) => m.startSec >= 10 && m.rmsDb > ref.avgRmsDb - 14 && m.rmsDb > -46);
  const rawMax = candidates.reduce((best, item) => item.degradationScore > best.degradationScore ? item : best, fallback);
  const postReference = candidates.filter((m) => m.startSec >= Math.max(ref.endSec + 60, duration * 0.45));
  const rankedPool = postReference.some((m) => m.degradationScore >= Math.max(38, rawMax.degradationScore * 0.72))
    ? postReference
    : candidates;
  return rankedPool.reduce((best, item) => {
    const rank = maxSectionRank(item, duration, ref);
    const bestRank = maxSectionRank(best, duration, ref);
    return rank > bestRank ? item : best;
  }, rawMax);
}

function summarize(metrics: TimelineMetric[], ref: ReferenceProfile): DegradationSummary {
  const thirds = [0, 1, 2].map((part) => {
    const a = Math.floor((metrics.length * part) / 3);
    const b = Math.max(a + 1, Math.floor((metrics.length * (part + 1)) / 3));
    return averageMetric(metrics.slice(a, b), "degradationScore");
  });
  const max = chooseMaxSection(metrics, ref);
  const rawMax = metrics.reduce((best, item) => (item.degradationRawScore ?? item.degradationScore) > (best.degradationRawScore ?? best.degradationScore) ? item : best, max);
  const causeVotes = new Map<DegradationSummary["primaryCause"], number>();
  for (const metric of metrics) {
    const rises: Array<[DegradationSummary["primaryCause"], number]> = [
      ["hiss", ratioRise(metric.hissEnergy, ref.avgHissEnergy, 30)],
      ["sibilance", ratioRise(metric.sibilanceEnergy, ref.avgSibilanceEnergy, 24)],
      ["harshness", ratioRise(metric.harshnessEnergy, ref.avgHarshnessEnergy, 22)],
      ["metallic", ratioRise(metric.metallicEnergy, ref.avgMetallicEnergy, 18)],
      ["dynamic_range_loss", clamp((ref.avgDynamicRange - metric.dynamicRange - 1.5) * 5, 0, 18)],
      ["stereo_instability", clamp((Math.abs(metric.stereoWidth - ref.avgStereoWidth) - 0.25) * 22, 0, 16)]
    ];
    const [cause, weight] = rises.sort((a, b) => b[1] - a[1])[0] ?? ["unknown", 0];
    causeVotes.set(cause, (causeVotes.get(cause) ?? 0) + weight * Math.max(1, metric.degradationScore));
  }
  const primaryCause = [...causeVotes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";
  const avg = averageMetric(metrics, "degradationScore");
  const last = thirds[2] ?? 0;
  return {
    averageDegradationScore: avg,
    firstThirdScore: thirds[0] ?? 0,
    middleThirdScore: thirds[1] ?? 0,
    lastThirdScore: last,
    maxScore: max.degradationScore,
    averageRawDegradationScore: averageMetric(metrics, "degradationRawScore" as keyof TimelineMetric),
    maxRawScore: rawMax.degradationRawScore ?? rawMax.degradationScore,
    maxRawScoreStartSec: rawMax.startSec,
    maxRawScoreEndSec: rawMax.endSec,
    maxScoreStartSec: max.startSec,
    maxScoreEndSec: max.endSec,
    primaryCause,
    recommendedPreset: (max.clippingCount > 20 || (max.degradationScore > 95 && last > 90 && avg > 55)) ? "strong" : max.degradationScore > 38 || last > 35 ? "balanced" : max.degradationScore > 18 || last > 18 ? "gentle" : "none"
  };
}

export function makeTemporalCurve(metrics: TimelineMetric[], strength = 1): TemporalCurvePoint[] {
  let smoothed = 0;
  return metrics.map((metric) => {
    smoothed = smoothed * 0.72 + metric.recommendedRepairAmount * 0.28;
    const amount = clamp(smoothed * strength, 0, 100);
    return {
      startSec: metric.startSec,
      endSec: metric.endSec,
      harshnessReduction: clamp(amount * 0.78, 0, 100),
      sibilanceReduction: clamp(amount * 0.92, 0, 100),
      metallicReduction: clamp(amount * 0.82, 0, 100),
      hissReduction: clamp(amount, 0, 100),
      mudReduction: clamp(amount * 0.18, 0, 100),
      stereoWidthReduction: clamp(amount * 0.8, 0, 100),
      outputGain: amount > 70 ? -0.8 : amount > 40 ? -0.35 : 0,
      limiterAmount: clamp(amount / 100, 0, 1)
    };
  });
}

export function analyzeAudio(data: AudioBufferData, chunkSeconds = 10, referenceOverride?: { startSec: number; endSec: number }): AudioAnalysis {
  const length = data.channels[0]?.length ?? 0;
  const duration = length / data.sampleRate;
  const mono = mergeToMono(data);
  const representative = representativeSample(mono, 65536);
  const fullStats = spectrumStats(representativeSample(mono, 32768), data.sampleRate);
  const highProfile = detectHighRolloff(representative, data.sampleRate);
  const bands = makeBandAnalysis(fullStats);
  const chunkSize = Math.max(1024, Math.floor(chunkSeconds * data.sampleRate));
  const timelineMetrics: TimelineMetric[] = [];
  for (let start = 0; start < length; start += chunkSize) {
    const end = Math.min(length, start + chunkSize);
    const chunk = mergeToMono(data, start, end);
    const sample = chunk.length > 32768 ? chunk.subarray(0, 32768) : chunk;
    const stats = spectrumStats(sample, data.sampleRate);
    const p = peak(chunk);
    const r = rms(chunk);
    timelineMetrics.push({
      startSec: start / data.sampleRate,
      endSec: end / data.sampleRate,
      peakDb: ampToDb(p),
      rmsDb: ampToDb(r),
      crestFactor: p / Math.max(1e-12, r),
      estimatedLufs: estimateLufs(chunk),
      clippingCount: clippingCount(chunk),
      spectralCentroid: stats.centroid,
      spectralFlatness: stats.flatness,
      highFrequencyRatio: stats.highRatio,
      harshnessEnergy: stats.bandEnergy.presenceHarshness,
      sibilanceEnergy: stats.bandEnergy.sibilance,
      metallicEnergy: stats.bandEnergy.metallic,
      hissEnergy: stats.bandEnergy.hiss,
      mudEnergy: stats.bandEnergy.lowMud,
      stereoWidth: stereoWidthApprox(data, start, end),
      transientDensity: transientDensityApprox(chunk),
      dynamicRange: dynamicRangeApprox(chunk),
      degradationScore: 0,
      degradationRawScore: 0,
      recommendedRepairAmount: 0
    });
  }
  const referenceProfile = selectReferenceProfile(timelineMetrics, duration, referenceOverride);
  for (const metric of timelineMetrics) {
    const result = computeDegradation(metric, referenceProfile);
    metric.degradationScore = result.score;
    metric.degradationRawScore = result.rawScore;
    metric.recommendedRepairAmount = clamp(result.score * 1.05, 0, 100);
  }
  const degradationSummary = summarize(timelineMetrics, referenceProfile);
  const temporalProcessingCurve = makeTemporalCurve(timelineMetrics);
  const p = peak(mono);
  const r = rms(mono);
  const scoreValues = {
    harshness: bands.find((b) => b.key === "presenceHarshness")?.score ?? 0,
    sibilance: bands.find((b) => b.key === "sibilance")?.score ?? 0,
    metallic: bands.find((b) => b.key === "metallic")?.score ?? 0,
    hiss: bands.find((b) => b.key === "hiss")?.score ?? 0,
    mud: bands.find((b) => b.key === "lowMud")?.score ?? 0,
    clipping: clamp(clippingCount(mono) / 50, 0, 100),
    truePeak: clamp((ampToDb(estimateTruePeak(mono)) + 2) * 30, 0, 100),
    degradation: Math.max(degradationSummary.lastThirdScore, degradationSummary.maxScore),
    highFrequencyLoss: highProfile.lossScore
  };
  const bandByKey = (key: string) => bands.find((b) => b.key === key);
  const rawScoreValues = {
    harshness: bandScoreRaw(bandByKey("presenceHarshness")?.averageEnergy ?? 0, bandByKey("presenceHarshness")?.contrast ?? 1),
    sibilance: bandScoreRaw(bandByKey("sibilance")?.averageEnergy ?? 0, bandByKey("sibilance")?.contrast ?? 1),
    metallic: bandScoreRaw(bandByKey("metallic")?.averageEnergy ?? 0, bandByKey("metallic")?.contrast ?? 1),
    hiss: bandScoreRaw(bandByKey("hiss")?.averageEnergy ?? 0, bandByKey("hiss")?.contrast ?? 1),
    mud: bandScoreRaw(bandByKey("lowMud")?.averageEnergy ?? 0, bandByKey("lowMud")?.contrast ?? 1),
    clipping: clippingCount(mono) / 50,
    truePeak: (ampToDb(estimateTruePeak(mono)) + 2) * 30,
    degradation: Math.max(degradationSummary.lastThirdScore, degradationSummary.maxRawScore ?? degradationSummary.maxScore),
    highFrequencyLoss: highProfile.lossScore
  };
  const scoreSeverity: ScoreSeverity = {
    harshness: severityDetail(scoreValues.harshness, rawScoreValues.harshness),
    sibilance: severityDetail(scoreValues.sibilance, rawScoreValues.sibilance),
    metallic: severityDetail(scoreValues.metallic, rawScoreValues.metallic),
    hiss: severityDetail(scoreValues.hiss, rawScoreValues.hiss),
    mud: severityDetail(scoreValues.mud, rawScoreValues.mud),
    clipping: severityDetail(scoreValues.clipping, rawScoreValues.clipping),
    truePeak: severityDetail(scoreValues.truePeak, rawScoreValues.truePeak),
    degradation: severityDetail(scoreValues.degradation, rawScoreValues.degradation),
    highFrequencyLoss: severityDetail(scoreValues.highFrequencyLoss, rawScoreValues.highFrequencyLoss)
  };
  const warnings: string[] = [];
  if (duration >= 600) warnings.push("This file is over 10 minutes. Watch browser memory usage.");
  if (data.channels.reduce((sum, ch) => sum + ch.byteLength, 0) > 300 * 1024 * 1024) warnings.push("Large file detected. Processing may take time.");
  if (clippingCount(mono) > 0) warnings.push("Possible clipping detected.");
  return {
    duration,
    sampleRate: data.sampleRate,
    channels: data.channels.length,
    peakDb: ampToDb(p),
    rmsDb: ampToDb(r),
    crestFactor: p / Math.max(1e-12, r),
    dcOffset: mean(mono),
    clippingCount: clippingCount(mono),
    estimatedTruePeakDb: ampToDb(estimateTruePeak(mono)),
    estimatedLufs: estimateLufs(mono),
    shortTermLoudness: timelineMetrics.map((m) => m.estimatedLufs),
    spectralCentroid: fullStats.centroid,
    spectralFlatness: fullStats.flatness,
    highFrequencyRatio: fullStats.highRatio,
    bands,
    scores: scoreValues,
    scoreSeverity,
    highRolloffHz: highProfile.rolloffHz,
    highFrequencyLossScore: highProfile.lossScore,
    timelineMetrics,
    referenceProfile,
    degradationSummary,
    temporalProcessingCurve,
    warnings
  };
}
