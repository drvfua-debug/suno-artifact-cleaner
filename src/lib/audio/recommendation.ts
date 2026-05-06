import { applyPreset, defaultParams } from "./presets";
import type { AudioAnalysis, DegradationSummary, ProcessingParams } from "./types";

export type InputFormat = "WAV" | "MP3";

export type RecommendationProfile =
  | "temporal_decay"
  | "global_vocal_harshness"
  | "global_metallic_hiss"
  | "global_grain"
  | "mud_cleanup"
  | "wav_air_recovery"
  | "natural";

export type AutoRecommendation = {
  presetId: string;
  profile: RecommendationProfile;
  confidence: number;
  reason: string;
};

export function recommendedPresetId(preset: DegradationSummary["recommendedPreset"]): string {
  if (preset === "gentle") return "decay-gentle";
  if (preset === "strong") return "decay-strong";
  if (preset === "balanced") return "decay-balanced";
  return "natural";
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Math.round(value);
}

export function recommendForAnalysis(analysis: AudioAnalysis, format: InputFormat = "WAV"): AutoRecommendation {
  const { scores, degradationSummary } = analysis;
  const first = degradationSummary.firstThirdScore;
  const middle = degradationSummary.middleThirdScore;
  const last = degradationSummary.lastThirdScore;
  const maxScore = degradationSummary.maxScore;
  const average = degradationSummary.averageDegradationScore;
  const maxStartRatio = analysis.duration > 0 ? degradationSummary.maxScoreStartSec / analysis.duration : 0;
  const temporalRise = Math.max(middle, last) - first;
  const localizedSpike = maxScore - Math.max(average, first);
  const maxInMusicalBody = maxStartRatio >= 0.25 && maxStartRatio <= 0.92;
  const lateOrMiddleRise = middle > first + 10 || last > first + 12;
  const temporalCandidate =
    degradationSummary.recommendedPreset !== "none" &&
    maxInMusicalBody &&
    lateOrMiddleRise &&
    temporalRise >= 16 &&
    (localizedSpike >= 14 || maxScore >= 68);

  const harshVocal = Math.max(scores.harshness, scores.sibilance);
  const glassNoise = Math.max(scores.hiss, scores.metallic);
  const mp3Loss = format === "MP3" ? 0 : scores.highFrequencyLoss;
  const highLoss = format === "WAV" ? analysis.highFrequencyLossScore : 0;
  const globalTexture = Math.max(glassNoise, harshVocal * 0.75);

  if (temporalCandidate) {
    const presetId =
      maxScore >= 86 && Math.max(middle, last) >= 68 && glassNoise >= 45 ? "decay-strong" :
      maxScore >= 58 || temporalRise >= 22 ? "decay-balanced" :
      "decay-gentle";
    return {
      presetId,
      profile: "temporal_decay",
      confidence: clamp01((temporalRise + localizedSpike) / 80),
      reason: "Localized degradation rises from the mid-late to later song sections, so temporal repair is prioritized."
    };
  }

  if (harshVocal >= 50 && harshVocal >= glassNoise * 1.08) {
    return {
      presetId: "de-harsh-vocal",
      profile: "global_vocal_harshness",
      confidence: clamp01(harshVocal / 100),
      reason: "Harshness and sibilance stand out across the track, so painful vocal-region bands are prioritized."
    };
  }

  if (glassNoise >= 46 && glassNoise >= harshVocal * 0.9) {
    return {
      presetId: "ai-glass",
      profile: "global_metallic_hiss",
      confidence: clamp01(glassNoise / 100),
      reason: "Metallic tone and high-end fizz stand out across the track, so high-frequency artifact control is prioritized."
    };
  }

  if (globalTexture >= 34 && Math.abs(harshVocal - glassNoise) < 22) {
    return {
      presetId: "grain-smoother",
      profile: "global_grain",
      confidence: clamp01(globalTexture / 100),
      reason: "Texture is rough across the whole track, so smoothing the grain is prioritized."
    };
  }

  if (false && highLoss >= 45 && glassNoise < 38 && harshVocal < 45) {
    return {
      presetId: "natural",
      profile: "wav_air_recovery",
      confidence: clamp01(highLoss / 100),
      reason: "High-frequency loss was detected in the WAV, so Natural Clean is combined with subtle High Air Recovery."
    };
  }

  if (scores.mud >= 58 && harshVocal < 42 && glassNoise < 42 && mp3Loss < 60) {
    return {
      presetId: "natural",
      profile: "mud_cleanup",
      confidence: clamp01(scores.mud / 100),
      reason: "Low-mid mud is the main issue, so light source-preserving cleanup is selected."
    };
  }

  return {
    presetId: "natural",
    profile: "natural",
    confidence: 0.35,
    reason: "Strong localized decay or global harshness is not dominant, so light source-preserving repair is selected."
  };
}

export function buildRecommendedParams(
  analysis: AudioAnalysis,
  format: InputFormat = "WAV",
  base: ProcessingParams = defaultParams
): { recommendation: AutoRecommendation; params: ProcessingParams; notes: string[] } {
  const recommendation = recommendForAnalysis(analysis, format);
  const { scores, degradationSummary } = analysis;
  const first = degradationSummary.firstThirdScore;
  const middle = degradationSummary.middleThirdScore;
  const last = degradationSummary.lastThirdScore;
  const maxScore = degradationSummary.maxScore;
  const temporalSeverity = Math.max(maxScore, last, middle);
  const temporalRise = Math.max(middle, last) - first;
  const harshVocal = Math.max(scores.harshness, scores.sibilance);
  const glassNoise = Math.max(scores.hiss, scores.metallic);
  const artifactRisk = Math.max(harshVocal, glassNoise, temporalSeverity);
  const overallRepair = clamp(24 + artifactRisk * 0.42 + Math.max(0, temporalRise) * 0.18, 22, 72);
  const headroom =
    artifactRisk >= 100 || maxScore >= 88 ? -2.5 :
    artifactRisk >= 72 || maxScore >= 68 ? -2 :
    artifactRisk >= 45 ? -1.5 :
    -1;

  let params: ProcessingParams = {
    ...applyPreset(base, recommendation.presetId),
    repairAmount: round(overallRepair),
    harshnessReduction: round(clamp(18 + scores.harshness * 0.45 + Math.max(0, temporalRise) * 0.12, 12, 62)),
    sibilanceReduction: round(clamp(18 + scores.sibilance * 0.5 + Math.max(0, temporalRise) * 0.14, 12, 66)),
    metallicReduction: round(clamp(16 + scores.metallic * 0.55 + maxScore * 0.12, 10, 68)),
    hissReduction: round(clamp(18 + scores.hiss * 0.62 + maxScore * 0.16, 12, 72)),
    mudReduction: round(clamp(8 + scores.mud * 0.22, 6, 32)),
    toneLeveling: round(clamp(artifactRisk * 0.12, 0, 18)),
    stereoWidthReduction: round(clamp(18 + maxScore * 0.45 + Math.max(0, temporalRise) * 0.18, 12, 72)),
    layeredSpectralRepair: round(clamp(24 + maxScore * 0.48, 20, 76)),
    highTextureRepair: round(clamp(18 + glassNoise * 0.45 + maxScore * 0.16, 14, 68)),
    artifactHeadroomDb: headroom,
    outputGainDb: artifactRisk >= 72 ? 1.5 : artifactRisk >= 45 ? 1 : 0.5,
    truePeakCeilingDb: artifactRisk >= 72 ? -1.2 : -1,
    masteringEnabled: false,
    autoLoudness: false,
    playbackLoudnessMatch: true,
    preserveBrightness: true,
    safeMode: recommendation.presetId !== "decay-strong" && recommendation.presetId !== "strong-repair",
    longSongDecayFix: recommendation.presetId.startsWith("decay-") || recommendation.profile === "temporal_decay",
    highAirRecover: 0,
    bassEnhance: 0,
    vocalForward: 0,
    vocalBody: 0,
    lowWeight: 0,
    air: 0,
    presence: 0,
    mixWarmth: 0
  };

  const notes: string[] = ["Slider values were adapted from the analysis."];
  const sourceHasRoom = analysis.peakDb <= -3 && analysis.rmsDb <= -16;
  const needsBodyBack = sourceHasRoom && artifactRisk >= 45 && scores.mud < 72;
  if (needsBodyBack) {
    params = {
      ...params,
      vocalBody: round(clamp(6 + Math.max(0, 62 - scores.mud) * 0.12, 6, 16)),
      mixWarmth: round(clamp(4 + Math.max(0, 58 - scores.mud) * 0.1, 4, 12)),
      lowWeight: round(clamp(3 + Math.max(0, 50 - scores.mud) * 0.08, 2, 8))
    };
    notes.push("A small body recovery was added to avoid an overly thin result.");
  }

  if (format === "WAV" && analysis.highFrequencyLossScore >= 45 && glassNoise < 42) {
    params = {
      ...params,
      highAirRecover: round(clamp((analysis.highFrequencyLossScore - 35) * 0.28, 4, 12))
    };
    notes.push("Subtle high-air recovery was added for detected WAV high-frequency loss.");
  }

  if (format === "MP3") {
    params = { ...params, highAirRecover: 0, air: 0 };
    notes.push("MP3 high-frequency loss is not aggressively boosted.");
  }

  return { recommendation, params, notes };
}
