import { ampToDb, clamp, dbToAmp, estimateLufs, mean, peak } from "./metrics";
import { makeTemporalCurve } from "./analysis";
import type { AudioAnalysis, AudioBufferData, ProcessingParams, ProcessingResult, TemporalCurvePoint } from "./types";

type Biquad = { b0: number; b1: number; b2: number; a1: number; a2: number };

function peaking(sampleRate: number, freq: number, q: number, gainDb: number): Biquad {
  const a = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * freq) / sampleRate;
  const alpha = Math.sin(w0) / (2 * q);
  const cos = Math.cos(w0);
  const b0 = 1 + alpha * a;
  const b1 = -2 * cos;
  const b2 = 1 - alpha * a;
  const a0 = 1 + alpha / a;
  const a1 = -2 * cos;
  const a2 = 1 - alpha / a;
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

function highpass(sampleRate: number, freq: number, q = 0.707): Biquad {
  const w0 = (2 * Math.PI * freq) / sampleRate;
  const alpha = Math.sin(w0) / (2 * q);
  const cos = Math.cos(w0);
  const b0 = (1 + cos) / 2;
  const b1 = -(1 + cos);
  const b2 = (1 + cos) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

function runBiquad(input: Float32Array, coeff: Biquad): Float32Array {
  const out = new Float32Array(input.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x = input[i];
    const y = coeff.b0 * x + coeff.b1 * x1 + coeff.b2 * x2 - coeff.a1 * y1 - coeff.a2 * y2;
    out[i] = y;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
  }
  return out;
}

export function removeDcOffset(samples: Float32Array): Float32Array {
  const offset = mean(samples);
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] - offset;
  return out;
}

export function applyHighPass(samples: Float32Array, sampleRate: number, freq = 20): Float32Array {
  return runBiquad(samples, highpass(sampleRate, freq));
}

function maxCut(params: ProcessingParams): number {
  if (!params.safeMode) return params.repairAmount > 80 ? 9 : 6;
  return params.repairAmount > 60 ? 5 : 3;
}

function gainFor(amount: number, reduction: number, capDb: number): number {
  return -capDb * (clamp(amount, 0, 100) / 100) * (clamp(reduction, 0, 100) / 100);
}

function curveAt(curve: TemporalCurvePoint[], sec: number): TemporalCurvePoint | undefined {
  return curve.find((point) => sec >= point.startSec && sec < point.endSec) ?? curve[curve.length - 1];
}

function fft(real: Float32Array, imag: Float32Array, inverse = false): void {
  const n = real.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = real[i]; real[i] = real[j]; real[j] = tr;
      const ti = imag[i]; imag[i] = imag[j]; imag[j] = ti;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const angle = (inverse ? 2 : -2) * Math.PI / len;
    const wLenR = Math.cos(angle);
    const wLenI = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let wr = 1;
      let wi = 0;
      for (let j = 0; j < len / 2; j++) {
        const uR = real[i + j];
        const uI = imag[i + j];
        const vR = real[i + j + len / 2] * wr - imag[i + j + len / 2] * wi;
        const vI = real[i + j + len / 2] * wi + imag[i + j + len / 2] * wr;
        real[i + j] = uR + vR;
        imag[i + j] = uI + vI;
        real[i + j + len / 2] = uR - vR;
        imag[i + j + len / 2] = uI - vI;
        const nextWr = wr * wLenR - wi * wLenI;
        wi = wr * wLenI + wi * wLenR;
        wr = nextWr;
      }
    }
  }

  if (inverse) {
    for (let i = 0; i < n; i++) {
      real[i] /= n;
      imag[i] /= n;
    }
  }
}

function applyStaticEq(samples: Float32Array, sampleRate: number, params: ProcessingParams): Float32Array {
  const cap = maxCut(params);
  let out = applyHighPass(removeDcOffset(samples), sampleRate, 20);
  out = runBiquad(out, peaking(sampleRate, 240, 0.9, gainFor(params.repairAmount, params.mudReduction, Math.min(cap, 3.5))));
  out = runBiquad(out, peaking(sampleRate, 3600, 1.2, gainFor(params.repairAmount, params.harshnessReduction, cap)));
  out = runBiquad(out, peaking(sampleRate, 6800, 1.4, gainFor(params.repairAmount, params.sibilanceReduction, cap)));
  out = runBiquad(out, peaking(sampleRate, 10500, 1.0, gainFor(params.repairAmount, params.metallicReduction, params.preserveBrightness ? Math.min(cap, 5) : cap)));
  out = runBiquad(out, peaking(sampleRate, 15500, 0.8, gainFor(params.repairAmount, params.hissReduction, params.preserveBrightness ? Math.min(cap, 4) : cap)));
  return out;
}

function applyTemporalRepair(samples: Float32Array, sampleRate: number, curve: TemporalCurvePoint[], params: ProcessingParams): Float32Array {
  if (!params.longSongDecayFix || !curve.length) return samples;
  const out = new Float32Array(samples);
  const frame = Math.floor(sampleRate * 0.25);
  let currentHarsh = 0, currentSib = 0, currentMetal = 0, currentHiss = 0;
  for (let start = 0; start < out.length; start += frame) {
    const end = Math.min(out.length, start + frame);
    const sec = start / sampleRate;
    const point = curveAt(curve, sec);
    const cap = maxCut(params);
    const targetHarsh = gainFor(point?.harshnessReduction ?? 0, params.harshnessReduction, cap) * 0.45;
    const targetSib = gainFor(point?.sibilanceReduction ?? 0, params.sibilanceReduction, cap) * 0.5;
    const targetMetal = gainFor(point?.metallicReduction ?? 0, params.metallicReduction, cap) * 0.55;
    const targetHiss = gainFor(point?.hissReduction ?? 0, params.hissReduction, cap) * 0.45;
    currentHarsh = currentHarsh * 0.82 + targetHarsh * 0.18;
    currentSib = currentSib * 0.82 + targetSib * 0.18;
    currentMetal = currentMetal * 0.82 + targetMetal * 0.18;
    currentHiss = currentHiss * 0.82 + targetHiss * 0.18;
    const slice = out.subarray(start, end);
    let processed = runBiquad(slice, peaking(sampleRate, 3700, 1.1, currentHarsh));
    processed = runBiquad(processed, peaking(sampleRate, 7000, 1.4, currentSib));
    processed = runBiquad(processed, peaking(sampleRate, 10800, 1.0, currentMetal));
    processed = runBiquad(processed, peaking(sampleRate, 15500, 0.8, currentHiss));
    for (let i = 0; i < processed.length; i++) {
      const fade = i < 128 ? i / 128 : i > processed.length - 128 ? (processed.length - i) / 128 : 1;
      slice[i] = slice[i] * (1 - fade) + processed[i] * fade;
    }
  }
  return out;
}

function applyVocalForward(channels: Float32Array[], sampleRate: number, params: ProcessingParams): Float32Array[] {
  const amount = clamp(params.vocalForward ?? 0, 0, 100) / 100;
  if (amount <= 0) return channels;
  const presenceBoost = amount * (params.safeMode ? 1.4 : 2.1);
  const articulationBoost = amount * (params.safeMode ? 0.65 : 1.0);
  const lowMidCut = -amount * (params.safeMode ? 0.75 : 1.1);
  const sidePresenceCut = -amount * (params.safeMode ? 1.1 : 1.6);

  if (channels.length < 2) {
    return channels.map((channel) => {
      let out = runBiquad(channel, peaking(sampleRate, 420, 0.9, lowMidCut));
      out = runBiquad(out, peaking(sampleRate, 1800, 0.9, presenceBoost * 0.65));
      out = runBiquad(out, peaking(sampleRate, 3100, 1.05, presenceBoost));
      out = runBiquad(out, peaking(sampleRate, 4700, 1.2, articulationBoost));
      return out;
    });
  }

  const length = Math.min(channels[0].length, channels[1].length);
  const mid = new Float32Array(length);
  const side = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    mid[i] = (channels[0][i] + channels[1][i]) * 0.5;
    side[i] = (channels[0][i] - channels[1][i]) * 0.5;
  }

  let focusedMid = runBiquad(mid, peaking(sampleRate, 420, 0.9, lowMidCut));
  focusedMid = runBiquad(focusedMid, peaking(sampleRate, 1700, 0.9, presenceBoost * 0.65));
  focusedMid = runBiquad(focusedMid, peaking(sampleRate, 3000, 1.0, presenceBoost));
  focusedMid = runBiquad(focusedMid, peaking(sampleRate, 4600, 1.25, articulationBoost));

  let cleanedSide = runBiquad(side, peaking(sampleRate, 2600, 0.9, sidePresenceCut));
  cleanedSide = runBiquad(cleanedSide, peaking(sampleRate, 5200, 1.0, sidePresenceCut * 0.5));
  const sideTrim = 1 - amount * (params.safeMode ? 0.04 : 0.07);

  const left = new Float32Array(channels[0]);
  const right = new Float32Array(channels[1]);
  for (let i = 0; i < length; i++) {
    const s = cleanedSide[i] * sideTrim;
    left[i] = focusedMid[i] + s;
    right[i] = focusedMid[i] - s;
  }

  return channels.map((channel, index) => {
    if (index === 0) return left;
    if (index === 1) return right;
    return channel;
  });
}

function applyTemporalStereoWidthRepair(channels: Float32Array[], sampleRate: number, curve: TemporalCurvePoint[], params: ProcessingParams): Float32Array[] {
  const amount = clamp(params.stereoWidthReduction ?? 0, 0, 100) / 100;
  if (channels.length < 2 || amount <= 0 || !curve.length || !params.longSongDecayFix) return channels;

  const length = Math.min(channels[0].length, channels[1].length);
  const left = new Float32Array(channels[0]);
  const right = new Float32Array(channels[1]);
  const frame = Math.floor(sampleRate * 0.25);
  let currentTrim = 0;

  for (let start = 0; start < length; start += frame) {
    const end = Math.min(length, start + frame);
    const sec = start / sampleRate;
    const point = curveAt(curve, sec);
    const repair = clamp(point?.stereoWidthReduction ?? point?.hissReduction ?? 0, 0, 100) / 100;
    const targetTrim = repair * amount * (params.safeMode ? 0.28 : 0.42);
    currentTrim = currentTrim * 0.88 + targetTrim * 0.12;

    const side = new Float32Array(end - start);
    const mid = new Float32Array(end - start);
    for (let i = start, j = 0; i < end; i++, j++) {
      mid[j] = (left[i] + right[i]) * 0.5;
      side[j] = (left[i] - right[i]) * 0.5;
    }

    let cleanedSide = runBiquad(side, peaking(sampleRate, 6500, 0.9, -currentTrim * 3.0));
    cleanedSide = runBiquad(cleanedSide, peaking(sampleRate, 11500, 0.8, -currentTrim * 4.5));
    cleanedSide = runBiquad(cleanedSide, peaking(sampleRate, 15500, 0.7, -currentTrim * 3.5));
    const sideGain = 1 - currentTrim;

    for (let i = start, j = 0; i < end; i++, j++) {
      const edgeFade = Math.min(1, j / 128, (end - start - j) / 128);
      const repairedSide = cleanedSide[j] * sideGain;
      const s = side[j] * (1 - edgeFade) + repairedSide * edgeFade;
      left[i] = mid[j] + s;
      right[i] = mid[j] - s;
    }
  }

  return channels.map((channel, index) => {
    if (index === 0) return left;
    if (index === 1) return right;
    return channel;
  });
}

function applyLayeredSpectralRepair(channels: Float32Array[], sampleRate: number, curve: TemporalCurvePoint[], params: ProcessingParams): Float32Array[] {
  const amount = clamp(params.layeredSpectralRepair ?? 0, 0, 100) / 100;
  if (channels.length < 2 || amount <= 0 || !params.longSongDecayFix || !curve.length) return channels;

  const length = Math.min(channels[0].length, channels[1].length);
  const fftSize = 1024;
  const hop = 512;
  const maxReduction = amount * (params.safeMode ? 0.42 : 0.62);
  const window = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i++) window[i] = Math.sin((Math.PI * (i + 0.5)) / fftSize);

  const sideOut = new Float32Array(length);
  const sideWeight = new Float32Array(length);
  const real = new Float32Array(fftSize);
  const imag = new Float32Array(fftSize);

  for (let start = 0; start < length; start += hop) {
    real.fill(0);
    imag.fill(0);
    for (let i = 0; i < fftSize; i++) {
      const index = start + i;
      if (index < length) {
        const side = (channels[0][index] - channels[1][index]) * 0.5;
        real[i] = side * window[i];
      }
    }

    fft(real, imag, false);

    const sec = start / sampleRate;
    const point = curveAt(curve, sec);
    const temporal = clamp(
      Math.max(point?.stereoWidthReduction ?? 0, point?.hissReduction ?? 0, point?.metallicReduction ?? 0) / 100,
      0,
      1
    );

    if (temporal > 0.02) {
      let highMean = 0;
      let highCount = 0;
      for (let bin = 1; bin < fftSize / 2; bin++) {
        const freq = (bin * sampleRate) / fftSize;
        if (freq >= 6000 && freq <= Math.min(18000, sampleRate / 2)) {
          highMean += Math.hypot(real[bin], imag[bin]);
          highCount++;
        }
      }
      highMean = highCount ? highMean / highCount : 0;

      for (let bin = 1; bin < fftSize / 2; bin++) {
        const freq = (bin * sampleRate) / fftSize;
        if (freq < 6000 || freq > Math.min(18000, sampleRate / 2)) continue;
        const mag = Math.hypot(real[bin], imag[bin]);
        const audibilityGate = highMean > 0 ? clamp((mag / highMean - 0.45) / 1.8, 0.25, 1) : 0.35;
        const bandWeight =
          freq < 8500 ? 0.45 :
          freq < 13000 ? 1 :
          freq < 16000 ? 0.82 :
          0.55;
        const reduction = maxReduction * temporal * bandWeight * audibilityGate;
        const gain = clamp(1 - reduction, 0.28, 1);
        real[bin] *= gain;
        imag[bin] *= gain;
        const mirror = fftSize - bin;
        real[mirror] *= gain;
        imag[mirror] *= gain;
      }
    }

    fft(real, imag, true);

    for (let i = 0; i < fftSize; i++) {
      const index = start + i;
      if (index < length) {
        const w = window[i];
        sideOut[index] += real[i] * w;
        sideWeight[index] += w * w;
      }
    }
  }

  const left = channels[0];
  const right = channels[1];
  for (let i = 0; i < length; i++) {
    const originalLeft = left[i];
    const originalRight = right[i];
    const mid = (originalLeft + originalRight) * 0.5;
    const originalSide = (originalLeft - originalRight) * 0.5;
    const repairedSide = sideWeight[i] > 1e-8 ? sideOut[i] / sideWeight[i] : originalSide;
    left[i] = mid + repairedSide;
    right[i] = mid - repairedSide;
  }

  return channels.map((channel, index) => {
    if (index === 0) return left;
    if (index === 1) return right;
    return channel;
  });
}

function applyHighTextureRepair(channels: Float32Array[], sampleRate: number, params: ProcessingParams, analysis?: AudioAnalysis): Float32Array[] {
  const amount = clamp(params.highTextureRepair ?? 0, 0, 100) / 100;
  const recover = clamp(params.highAirRecover ?? 0, 0, 100) / 100;
  if (amount <= 0 && recover <= 0) return channels;

  const fftSize = 1024;
  const hop = 512;
  const window = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i++) window[i] = Math.sin((Math.PI * (i + 0.5)) / fftSize);
  const maxGate = amount * (params.safeMode ? 0.18 : 0.28);

  const processed = channels.map((channel) => {
    if (amount <= 0) return new Float32Array(channel);
    const out = new Float32Array(channel.length);
    const weight = new Float32Array(channel.length);
    const real = new Float32Array(fftSize);
    const imag = new Float32Array(fftSize);

    for (let start = 0; start < channel.length; start += hop) {
      real.fill(0);
      imag.fill(0);
      for (let i = 0; i < fftSize; i++) {
        const index = start + i;
        if (index < channel.length) real[i] = channel[index] * window[i];
      }
      fft(real, imag, false);

      let highMean = 0;
      let highCount = 0;
      for (let bin = 1; bin < fftSize / 2; bin++) {
        const freq = (bin * sampleRate) / fftSize;
        if (freq >= 9000 && freq <= Math.min(18000, sampleRate / 2)) {
          highMean += Math.hypot(real[bin], imag[bin]);
          highCount++;
        }
      }
      highMean = highCount ? highMean / highCount : 0;

      for (let bin = 1; bin < fftSize / 2; bin++) {
        const freq = (bin * sampleRate) / fftSize;
        if (freq < 9000 || freq > Math.min(18000, sampleRate / 2)) continue;
        const mag = Math.hypot(real[bin], imag[bin]);
        const texture = highMean > 0 ? clamp((mag / highMean - 0.9) / 2.6, 0, 1) : 0;
        const bandWeight = freq < 12000 ? 0.75 : freq < 16000 ? 1 : 0.65;
        const gain = clamp(1 - maxGate * texture * bandWeight, 0.62, 1);
        real[bin] *= gain;
        imag[bin] *= gain;
        const mirror = fftSize - bin;
        real[mirror] *= gain;
        imag[mirror] *= gain;
      }

      fft(real, imag, true);
      for (let i = 0; i < fftSize; i++) {
        const index = start + i;
        if (index < channel.length) {
          const w = window[i];
          out[index] += real[i] * w;
          weight[index] += w * w;
        }
      }
    }

    for (let i = 0; i < out.length; i++) {
      out[i] = weight[i] > 1e-8 ? out[i] / weight[i] : channel[i];
    }
    return out;
  });

  if (recover <= 0) return processed;
  const loss = clamp((analysis?.highFrequencyLossScore ?? 0) / 100, 0, 1);
  const artifactRisk = clamp(Math.max(analysis?.scores.hiss ?? 0, analysis?.scores.metallic ?? 0, analysis?.scores.sibilance ?? 0) / 100, 0, 1);
  const artifactGuard = clamp(1 - artifactRisk * 0.75, 0.28, 1);
  const recoverGain = recover * Math.sqrt(loss) * artifactGuard * (params.safeMode ? 4.4 : 6.2);
  if (recoverGain <= 0.08) return processed;
  return processed.map((channel) => {
    let out = runBiquad(channel, peaking(sampleRate, 11800, 0.85, recoverGain * 0.42));
    out = runBiquad(out, peaking(sampleRate, 15200, 0.72, recoverGain));
    return out;
  });
}

function applyToneLeveling(channels: Float32Array[], params: ProcessingParams): Float32Array[] {
  const amount = clamp(params.toneLeveling ?? 0, 0, 100) / 100;
  if (amount <= 0 || channels.length === 0) return channels;
  const length = channels[0].length;
  const frame = 1024;
  const mono = new Float32Array(length);
  for (const channel of channels) {
    for (let i = 0; i < length; i++) mono[i] += channel[i] / channels.length;
  }
  let globalPower = 0;
  for (let i = 0; i < length; i++) globalPower += mono[i] * mono[i];
  const globalRms = Math.sqrt(globalPower / Math.max(1, length));
  if (globalRms < 1e-5) return channels;

  const target = globalRms * (1 + amount * 0.06);
  const maxBoost = 1 + amount * (params.safeMode ? 0.18 : 0.32);
  const maxCut = 1 - amount * (params.safeMode ? 0.12 : 0.2);
  const gains: number[] = [];
  for (let start = 0; start < length; start += frame) {
    const end = Math.min(length, start + frame);
    let power = 0;
    for (let i = start; i < end; i++) power += mono[i] * mono[i];
    const localRms = Math.sqrt(power / Math.max(1, end - start));
    let gain = 1;
    if (localRms > globalRms * 0.35) {
      const desired = Math.pow(target / Math.max(1e-6, localRms), 0.28 * amount);
      gain = clamp(desired, maxCut, maxBoost);
    }
    gains.push(gain);
  }

  return channels.map((channel) => {
    const out = new Float32Array(channel.length);
    let currentGain = 1;
    for (let start = 0, frameIndex = 0; start < channel.length; start += frame, frameIndex++) {
      const end = Math.min(channel.length, start + frame);
      const targetGain = gains[frameIndex] ?? 1;
      for (let i = start; i < end; i++) {
        currentGain = currentGain * 0.998 + targetGain * 0.002;
        out[i] = channel[i] * currentGain;
      }
    }
    return out;
  });
}

function applyBassEnhance(channels: Float32Array[], sampleRate: number, params: ProcessingParams): Float32Array[] {
  const amount = clamp(params.bassEnhance ?? 0, 0, 100) / 100;
  if (amount <= 0) return channels;
  const lowBoost = amount * (params.safeMode ? 1.1 : 1.8);
  const bodyBoost = amount * (params.safeMode ? 0.45 : 0.75);
  const mudGuard = -amount * (params.safeMode ? 0.9 : 1.4);
  return channels.map((channel) => {
    let out = applyHighPass(channel, sampleRate, 28);
    out = runBiquad(out, peaking(sampleRate, 72, 0.65, lowBoost));
    out = runBiquad(out, peaking(sampleRate, 115, 0.75, bodyBoost));
    out = runBiquad(out, peaking(sampleRate, 240, 0.85, mudGuard));
    out = applyHighPass(out, sampleRate, 24);
    return out;
  });
}

function applyBodyAndWarmth(channels: Float32Array[], sampleRate: number, params: ProcessingParams): Float32Array[] {
  const vocalBody = clamp(params.vocalBody ?? 0, 0, 100) / 100;
  const mixWarmth = clamp(params.mixWarmth ?? 0, 0, 100) / 100;
  if (vocalBody <= 0 && mixWarmth <= 0) return channels;
  const bodyGain = vocalBody * (params.safeMode ? 1.8 : 2.8);
  const chestGain = vocalBody * (params.safeMode ? 1.1 : 1.8);
  const warmthGain = mixWarmth * (params.safeMode ? 1.4 : 2.2);
  const mudGuard = -(vocalBody + mixWarmth) * (params.safeMode ? 0.7 : 1.1);

  if (channels.length < 2) {
    return channels.map((channel) => {
      let out = runBiquad(channel, peaking(sampleRate, 170, 0.9, warmthGain));
      out = runBiquad(out, peaking(sampleRate, 430, 0.95, bodyGain));
      out = runBiquad(out, peaking(sampleRate, 760, 1.0, chestGain));
      out = runBiquad(out, peaking(sampleRate, 285, 0.9, mudGuard));
      return out;
    });
  }

  const length = Math.min(channels[0].length, channels[1].length);
  const mid = new Float32Array(length);
  const side = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    mid[i] = (channels[0][i] + channels[1][i]) * 0.5;
    side[i] = (channels[0][i] - channels[1][i]) * 0.5;
  }

  let fullMid = runBiquad(mid, peaking(sampleRate, 180, 0.9, warmthGain));
  fullMid = runBiquad(fullMid, peaking(sampleRate, 430, 0.95, bodyGain));
  fullMid = runBiquad(fullMid, peaking(sampleRate, 760, 1.0, chestGain));
  fullMid = runBiquad(fullMid, peaking(sampleRate, 285, 0.9, mudGuard));

  const sideWarmth = runBiquad(side, peaking(sampleRate, 220, 0.8, warmthGain * 0.35));
  const left = new Float32Array(channels[0]);
  const right = new Float32Array(channels[1]);
  for (let i = 0; i < length; i++) {
    left[i] = fullMid[i] + sideWarmth[i];
    right[i] = fullMid[i] - sideWarmth[i];
  }
  return channels.map((channel, index) => index === 0 ? left : index === 1 ? right : channel);
}

function estimateBufferLufs(channels: Float32Array[]): number {
  if (!channels.length) return -Infinity;
  const length = channels[0].length;
  const mono = new Float32Array(length);
  for (const channel of channels) {
    for (let i = 0; i < length; i++) mono[i] += (channel[i] ?? 0) / channels.length;
  }
  return estimateLufs(mono);
}

function applyMasterEq(channels: Float32Array[], sampleRate: number, params: ProcessingParams): Float32Array[] {
  if (!params.masteringEnabled) return channels;
  const low = clamp(params.lowWeight ?? 0, -100, 100) / 100;
  const lowMid = clamp(params.lowMidCleanup ?? 0, 0, 100) / 100;
  const presence = clamp(params.presence ?? 0, -100, 100) / 100;
  const air = clamp(params.air ?? 0, -100, 100) / 100;
  if (low === 0 && lowMid === 0 && presence === 0 && air === 0) return channels;
  const lowGain = low * (params.safeMode ? 1.4 : 2.2);
  const lowMidGain = -lowMid * (params.safeMode ? 1.8 : 2.8);
  const presenceGain = presence * (params.safeMode ? 1.2 : 2.0);
  const airGain = air * (params.safeMode ? 1.1 : 1.8);
  return channels.map((channel) => {
    let out = runBiquad(channel, peaking(sampleRate, 90, 0.7, lowGain));
    out = runBiquad(out, peaking(sampleRate, 260, 0.9, lowMidGain));
    out = runBiquad(out, peaking(sampleRate, 3200, 1.0, presenceGain));
    out = runBiquad(out, peaking(sampleRate, 11500, 0.8, airGain));
    return out;
  });
}

function applyBassMono(channels: Float32Array[], sampleRate: number, params: ProcessingParams): Float32Array[] {
  if (!params.masteringEnabled) return channels;
  const monoHz = clamp(params.bassMonoHz ?? 0, 0, 180);
  if (channels.length < 2 || monoHz <= 0) return channels;
  const length = Math.min(channels[0].length, channels[1].length);
  const left = new Float32Array(channels[0]);
  const right = new Float32Array(channels[1]);
  const side = new Float32Array(length);
  const mid = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    mid[i] = (left[i] + right[i]) * 0.5;
    side[i] = (left[i] - right[i]) * 0.5;
  }
  let cleanedSide = runBiquad(side, peaking(sampleRate, Math.max(45, monoHz * 0.65), 0.75, -18));
  cleanedSide = runBiquad(cleanedSide, peaking(sampleRate, monoHz, 0.8, -10));
  for (let i = 0; i < length; i++) {
    left[i] = mid[i] + cleanedSide[i];
    right[i] = mid[i] - cleanedSide[i];
  }
  return channels.map((channel, index) => index === 0 ? left : index === 1 ? right : channel);
}

function applyMasterStereoWidth(channels: Float32Array[], params: ProcessingParams): Float32Array[] {
  if (!params.masteringEnabled) return channels;
  const amount = clamp(params.masterStereoWidth ?? 0, -100, 100) / 100;
  if (channels.length < 2 || amount === 0) return channels;
  const width = clamp(1 + amount * 0.22, 0.78, 1.22);
  const length = Math.min(channels[0].length, channels[1].length);
  const left = new Float32Array(channels[0]);
  const right = new Float32Array(channels[1]);
  for (let i = 0; i < length; i++) {
    const mid = (left[i] + right[i]) * 0.5;
    const side = (left[i] - right[i]) * 0.5 * width;
    left[i] = mid + side;
    right[i] = mid - side;
  }
  return channels.map((channel, index) => index === 0 ? left : index === 1 ? right : channel);
}

function applyAutoLoudness(channels: Float32Array[], params: ProcessingParams): Float32Array[] {
  if (!params.masteringEnabled || !params.autoLoudness) return channels;
  const current = estimateBufferLufs(channels);
  if (!Number.isFinite(current)) return channels;
  const target = clamp(params.targetLufs ?? -14, -18, -8);
  const gainDb = clamp(target - current, -8, params.safeMode ? 5 : 8);
  const gain = dbToAmp(gainDb);
  return channels.map((channel) => {
    const out = new Float32Array(channel.length);
    for (let i = 0; i < channel.length; i++) out[i] = channel[i] * gain;
    return out;
  });
}

export function simpleLimiter(samples: Float32Array, ceilingDb = -1): Float32Array {
  const ceiling = dbToAmp(Math.min(ceilingDb, -0.01));
  const out = new Float32Array(samples.length);
  let gain = 1;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    const over = Math.abs(x * gain) / ceiling;
    const target = over > 1 ? 1 / over : 1;
    gain = target < gain ? gain * 0.6 + target * 0.4 : Math.min(1, gain * 0.9995 + target * 0.0005);
    out[i] = clamp(x * gain, -ceiling, ceiling);
  }
  return out;
}

export function lookaheadSoftLimiter(samples: Float32Array, ceilingDb = -1, lookaheadSamples = 256): Float32Array {
  const ceiling = dbToAmp(Math.min(ceilingDb, -0.01));
  const out = new Float32Array(samples.length);
  let gain = 1;
  for (let i = 0; i < samples.length; i++) {
    let futurePeak = 0;
    const end = Math.min(samples.length, i + lookaheadSamples);
    for (let j = i; j < end; j++) futurePeak = Math.max(futurePeak, Math.abs(samples[j]));
    const target = futurePeak > ceiling ? ceiling / Math.max(1e-9, futurePeak) : 1;
    gain = target < gain ? target : Math.min(1, gain * 0.9992 + target * 0.0008);
    const shaped = Math.tanh((samples[i] * gain) / ceiling) * ceiling;
    out[i] = clamp(shaped, -ceiling, ceiling);
  }
  return out;
}

export function processAudio(data: AudioBufferData, params: ProcessingParams, analysis?: AudioAnalysis): ProcessingResult {
  const temporalProcessingCurve = analysis?.temporalProcessingCurve ?? makeTemporalCurve(analysis?.timelineMetrics ?? []);
  const artifactHeadroom = dbToAmp(params.artifactHeadroomDb ?? 0);
  let channels = data.channels.map((channel) => {
    const headroomChannel = new Float32Array(channel.length);
    for (let i = 0; i < channel.length; i++) headroomChannel[i] = channel[i] * artifactHeadroom;
    let out = applyStaticEq(headroomChannel, data.sampleRate, params);
    out = applyTemporalRepair(out, data.sampleRate, temporalProcessingCurve, params);
    const outputGain = dbToAmp(params.outputGainDb);
    for (let i = 0; i < out.length; i++) out[i] *= outputGain;
    return out;
  });
  channels = applyToneLeveling(channels, params);
  channels = applyBassEnhance(channels, data.sampleRate, params);
  channels = applyVocalForward(channels, data.sampleRate, params);
  channels = applyTemporalStereoWidthRepair(channels, data.sampleRate, temporalProcessingCurve, params);
  channels = applyLayeredSpectralRepair(channels, data.sampleRate, temporalProcessingCurve, params);
  channels = applyHighTextureRepair(channels, data.sampleRate, params, analysis);
  channels = applyBodyAndWarmth(channels, data.sampleRate, params);
  channels = applyMasterEq(channels, data.sampleRate, params);
  channels = applyBassMono(channels, data.sampleRate, params);
  channels = applyMasterStereoWidth(channels, params);
  channels = applyAutoLoudness(channels, params);
  channels = channels.map((channel) => params.lookaheadLimiter ? lookaheadSoftLimiter(channel, params.truePeakCeilingDb, Math.floor(data.sampleRate * 0.006)) : simpleLimiter(channel, params.truePeakCeilingDb));
  const maxPeak = Math.max(...channels.map((channel) => peak(channel)));
  return {
    audio: { sampleRate: data.sampleRate, channels },
    chain: [
      "DC offset removal",
      "20Hz high-pass",
      `Artifact safety headroom ${params.artifactHeadroomDb.toFixed(1)}dB`,
      "Safe peaking EQ for mud / harshness / sibilance / metallic / hiss",
      `Tone leveling ${Math.round(params.toneLeveling ?? 0)}%`,
      `Bass enhance ${Math.round(params.bassEnhance ?? 0)}%`,
      `Vocal image forward ${Math.round(params.vocalForward ?? 0)}%`,
      `Temporal stereo noise width repair ${Math.round(params.stereoWidthReduction ?? 0)}%`,
      `Layered spectral side-HF repair ${Math.round(params.layeredSpectralRepair ?? 0)}%`,
      `High texture repair ${Math.round(params.highTextureRepair ?? 0)}% / air recover ${Math.round(params.highAirRecover ?? 0)}%`,
      `Vocal body ${Math.round(params.vocalBody ?? 0)}% / mix warmth ${Math.round(params.mixWarmth ?? 0)}%`,
      params.masteringEnabled ? "Mastering: on" : "Mastering: off",
      `Master EQ low ${Math.round(params.lowWeight ?? 0)} / low-mid cleanup ${Math.round(params.lowMidCleanup ?? 0)} / presence ${Math.round(params.presence ?? 0)} / air ${Math.round(params.air ?? 0)}`,
      `Bass mono below ${Math.round(params.bassMonoHz ?? 0)}Hz`,
      `Master stereo width ${Math.round(params.masterStereoWidth ?? 0)}%`,
      params.autoLoudness ? `Approx loudness target ${params.targetLufs.toFixed(1)} LUFS` : "Approx loudness target: off",
      params.longSongDecayFix ? "長尺劣化補正: temporal artifact repair" : "長尺劣化補正: off",
      "Simple de-esser style high-band suppression",
      params.lookaheadLimiter ? "Lookahead soft true peak ceiling limiter" : "Approximate true peak ceiling limiter",
      `Output gain ${params.outputGainDb.toFixed(1)}dB`
    ],
    peakDb: ampToDb(maxPeak),
    temporalProcessingCurve
  };
}

export function makeDifference(original: AudioBufferData, processed: AudioBufferData, mode: "removed" | "added" | "net" = "removed"): AudioBufferData {
  const length = Math.min(original.channels[0]?.length ?? 0, processed.channels[0]?.length ?? 0);
  const channels = original.channels.map((channel, index) => {
    const out = new Float32Array(length);
    const proc = processed.channels[index] ?? processed.channels[0];
    for (let i = 0; i < length; i++) {
      const before = channel[i] ?? 0;
      const after = proc[i] ?? 0;
      const removed = Math.abs(after) < Math.abs(before);
      const added = Math.abs(after) > Math.abs(before);
      if (mode === "removed") out[i] = removed ? clamp(before - after, -1, 1) : 0;
      else if (mode === "added") out[i] = added ? clamp(after - before, -1, 1) : 0;
      else out[i] = clamp(before - after, -1, 1);
    }
    return out;
  });
  return { sampleRate: original.sampleRate, channels };
}
