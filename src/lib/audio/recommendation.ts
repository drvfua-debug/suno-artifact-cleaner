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
      reason: "曲中の中盤後半から後半にかけて、局所的な劣化上昇が見えるため時間変化補正を優先します。"
    };
  }

  if (harshVocal >= 50 && harshVocal >= glassNoise * 1.08) {
    return {
      presetId: "de-harsh-vocal",
      profile: "global_vocal_harshness",
      confidence: clamp01(harshVocal / 100),
      reason: "曲全体で刺さりや歯擦音が目立つため、ボーカル周辺の痛い帯域を優先して整えます。"
    };
  }

  if (glassNoise >= 46 && glassNoise >= harshVocal * 0.9) {
    return {
      presetId: "ai-glass",
      profile: "global_metallic_hiss",
      confidence: clamp01(glassNoise / 100),
      reason: "曲全体で金属感や高域チリつきが目立つため、高域アーティファクト抑制を優先します。"
    };
  }

  if (globalTexture >= 34 && Math.abs(harshVocal - glassNoise) < 22) {
    return {
      presetId: "grain-smoother",
      profile: "global_grain",
      confidence: clamp01(globalTexture / 100),
      reason: "特定区間だけでなく全体に粒の荒さがあるため、質感をなだらかに揃える補正を優先します。"
    };
  }

  if (false && highLoss >= 45 && glassNoise < 38 && harshVocal < 45) {
    return {
      presetId: "natural",
      profile: "wav_air_recovery",
      confidence: clamp01(highLoss / 100),
      reason: "WAV音源の高域欠落を検出したため、Natural Cleanに薄い高域エア補完を組み合わせます。"
    };
  }

  if (scores.mud >= 58 && harshVocal < 42 && glassNoise < 42 && mp3Loss < 60) {
    return {
      presetId: "natural",
      profile: "mud_cleanup",
      confidence: clamp01(scores.mud / 100),
      reason: "中低域のこもりが主な問題のため、原音を保ちながら軽く整理します。"
    };
  }

  return {
    presetId: "natural",
    profile: "natural",
    confidence: 0.35,
    reason: "強い局所劣化や全体的な刺さりが支配的ではないため、原音維持の軽い補正を選びます。"
  };
}
