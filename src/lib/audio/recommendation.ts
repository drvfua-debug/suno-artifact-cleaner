import type { AudioAnalysis, DegradationSummary } from "./types";

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
