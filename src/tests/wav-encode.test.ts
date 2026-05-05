import { describe, expect, it } from "vitest";
import { estimateWavSampleRate } from "@/lib/audio/decode";
import { encodeWav } from "@/lib/audio/encodeWav";

describe("wav encoder", () => {
  it("creates a valid RIFF/WAVE header", async () => {
    const blob = encodeWav({ sampleRate: 44100, channels: [new Float32Array([0, 0.5, -0.5])] }, 16);
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const text = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
    expect(text(0, 4)).toBe("RIFF");
    expect(text(8, 12)).toBe("WAVE");
    expect(text(12, 16)).toBe("fmt ");
    expect(text(36, 40)).toBe("data");
  });

  it("preserves the source sample rate in the WAV header", async () => {
    const blob = encodeWav({ sampleRate: 48000, channels: [new Float32Array([0, 0.1, -0.1])] }, 16);
    const buffer = await blob.arrayBuffer();
    expect(estimateWavSampleRate(buffer)).toBe(48000);
  });

  it("zeros the final samples to prevent export tail clicks", async () => {
    const samples = new Float32Array(4410).fill(0.7);
    const blob = encodeWav({ sampleRate: 44100, channels: [samples] }, 16);
    const buffer = await blob.arrayBuffer();
    const view = new DataView(buffer);
    const lastSample = view.getInt16(buffer.byteLength - 2, true);
    expect(lastSample).toBe(0);
  });
});
