export type BandKey =
  | "subRumble"
  | "lowMud"
  | "boxiness"
  | "presenceHarshness"
  | "sibilance"
  | "metallic"
  | "hiss"
  | "ultrasonic";

export type ProblemScores = {
  harshness: number;
  sibilance: number;
  metallic: number;
  hiss: number;
  mud: number;
  clipping: number;
  truePeak: number;
  degradation: number;
  highFrequencyLoss: number;
};

export type ScoreSeverityDetail = {
  score: number;
  raw: number;
  overLimit: number;
  saturated: boolean;
};

export type ScoreSeverity = {
  harshness: ScoreSeverityDetail;
  sibilance: ScoreSeverityDetail;
  metallic: ScoreSeverityDetail;
  hiss: ScoreSeverityDetail;
  mud: ScoreSeverityDetail;
  clipping: ScoreSeverityDetail;
  truePeak: ScoreSeverityDetail;
  degradation: ScoreSeverityDetail;
  highFrequencyLoss: ScoreSeverityDetail;
};

export type AudioBufferData = {
  sampleRate: number;
  channels: Float32Array[];
};

export type BandAnalysis = {
  key: BandKey;
  label: string;
  fromHz: number;
  toHz: number;
  averageEnergy: number;
  peakEnergy: number;
  contrast: number;
  score: number;
};

export type TimelineMetric = {
  startSec: number;
  endSec: number;
  peakDb: number;
  rmsDb: number;
  crestFactor: number;
  estimatedLufs: number;
  clippingCount: number;
  spectralCentroid: number;
  spectralFlatness: number;
  highFrequencyRatio: number;
  harshnessEnergy: number;
  sibilanceEnergy: number;
  metallicEnergy: number;
  hissEnergy: number;
  mudEnergy: number;
  stereoWidth: number;
  transientDensity: number;
  dynamicRange: number;
  degradationScore: number;
  degradationRawScore?: number;
  recommendedRepairAmount: number;
};

export type ReferenceProfile = {
  startSec: number;
  endSec: number;
  avgRmsDb: number;
  avgSpectralCentroid: number;
  avgSpectralFlatness: number;
  avgHighFrequencyRatio: number;
  avgHarshnessEnergy: number;
  avgSibilanceEnergy: number;
  avgMetallicEnergy: number;
  avgHissEnergy: number;
  avgMudEnergy: number;
  avgStereoWidth: number;
  avgDynamicRange: number;
};

export type DegradationSummary = {
  averageDegradationScore: number;
  firstThirdScore: number;
  middleThirdScore: number;
  lastThirdScore: number;
  maxScore: number;
  averageRawDegradationScore?: number;
  maxRawScore?: number;
  maxRawScoreStartSec?: number;
  maxRawScoreEndSec?: number;
  maxScoreStartSec: number;
  maxScoreEndSec: number;
  primaryCause:
    | "harshness"
    | "sibilance"
    | "metallic"
    | "hiss"
    | "clipping"
    | "dynamic_range_loss"
    | "stereo_instability"
    | "unknown";
  recommendedPreset: "gentle" | "balanced" | "strong" | "none";
};

export type TemporalCurvePoint = {
  startSec: number;
  endSec: number;
  harshnessReduction: number;
  sibilanceReduction: number;
  metallicReduction: number;
  hissReduction: number;
  mudReduction: number;
  stereoWidthReduction: number;
  outputGain: number;
  limiterAmount: number;
};

export type AudioAnalysis = {
  duration: number;
  sampleRate: number;
  channels: number;
  peakDb: number;
  rmsDb: number;
  crestFactor: number;
  dcOffset: number;
  clippingCount: number;
  estimatedTruePeakDb: number;
  estimatedLufs: number;
  shortTermLoudness: number[];
  spectralCentroid: number;
  spectralFlatness: number;
  highFrequencyRatio: number;
  highRolloffHz: number;
  highFrequencyLossScore: number;
  bands: BandAnalysis[];
  scores: ProblemScores;
  scoreSeverity: ScoreSeverity;
  timelineMetrics: TimelineMetric[];
  referenceProfile: ReferenceProfile;
  degradationSummary: DegradationSummary;
  temporalProcessingCurve: TemporalCurvePoint[];
  warnings: string[];
};

export type ProcessingParams = {
  repairAmount: number;
  harshnessReduction: number;
  sibilanceReduction: number;
  metallicReduction: number;
  hissReduction: number;
  mudReduction: number;
  toneLeveling: number;
  bassEnhance: number;
  vocalForward: number;
  stereoWidthReduction: number;
  layeredSpectralRepair: number;
  highTextureRepair: number;
  highAirRecover: number;
  artifactHeadroomDb: number;
  outputGainDb: number;
  truePeakCeilingDb: number;
  masteringEnabled: boolean;
  targetLufs: number;
  autoLoudness: boolean;
  playbackLoudnessMatch: boolean;
  lowWeight: number;
  lowMidCleanup: number;
  presence: number;
  air: number;
  vocalBody: number;
  mixWarmth: number;
  bassMonoHz: number;
  masterStereoWidth: number;
  lookaheadLimiter: boolean;
  preserveBrightness: boolean;
  safeMode: boolean;
  longSongDecayFix: boolean;
  referenceStartSec?: number;
  referenceEndSec?: number;
};

export type Preset = {
  id: string;
  name: string;
  description: string;
  warning?: string;
  params: Partial<ProcessingParams>;
};

export type ProcessingResult = {
  audio: AudioBufferData;
  chain: string[];
  peakDb: number;
  temporalProcessingCurve: TemporalCurvePoint[];
};
