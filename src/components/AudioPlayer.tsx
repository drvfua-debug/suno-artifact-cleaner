"use client";

import { Download, FastForward, Pause, Play, Rewind, Wand2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { makeDifference } from "@/lib/audio/dsp";
import { encodeWav } from "@/lib/audio/encodeWav";
import { clamp, dbToAmp, estimateLufs, mergeToMono } from "@/lib/audio/metrics";
import type { AudioBufferData } from "@/lib/audio/types";

type Mode = "original" | "processed" | "removed" | "added";

type Props = {
  original?: AudioBufferData;
  processed?: AudioBufferData;
  loop: { start: number; end: number } | undefined;
  setLoop: (loop: { start: number; end: number } | undefined) => void;
  loudnessMatch: boolean;
  outputFileName: string;
  onWavSaved: () => void;
  onProcess: () => void;
  busy: boolean;
  canProcess: boolean;
  hasPositiveEnhancements: boolean;
};

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
}

function downloadProcessedWav(processed: AudioBufferData, fileName: string) {
  const blob = encodeWav(processed, 16);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function createAudioContext(): AudioContext {
  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) throw new Error("Web Audio API is not available in this browser.");
  return new AudioContextCtor();
}

export function AudioPlayer({ original, processed, loop, setLoop, loudnessMatch, outputFileName, onWavSaved, onProcess, busy, canProcess, hasPositiveEnhancements }: Props) {
  const [mode, setMode] = useState<Mode>("original");
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const bufferCacheRef = useRef<Partial<Record<Mode, { data: AudioBufferData; buffer: AudioBuffer }>>>({});
  const startedAtRef = useRef(0);
  const offsetRef = useRef(0);
  const removedDiff = useMemo(() => original && processed ? makeDifference(original, processed, "removed") : undefined, [original, processed]);
  const addedDiff = useMemo(() => original && processed && hasPositiveEnhancements ? makeDifference(original, processed, "added") : undefined, [hasPositiveEnhancements, original, processed]);
  const playbackMatchGain = useMemo(() => {
    if (!original || !processed || !loudnessMatch) return 1;
    const originalLufs = estimateLufs(mergeToMono(original));
    const processedLufs = estimateLufs(mergeToMono(processed));
    if (!Number.isFinite(originalLufs) || !Number.isFinite(processedLufs)) return 1;
    return dbToAmp(clamp(originalLufs - processedLufs, -8, 8));
  }, [original, processed, loudnessMatch]);
  const active = mode === "processed" ? processed : mode === "removed" ? removedDiff : mode === "added" ? addedDiff : original;
  const duration = active ? active.channels[0].length / active.sampleRate : 0;
  const resolveActive = (target: Mode) => target === "processed" ? processed : target === "removed" ? removedDiff : target === "added" ? addedDiff : original;

  const stop = useCallback(() => {
    try {
      sourceRef.current?.stop();
    } catch {
      // The source may already be stopped after quick seek / mode switches.
    }
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    setPlaying(false);
  }, []);

  const getAudioContext = useCallback(async () => {
    const ctx = ctxRef.current ?? createAudioContext();
    ctxRef.current = ctx;
    if (ctx.state === "suspended") await ctx.resume();
    return ctx;
  }, []);

  const getCachedBuffer = useCallback((ctx: AudioContext, target: Mode, data: AudioBufferData) => {
    const cached = bufferCacheRef.current[target];
    if (cached?.data === data && cached.buffer.sampleRate === data.sampleRate) return cached.buffer;
    const buffer = ctx.createBuffer(data.channels.length, data.channels[0].length, data.sampleRate);
    data.channels.forEach((channel, index) => {
      const copy = new Float32Array(channel.length);
      copy.set(channel);
      buffer.copyToChannel(copy, index);
    });
    bufferCacheRef.current[target] = { data, buffer };
    return buffer;
  }, []);

  const play = useCallback(async (offset = position, target: Mode = mode) => {
    const nextActive = resolveActive(target);
    if (!nextActive) return;
    stop();
    const ctx = await getAudioContext();
    const buffer = getCachedBuffer(ctx, target, nextActive);
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = target === "processed" ? playbackMatchGain : 1;
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(ctx.destination);
    const maxOffset = Math.max(0, nextActive.channels[0].length / nextActive.sampleRate - 0.05);
    const loopStart = loop?.start ?? 0;
    const loopEnd = loop?.end ?? maxOffset;
    const startOffset = Math.min(Math.max(loop ? loopStart : 0, offset), loop ? loopEnd : maxOffset);
    source.start(0, startOffset);
    startedAtRef.current = ctx.currentTime;
    offsetRef.current = startOffset;
    sourceRef.current = source;
    setPosition(startOffset);
    setPlaying(true);
    source.onended = () => {
      if (sourceRef.current === source) setPlaying(false);
    };
  }, [addedDiff, getAudioContext, getCachedBuffer, loop, mode, original, playbackMatchGain, position, processed, removedDiff, stop]);

  const seekTo = (nextPosition: number, keepPlaying = playing) => {
    if (!active) return;
    const max = Math.max(0, duration - 0.05);
    const bounded = Math.min(Math.max(0, nextPosition), max);
    setPosition(bounded);
    if (keepPlaying) void play(bounded, mode);
    else offsetRef.current = bounded;
  };

  const skip = (seconds: number) => {
    seekTo(position + seconds, playing);
  };

  useEffect(() => {
    const id = window.setInterval(() => {
      const ctx = ctxRef.current;
      if (!ctx || !playing) return;
      const pos = offsetRef.current + (ctx.currentTime - startedAtRef.current);
      if (loop && pos >= loop.end) void play(loop.start, mode);
      else setPosition(Math.min(pos, duration));
    }, 120);
    return () => window.clearInterval(id);
  }, [duration, loop, mode, play, playing]);

  useEffect(() => {
    bufferCacheRef.current = {};
    stop();
    setPosition(0);
  }, [original, processed, removedDiff, addedDiff, stop]);

  const switchMode = (next: Mode) => {
    if (next === "added" && !hasPositiveEnhancements) return;
    const wasPlaying = playing;
    const pos = position;
    stop();
    setMode(next);
    window.setTimeout(() => { if (wasPlaying) void play(pos, next); }, 0);
  };

  useEffect(() => {
    if (mode === "added" && !hasPositiveEnhancements) switchMode("processed");
  }, [hasPositiveEnhancements, mode]);

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-slate-950/95 px-3 py-2 backdrop-blur sm:px-4">
      <div className="mx-auto grid max-w-[1600px] gap-2">
        <div className="hidden grid-cols-[42px_42px_42px_4.75rem_1fr] items-center gap-2 sm:grid sm:grid-cols-[44px_44px_44px_5.75rem_1fr]">
          <button className="h-11 rounded bg-slate-800 p-2 text-sky-200 disabled:opacity-40" onClick={() => skip(-10)} disabled={!active} title="Back 10 seconds">
            <Rewind className="h-5 w-5" />
          </button>
          <button className="h-11 rounded bg-sky-300 p-2 text-slate-950 disabled:opacity-40" onClick={() => playing ? stop() : void play()} disabled={!active} title={playing ? "Stop" : "Play"}>
            {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </button>
          <button className="h-11 rounded bg-slate-800 p-2 text-sky-200 disabled:opacity-40" onClick={() => skip(10)} disabled={!active} title="Forward 10 seconds">
            <FastForward className="h-5 w-5" />
          </button>
          <div className="text-center text-xs text-muted sm:text-sm">{formatTime(position)} / {formatTime(duration)}</div>
          <input
            className="range min-w-0"
            type="range"
            min={0}
            max={Math.max(0, duration)}
            step={0.05}
            value={Math.min(position, duration)}
            disabled={!active}
            onChange={(event) => seekTo(Number(event.currentTarget.value), false)}
            onPointerUp={(event) => seekTo(Number((event.currentTarget as HTMLInputElement).value), playing)}
          />
        </div>

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-[minmax(320px,1fr)_auto_auto_auto] sm:items-center">
          <div className="hidden grid-cols-4 rounded border border-line p-1 text-[11px] sm:grid sm:text-xs">
            {(["original", "processed", "removed", "added"] as Mode[]).map((item) => (
              <button key={item} onClick={() => switchMode(item)} disabled={(item !== "original" && !processed) || (item === "added" && !hasPositiveEnhancements)} className={`rounded px-2 py-1 ${mode === item ? "bg-sky-400 text-slate-950" : "text-muted"}`}>
                {item === "original" ? "Original" : item === "processed" ? "Processed" : item === "removed" ? "Removed" : "Added"}
              </button>
            ))}
          </div>
          <button className="min-h-11 rounded border border-line px-2 py-2 text-[11px] font-semibold disabled:opacity-40 sm:min-w-28 sm:text-xs" disabled={!original} onClick={() => setLoop(loop ? undefined : { start: Math.max(0, position), end: Math.max(position + 5, position + 10) })}>
            {loop ? `Loop ${formatTime(loop.start)}-${formatTime(loop.end)}` : "Loop"}
          </button>
          <button className="inline-flex min-h-11 min-w-0 items-center justify-center gap-1 rounded bg-fuchsia-300 px-2 py-2 text-[11px] font-semibold text-slate-950 disabled:opacity-40 sm:min-w-36 sm:text-xs" disabled={!canProcess || busy} onClick={onProcess}>
            <Wand2 className="hidden h-4 w-4 shrink-0 sm:block" />
            <span className="sm:hidden">Apply</span>
            <span className="hidden sm:inline">Apply Current Settings</span>
          </button>
          <button
            className="inline-flex min-h-11 items-center justify-center gap-1 rounded bg-emerald-300 px-2 py-2 text-[11px] font-semibold text-slate-950 disabled:opacity-40 sm:min-w-24 sm:text-xs"
            disabled={!processed}
            onClick={() => {
              if (!processed) return;
              downloadProcessedWav(processed, outputFileName);
              onWavSaved();
            }}
          >
            <Download className="h-4 w-4 shrink-0" />
            <span>Save</span>
          </button>
          <div className="hidden text-center text-[11px] text-muted sm:col-span-4 sm:block sm:text-left">
            Processes the selected repair values. If Mastering is ON, mastering is included. If the Removed signal contains loud vocals or instruments, repair is too strong.{loudnessMatch ? " A/B loudness match ON." : ""}
          </div>
        </div>
      </div>
    </div>
  );
}
