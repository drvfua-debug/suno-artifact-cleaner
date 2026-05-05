import type { AudioBufferData } from "./types";

export function toAudioBuffer(context: BaseAudioContext, data: AudioBufferData): AudioBuffer {
  const buffer = context.createBuffer(data.channels.length, data.channels[0]?.length ?? 0, data.sampleRate);
  data.channels.forEach((channel, index) => buffer.copyToChannel(new Float32Array(channel), index));
  return buffer;
}

export async function renderOfflinePassThrough(data: AudioBufferData): Promise<AudioBufferData> {
  const context = new OfflineAudioContext(data.channels.length, data.channels[0]?.length ?? 0, data.sampleRate);
  const source = context.createBufferSource();
  source.buffer = toAudioBuffer(context, data);
  source.connect(context.destination);
  source.start();
  const rendered = await context.startRendering();
  return {
    sampleRate: rendered.sampleRate,
    channels: Array.from({ length: rendered.numberOfChannels }, (_, index) => new Float32Array(rendered.getChannelData(index)))
  };
}
