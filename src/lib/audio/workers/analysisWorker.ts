import { analyzeAudio } from "../analysis";
import type { AudioBufferData } from "../types";

self.onmessage = (event: MessageEvent<{ audio: AudioBufferData; chunkSeconds?: number; referenceOverride?: { startSec: number; endSec: number } }>) => {
  const analysis = analyzeAudio(event.data.audio, event.data.chunkSeconds, event.data.referenceOverride);
  self.postMessage({ analysis });
};
