import { processAudio } from "../dsp";
import type { AudioAnalysis, AudioBufferData, ProcessingParams } from "../types";

self.onmessage = (event: MessageEvent<{ audio: AudioBufferData; params: ProcessingParams; analysis?: AudioAnalysis }>) => {
  const result = processAudio(event.data.audio, event.data.params, event.data.analysis);
  self.postMessage({ result });
};
