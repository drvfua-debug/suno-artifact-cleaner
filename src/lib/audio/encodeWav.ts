import { clamp } from "./metrics";
import type { AudioBufferData } from "./types";

function exportSample(data: AudioBufferData, channel: number, index: number, length: number): number {
  const sampleRate = data.sampleRate;
  const fadeSamples = Math.min(length, Math.max(1, Math.floor(sampleRate * 0.012)));
  const zeroTailSamples = Math.min(length, Math.max(1, Math.floor(sampleRate * 0.001)));
  let sample = data.channels[channel][index] ?? 0;
  if (index >= length - zeroTailSamples) return 0;
  if (index >= length - fadeSamples) {
    const remaining = length - zeroTailSamples - index;
    const fadeDenominator = Math.max(1, fadeSamples - zeroTailSamples);
    sample *= clamp(remaining / fadeDenominator, 0, 1);
  }
  return sample;
}

export function encodeWav(data: AudioBufferData, bitDepth: 16 | 24 = 16): Blob {
  const channels = data.channels.length;
  const length = data.channels[0]?.length ?? 0;
  const bytesPerSample = bitDepth === 24 ? 3 : 2;
  const blockAlign = channels * bytesPerSample;
  const byteRate = data.sampleRate * blockAlign;
  const dataSize = length * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  let offset = 0;
  const writeString = (value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset++, value.charCodeAt(i));
  };
  writeString("RIFF");
  view.setUint32(offset, 36 + dataSize, true); offset += 4;
  writeString("WAVE");
  writeString("fmt ");
  view.setUint32(offset, 16, true); offset += 4;
  view.setUint16(offset, 1, true); offset += 2;
  view.setUint16(offset, channels, true); offset += 2;
  view.setUint32(offset, data.sampleRate, true); offset += 4;
  view.setUint32(offset, byteRate, true); offset += 4;
  view.setUint16(offset, blockAlign, true); offset += 2;
  view.setUint16(offset, bitDepth, true); offset += 2;
  writeString("data");
  view.setUint32(offset, dataSize, true); offset += 4;
  let ditherState = 0x12345678;
  const nextDither = () => {
    ditherState ^= ditherState << 13;
    ditherState ^= ditherState >>> 17;
    ditherState ^= ditherState << 5;
    return ((ditherState >>> 0) / 0xffffffff) - 0.5;
  };
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < channels; ch++) {
      let sample = clamp(exportSample(data, ch, i, length), -1, 1);
      if (bitDepth === 16) {
        const tpdfDither = (nextDither() + nextDither()) / 65536;
        sample = clamp(sample + tpdfDither, -1, 1);
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      } else {
        const value = Math.round(sample < 0 ? sample * 0x800000 : sample * 0x7fffff);
        view.setUint8(offset++, value & 0xff);
        view.setUint8(offset++, (value >> 8) & 0xff);
        view.setUint8(offset++, (value >> 16) & 0xff);
      }
    }
  }
  return new Blob([buffer], { type: "audio/wav" });
}
