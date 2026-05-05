"use client";

import { presets } from "@/lib/audio/presets";

type Props = {
  selected: string;
  onSelect: (id: string) => void;
};

export function PresetPanel({ selected, onSelect }: Props) {
  return (
    <div className="rounded border border-line bg-panel p-4">
      <h2 className="mb-3 font-semibold">Preset</h2>
      <div className="grid gap-2">
        {presets.map((preset) => (
          <button
            key={preset.id}
            onClick={() => onSelect(preset.id)}
            className={`rounded border p-3 text-left text-sm transition ${selected === preset.id ? "border-sky-300 bg-sky-400/15" : "border-line bg-panel2 hover:border-slate-500"}`}
          >
            <div className="font-medium">{preset.name}</div>
            <div className="mt-1 text-xs text-muted">{preset.description}</div>
            {preset.warning && <div className="mt-2 text-xs text-amber-200">{preset.warning}</div>}
          </button>
        ))}
      </div>
    </div>
  );
}
