import type { Preset, ProcessingParams } from "./types";

export const defaultParams: ProcessingParams = {
  repairAmount: 35,
  harshnessReduction: 25,
  sibilanceReduction: 25,
  metallicReduction: 25,
  hissReduction: 20,
  mudReduction: 15,
  toneLeveling: 0,
  bassEnhance: 0,
  vocalForward: 35,
  stereoWidthReduction: 35,
  layeredSpectralRepair: 45,
  highTextureRepair: 30,
  highAirRecover: 0,
  artifactHeadroomDb: -1.5,
  outputGainDb: 0,
  truePeakCeilingDb: -1,
  masteringEnabled: false,
  targetLufs: -14,
  autoLoudness: false,
  playbackLoudnessMatch: true,
  lowWeight: 0,
  lowMidCleanup: 0,
  presence: 0,
  air: 0,
  vocalBody: 0,
  mixWarmth: 0,
  bassMonoHz: 90,
  masterStereoWidth: 0,
  lookaheadLimiter: true,
  preserveBrightness: true,
  safeMode: true,
  longSongDecayFix: true
};

export const masteringPresets: Preset[] = [
  {
    id: "master-gentle",
    name: "Gentle Master",
    description: "原音を大きく変えず、軽い整音と安全なピーク制御だけを行います。",
    params: { masteringEnabled: true, autoLoudness: false, targetLufs: -14, lowWeight: 6, lowMidCleanup: 10, presence: 4, air: 5, vocalBody: 12, mixWarmth: 10, bassMonoHz: 80, masterStereoWidth: 0, truePeakCeilingDb: -1, lookaheadLimiter: true, playbackLoudnessMatch: true }
  },
  {
    id: "master-streaming",
    name: "Streaming Safe",
    description: "配信向けの安全設定です。-14 LUFS目標、-1.0 dBTP上限で自然に揃えます。",
    params: { masteringEnabled: true, autoLoudness: true, targetLufs: -14, lowWeight: 8, lowMidCleanup: 14, presence: 5, air: 6, vocalBody: 10, mixWarmth: 12, bassMonoHz: 90, masterStereoWidth: 2, truePeakCeilingDb: -1, lookaheadLimiter: true, playbackLoudnessMatch: true }
  },
  {
    id: "master-vocal-pop",
    name: "Vocal Pop Master",
    description: "ボーカルを前に置き、低域とAirを少し整えるポップス向けです。",
    params: { masteringEnabled: true, autoLoudness: true, targetLufs: -12, lowWeight: 8, lowMidCleanup: 16, presence: 7, air: 12, vocalBody: 16, mixWarmth: 10, bassMonoHz: 85, masterStereoWidth: 1, vocalForward: 54, truePeakCeilingDb: -1.1, lookaheadLimiter: true, playbackLoudnessMatch: true }
  },
  {
    id: "master-loud",
    name: "Loud Master",
    description: "音圧を強めに出します。潰れやすいのでDifference Monitorと音量マッチA/Bで確認してください。",
    warning: "強いマスターです。音の余白や明るさが変わる場合があります。",
    params: { masteringEnabled: true, autoLoudness: true, targetLufs: -10, lowWeight: 8, lowMidCleanup: 18, presence: 6, air: 8, vocalBody: 12, mixWarmth: 14, bassMonoHz: 100, masterStereoWidth: 0, truePeakCeilingDb: -1, lookaheadLimiter: true, playbackLoudnessMatch: true, toneLeveling: 14 }
  }
];

export const presets: Preset[] = [
  {
    id: "natural",
    name: "Natural Clean",
    description: "原音維持を優先し、刺さりと高域ノイズを軽く整理します。",
    params: { repairAmount: 25, harshnessReduction: 22, sibilanceReduction: 18, metallicReduction: 18, hissReduction: 15, mudReduction: 16, toneLeveling: 0, bassEnhance: 0, vocalForward: 30, stereoWidthReduction: 20, layeredSpectralRepair: 25, highTextureRepair: 18, highAirRecover: 0, safeMode: true }
  },
  {
    id: "de-harsh-vocal",
    name: "De-Harsh Vocal",
    description: "2.5kHz-8.5kHzを中心に、ボーカルの刺さりと歯擦音を抑えます。",
    params: { repairAmount: 48, harshnessReduction: 55, sibilanceReduction: 55, metallicReduction: 25, hissReduction: 20, mudReduction: 12, toneLeveling: 8, bassEnhance: 0, vocalForward: 55, stereoWidthReduction: 30, layeredSpectralRepair: 35, highTextureRepair: 22, highAirRecover: 0, safeMode: true }
  },
  {
    id: "vocal-front-clean",
    name: "Vocal Front Clean",
    description: "ボーカルの音像を前に出し、後半のザラつきと広がりすぎを軽く整えます。",
    params: { repairAmount: 42, harshnessReduction: 32, sibilanceReduction: 36, metallicReduction: 24, hissReduction: 45, mudReduction: 28, toneLeveling: 12, bassEnhance: 0, vocalForward: 62, stereoWidthReduction: 72, layeredSpectralRepair: 78, highTextureRepair: 46, highAirRecover: 3, preserveBrightness: true, safeMode: true, longSongDecayFix: true }
  },
  {
    id: "late-wide-noise-focus",
    name: "Late Wide Noise Focus",
    description: "後半だけ広がる高域のザラつきや音場ノイズをSide中心に抑え、前半の抜けは残します。",
    params: { repairAmount: 46, harshnessReduction: 28, sibilanceReduction: 38, metallicReduction: 58, hissReduction: 62, mudReduction: 14, toneLeveling: 0, bassEnhance: 0, vocalForward: 42, stereoWidthReduction: 86, layeredSpectralRepair: 86, highTextureRepair: 62, highAirRecover: 0, preserveBrightness: true, safeMode: true, longSongDecayFix: true }
  },
  {
    id: "vocal-forward-polish",
    name: "Vocal Forward Polish",
    description: "ボーカルの芯を前に出しつつ、サ行と刺さりを軽く整えるミックス仕上げ向けです。",
    params: { repairAmount: 38, harshnessReduction: 35, sibilanceReduction: 42, metallicReduction: 22, hissReduction: 22, mudReduction: 18, toneLeveling: 10, bassEnhance: 0, vocalForward: 78, stereoWidthReduction: 34, layeredSpectralRepair: 34, highTextureRepair: 24, highAirRecover: 4, preserveBrightness: true, safeMode: true, longSongDecayFix: true }
  },
  {
    id: "grain-smoother",
    name: "Grain Smoother",
    description: "音のツブを少し揃え、チリついた高域だけをなだらかに抑える安全寄りの補正です。",
    params: { repairAmount: 44, harshnessReduction: 32, sibilanceReduction: 34, metallicReduction: 42, hissReduction: 40, mudReduction: 12, toneLeveling: 32, bassEnhance: 0, vocalForward: 44, stereoWidthReduction: 40, layeredSpectralRepair: 48, highTextureRepair: 50, highAirRecover: 0, preserveBrightness: true, safeMode: true, longSongDecayFix: true }
  },
  {
    id: "safe-low-end-weight",
    name: "Safe Low-End Weight",
    description: "元音源に無い中低域ノイズを増やさない範囲で、低域の支えをほんの少し足します。",
    params: { repairAmount: 24, harshnessReduction: 18, sibilanceReduction: 18, metallicReduction: 18, hissReduction: 16, mudReduction: 24, toneLeveling: 8, bassEnhance: 18, vocalForward: 34, stereoWidthReduction: 18, layeredSpectralRepair: 18, highTextureRepair: 12, highAirRecover: 0, preserveBrightness: true, safeMode: true, longSongDecayFix: true }
  },
  {
    id: "final-chorus-rescue",
    name: "Final Chorus Rescue",
    description: "ラストサビで白く濁る、刺さる、音像が横に散るケースを重点的に抑えます。",
    warning: "強めの時間変化補正です。Difference Monitorで削りすぎを確認してください。",
    params: { repairAmount: 70, harshnessReduction: 66, sibilanceReduction: 70, metallicReduction: 78, hissReduction: 74, mudReduction: 24, toneLeveling: 10, bassEnhance: 0, vocalForward: 54, stereoWidthReduction: 88, layeredSpectralRepair: 90, highTextureRepair: 72, highAirRecover: 0, truePeakCeilingDb: -1.6, preserveBrightness: true, safeMode: true, longSongDecayFix: true }
  },
  {
    id: "ai-glass",
    name: "AI Glass Reducer",
    description: "8.5kHz-18kHzの金属感やチリつきを必要な分だけ抑えます。",
    params: { repairAmount: 55, harshnessReduction: 25, sibilanceReduction: 35, metallicReduction: 65, hissReduction: 50, mudReduction: 8, toneLeveling: 0, bassEnhance: 0, vocalForward: 35, stereoWidthReduction: 48, layeredSpectralRepair: 62, highTextureRepair: 58, highAirRecover: 0, preserveBrightness: true, safeMode: true }
  },
  {
    id: "strong-repair",
    name: "Strong Repair",
    description: "刺さり、歯擦音、金属感、ヒスを強めに抑制します。",
    warning: "音が丸くなる可能性あり",
    params: { repairAmount: 82, harshnessReduction: 78, sibilanceReduction: 75, metallicReduction: 82, hissReduction: 72, mudReduction: 36, toneLeveling: 10, bassEnhance: 0, vocalForward: 40, stereoWidthReduction: 70, layeredSpectralRepair: 80, highTextureRepair: 76, highAirRecover: 0, truePeakCeilingDb: -1.5, safeMode: false }
  },
  {
    id: "decay-gentle",
    name: "Long Song Decay Fix - Gentle",
    description: "後半だけ少し荒れる長尺曲向け。長尺劣化補正を軽く適用します。",
    params: { repairAmount: 35, harshnessReduction: 28, sibilanceReduction: 28, metallicReduction: 35, hissReduction: 30, toneLeveling: 0, bassEnhance: 0, vocalForward: 35, stereoWidthReduction: 45, layeredSpectralRepair: 48, highTextureRepair: 34, highAirRecover: 2, safeMode: true, longSongDecayFix: true }
  },
  {
    id: "decay-balanced",
    name: "Long Song Decay Fix - Balanced",
    description: "後半のザラつき、サ行、金属感が明確に増える音源向け。",
    params: { repairAmount: 54, harshnessReduction: 50, sibilanceReduction: 54, metallicReduction: 58, hissReduction: 52, toneLeveling: 6, bassEnhance: 0, vocalForward: 42, stereoWidthReduction: 54, layeredSpectralRepair: 58, highTextureRepair: 46, highAirRecover: 4, safeMode: true, longSongDecayFix: true }
  },
  {
    id: "decay-strong",
    name: "Long Song Decay Fix - Strong",
    description: "ラストサビやOutroで明らかに音質が崩れる音源向け。",
    warning: "強補正では音の明るさや空気感が失われる可能性があります",
    params: { repairAmount: 82, harshnessReduction: 78, sibilanceReduction: 82, metallicReduction: 88, hissReduction: 78, toneLeveling: 12, bassEnhance: 0, vocalForward: 50, stereoWidthReduction: 78, layeredSpectralRepair: 88, highTextureRepair: 82, highAirRecover: 0, truePeakCeilingDb: -1.8, safeMode: false, longSongDecayFix: true }
  }
];

export function applyPreset(params: ProcessingParams, presetId: string): ProcessingParams {
  const preset = presets.find((item) => item.id === presetId);
  return { ...params, ...(preset?.params ?? {}) };
}

export function applyMasteringPreset(params: ProcessingParams, presetId: string): ProcessingParams {
  const preset = masteringPresets.find((item) => item.id === presetId);
  return { ...params, ...(preset?.params ?? {}) };
}
