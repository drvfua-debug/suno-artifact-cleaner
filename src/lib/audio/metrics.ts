import type { AudioBufferData } from "./types";

const EPS = 1e-12;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function ampToDb(value: number): number {
  return 20 * Math.log10(Math.max(EPS, Math.abs(value)));
}

export function dbToAmp(db: number): number {
  return Math.pow(10, db / 20);
}

export function peak(samples: Float32Array): number {
  let p = 0;
  for (let i = 0; i < samples.length; i++) p = Math.max(p, Math.abs(samples[i]));
  return p;
}

export function rms(samples: Float32Array): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

export function mean(samples: Float32Array): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i];
  return sum / samples.length;
}

export function mergeToMono(data: AudioBufferData, start = 0, end = data.channels[0]?.length ?? 0): Float32Array {
  const length = Math.max(0, end - start);
  const out = new Float32Array(length);
  if (!data.channels.length) return out;
  for (const channel of data.channels) {
    for (let i = 0; i < length; i++) out[i] += channel[start + i] ?? 0;
  }
  const gain = 1 / data.channels.length;
  for (let i = 0; i < length; i++) out[i] *= gain;
  return out;
}

export function clippingCount(samples: Float32Array, threshold = 0.999): number {
  let count = 0;
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]) >= threshold) count++;
  }
  return count;
}

export function estimateTruePeak(samples: Float32Array): number {
  // approximation: linear 4x oversampling peak, replaceable with a real true-peak meter later.
  let p = peak(samples);
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    for (let k = 1; k < 4; k++) {
      const t = k / 4;
      p = Math.max(p, Math.abs(a + (b - a) * t));
    }
  }
  return p;
}

export function estimateLufs(samples: Float32Array): number {
  // approximation: RMS-based LUFS estimate; structure allows ITU-R BS.1770 replacement.
  return ampToDb(rms(samples)) - 0.691;
}

export function dynamicRangeApprox(samples: Float32Array, frameSize = 2048): number {
  const values: number[] = [];
  for (let i = 0; i + frameSize <= samples.length; i += frameSize) {
    values.push(ampToDb(rms(samples.subarray(i, i + frameSize))));
  }
  if (values.length < 2) return 0;
  values.sort((a, b) => a - b);
  const low = values[Math.floor(values.length * 0.1)];
  const high = values[Math.floor(values.length * 0.95)];
  return high - low;
}

export function transientDensityApprox(samples: Float32Array): number {
  if (samples.length < 3) return 0;
  let hits = 0;
  let avg = 0;
  for (let i = 1; i < samples.length; i++) avg += Math.abs(samples[i] - samples[i - 1]);
  avg /= samples.length - 1;
  const threshold = avg * 4;
  for (let i = 1; i < samples.length; i++) {
    if (Math.abs(samples[i] - samples[i - 1]) > threshold) hits++;
  }
  return clamp((hits / samples.length) * 1000, 0, 100);
}

export function stereoWidthApprox(data: AudioBufferData, start: number, end: number): number {
  if (data.channels.length < 2) return 0;
  const left = data.channels[0].subarray(start, end);
  const right = data.channels[1].subarray(start, end);
  let side = 0;
  let mid = 0;
  for (let i = 0; i < left.length; i++) {
    const m = (left[i] + right[i]) * 0.5;
    const s = (left[i] - right[i]) * 0.5;
    mid += m * m;
    side += s * s;
  }
  return clamp(Math.sqrt(side / Math.max(EPS, mid)), 0, 2);
}
