"use client";

import { useEffect, useRef } from "react";
import type { AudioBufferData } from "@/lib/audio/types";

type Props = {
  original?: AudioBufferData;
  processed?: AudioBufferData;
  loop?: { start: number; end: number };
};

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
}

export function WaveformView({ original, processed, loop }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !original) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width = canvas.clientWidth * dpr;
    const height = canvas.height = 170 * dpr;
    const axisHeight = 26 * dpr;
    const waveHeight = height - axisHeight;
    const duration = original.channels[0].length / original.sampleRate;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#0b1220";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(148, 163, 184, 0.2)";
    ctx.lineWidth = dpr;
    ctx.beginPath();
    ctx.moveTo(0, waveHeight);
    ctx.lineTo(width, waveHeight);
    ctx.stroke();
    const draw = (data: AudioBufferData, color: string, yScale: number) => {
      const samples = data.channels[0];
      const step = Math.max(1, Math.floor(samples.length / width));
      const stride = Math.max(1, Math.floor(step / 96));
      ctx.strokeStyle = color;
      ctx.lineWidth = dpr;
      ctx.beginPath();
      for (let x = 0; x < width; x++) {
        let min = 1, max = -1;
        const end = Math.min(samples.length, (x + 1) * step);
        for (let i = x * step; i < end; i += stride) {
          min = Math.min(min, samples[i]);
          max = Math.max(max, samples[i]);
        }
        ctx.moveTo(x, waveHeight / 2 + min * waveHeight * yScale);
        ctx.lineTo(x, waveHeight / 2 + max * waveHeight * yScale);
      }
      ctx.stroke();
    };
    draw(original, "#38bdf8", 0.42);
    if (processed) draw(processed, "#f59e0b", 0.36);
    if (loop) {
      ctx.fillStyle = "rgba(250, 204, 21, 0.14)";
      ctx.fillRect((loop.start / duration) * width, 0, ((loop.end - loop.start) / duration) * width, waveHeight);
    }
    const tickCount = width < 520 * dpr ? 4 : 6;
    ctx.font = `${11 * dpr}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textBaseline = "top";
    ctx.fillStyle = "#94a3b8";
    ctx.strokeStyle = "rgba(148, 163, 184, 0.18)";
    for (let i = 0; i <= tickCount; i++) {
      const ratio = i / tickCount;
      const x = ratio * width;
      const seconds = duration * ratio;
      ctx.beginPath();
      ctx.moveTo(x, waveHeight);
      ctx.lineTo(x, waveHeight + 7 * dpr);
      ctx.stroke();
      const label = formatTime(seconds);
      const textWidth = ctx.measureText(label).width;
      const textX = i === 0 ? 4 * dpr : i === tickCount ? width - textWidth - 4 * dpr : x - textWidth / 2;
      ctx.fillText(label, textX, waveHeight + 9 * dpr);
    }
    ctx.fillStyle = "#38bdf8";
    ctx.fillText("Original", 8 * dpr, 8 * dpr);
    if (processed) {
      ctx.fillStyle = "#f59e0b";
      ctx.fillText("Processed", 78 * dpr, 8 * dpr);
    }
  }, [original, processed, loop]);
  return <canvas ref={ref} className="h-[170px] w-full rounded border border-line bg-panel2" />;
}
