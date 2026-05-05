"use client";

import { useEffect, useRef } from "react";
import { problemBands } from "@/lib/audio/analysis";
import type { AudioBufferData } from "@/lib/audio/types";

function bandPower(samples: Float32Array, sampleRate: number, freq: number): number {
  const n = Math.min(samples.length, 8192);
  const omega = 2 * Math.PI * freq / sampleRate;
  let re = 0, im = 0;
  for (let i = 0; i < n; i++) {
    re += samples[i] * Math.cos(omega * i);
    im -= samples[i] * Math.sin(omega * i);
  }
  return Math.sqrt(re * re + im * im) / n;
}

type Props = { original?: AudioBufferData; processed?: AudioBufferData };

export function SpectrumView({ original, processed }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !original) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const width = canvas.width = canvas.clientWidth * devicePixelRatio;
    const height = canvas.height = 210 * devicePixelRatio;
    ctx.fillStyle = "#0b1220";
    ctx.fillRect(0, 0, width, height);
    const maxHz = Math.min(original.sampleRate / 2, 22000);
    for (const band of problemBands) {
      const x = Math.log10(Math.max(20, band.fromHz)) / Math.log10(maxHz) * width;
      const x2 = Math.log10(Math.min(maxHz, Math.max(30, band.toHz))) / Math.log10(maxHz) * width;
      ctx.fillStyle = band.key === "metallic" || band.key === "hiss" ? "rgba(244, 63, 94, .10)" : "rgba(56, 189, 248, .08)";
      ctx.fillRect(x, 0, Math.max(1, x2 - x), height);
      ctx.fillStyle = "#94a3b8";
      ctx.font = `${10 * devicePixelRatio}px Arial`;
      ctx.fillText(band.label, x + 4, 14 * devicePixelRatio);
    }
    const draw = (data: AudioBufferData, color: string) => {
      const samples = data.channels[0];
      ctx.strokeStyle = color;
      ctx.lineWidth = 2 * devicePixelRatio;
      ctx.beginPath();
      for (let i = 0; i < 120; i++) {
        const hz = 30 * Math.pow(maxHz / 30, i / 119);
        const p = bandPower(samples, data.sampleRate, hz);
        const db = 20 * Math.log10(Math.max(1e-8, p));
        const x = Math.log10(hz) / Math.log10(maxHz) * width;
        const y = height - ((db + 90) / 90) * height;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    draw(original, "#38bdf8");
    if (processed) draw(processed, "#f59e0b");
  }, [original, processed]);
  return <canvas ref={ref} className="h-[210px] rounded border border-line bg-panel2" />;
}
