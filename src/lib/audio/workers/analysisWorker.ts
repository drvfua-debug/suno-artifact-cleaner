import { analyzeAudio } from "../analysis";
import type { AudioBufferData } from "../types";

self.onmessage = (event: MessageEvent<{ audio: AudioBufferData; chunkSeconds?: number }>) => {
  const analysis = analyzeAudio(event.data.audio, event.data.chunkSeconds);
  self.postMessage({ analysis });
};
