import type { AudioBufferData } from "./types";

export async function decodeAudioFile(file: File): Promise<{ data: AudioBufferData; bitDepth?: number }> {
  const arrayBuffer = await file.arrayBuffer();
  const bitDepth = estimateWavBitDepth(arrayBuffer);
  const sourceSampleRate = estimateWavSampleRate(arrayBuffer);
  let context: AudioContext;
  try {
    context = sourceSampleRate ? new AudioContext({ sampleRate: sourceSampleRate }) : new AudioContext();
  } catch {
    context = new AudioContext();
  }
  const decoded = await context.decodeAudioData(arrayBuffer.slice(0));
  await context.close();
  const channels = Array.from({ length: decoded.numberOfChannels }, (_, index) => new Float32Array(decoded.getChannelData(index)));
  return { data: { sampleRate: decoded.sampleRate, channels }, bitDepth };
}

export function estimateWavBitDepth(buffer: ArrayBuffer): number | undefined {
  const view = new DataView(buffer);
  if (buffer.byteLength < 36) return undefined;
  const riff = String.fromCharCode(...new Uint8Array(buffer.slice(0, 4)));
  const wave = String.fromCharCode(...new Uint8Array(buffer.slice(8, 12)));
  if (riff !== "RIFF" || wave !== "WAVE") return undefined;
  let offset = 12;
  while (offset + 8 < buffer.byteLength) {
    const id = String.fromCharCode(...new Uint8Array(buffer.slice(offset, offset + 4)));
    const size = view.getUint32(offset + 4, true);
    if (id === "fmt ") return view.getUint16(offset + 22, true);
    offset += 8 + size;
  }
  return undefined;
}

export function estimateWavSampleRate(buffer: ArrayBuffer): number | undefined {
  const view = new DataView(buffer);
  if (buffer.byteLength < 36) return undefined;
  const riff = String.fromCharCode(...new Uint8Array(buffer.slice(0, 4)));
  const wave = String.fromCharCode(...new Uint8Array(buffer.slice(8, 12)));
  if (riff !== "RIFF" || wave !== "WAVE") return undefined;
  let offset = 12;
  while (offset + 8 < buffer.byteLength) {
    const id = String.fromCharCode(...new Uint8Array(buffer.slice(offset, offset + 4)));
    const size = view.getUint32(offset + 4, true);
    if (id === "fmt ") return view.getUint32(offset + 12, true);
    offset += 8 + size + (size % 2);
  }
  return undefined;
}
