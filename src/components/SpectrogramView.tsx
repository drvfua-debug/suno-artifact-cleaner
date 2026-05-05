"use client";

import { useEffect, useRef } from "react";
import type { AudioBufferData, TimelineMetric } from "@/lib/audio/types";

type Props = {
  data?: AudioBufferData;
  timeline?: TimelineMetric[];
  onSelect?: (start: number, end: number) => void;
};

export function SpectrogramView({ data, timeline = [], onSelect }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const width = canvas.width = canvas.clientWidth * devicePixelRatio;
    const height = canvas.height = 170 * devicePixelRatio;
    ctx.fillStyle = "#0b1220";
    ctx.fillRect(0, 0, width, height);
    if (data) {
      const samples = data.channels[0];
      const cols = Math.min(160, Math.floor(width / 3));
      const step = Math.max(1024, Math.floor(samples.length / cols));
      for (let x = 0; x < cols; x++) {
        const slice = samples.subarray(x * step, Math.min(samples.length, (x + 1) * step));
        const stride = Math.max(1, Math.floor(slice.length / 256));
        let energy = 0;
        let count = 0;
        for (let i = stride; i < slice.length; i += stride) {
          energy += Math.abs(slice[i] - slice[i - stride]);
          count++;
        }
        const v = Math.min(1, energy / Math.max(1, count) * 28);
        const grad = ctx.createLinearGradient(0, height, 0, 0);
        grad.addColorStop(0, `rgba(14,165,233,${0.08 + v * 0.3})`);
        grad.addColorStop(0.55, `rgba(245,158,11,${v * 0.24})`);
        grad.addColorStop(1, `rgba(244,63,94,${v * 0.34})`);
        ctx.fillStyle = grad;
        ctx.fillRect((x / cols) * width, 0, width / cols + 1, height);
      }
    }
    if (timeline.length) {
      const maxEnd = timeline[timeline.length - 1].endSec;
      for (const item of timeline) {
        const x = (item.startSec / maxEnd) * width;
        const w = ((item.endSec - item.startSec) / maxEnd) * width;
        const hue = item.degradationScore < 20 ? 160 : item.degradationScore < 40 ? 55 : item.degradationScore < 60 ? 35 : 0;
        ctx.fillStyle = `hsla(${hue}, 85%, 55%, ${0.16 + item.degradationScore / 180})`;
        ctx.fillRect(x, height * (1 - item.degradationScore / 100), Math.max(2, w - 1), height * item.degradationScore / 100);
      }
    }
  }, [data, timeline]);
  return (
    <canvas
      ref={ref}
      className="h-[170px] cursor-crosshair rounded border border-line bg-panel2"
      onClick={(event) => {
        if (!timeline.length || !onSelect) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const ratio = (event.clientX - rect.left) / rect.width;
        const duration = timeline[timeline.length - 1].endSec;
        const sec = ratio * duration;
        const item = timeline.find((m) => sec >= m.startSec && sec < m.endSec);
        if (item) onSelect(item.startSec, item.endSec);
      }}
      title="劣化タイムラインをクリックすると、その区間をループに設定します"
    />
  );
}
