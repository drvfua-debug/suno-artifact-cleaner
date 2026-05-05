"use client";

import { Upload } from "lucide-react";
import { useCallback, useState } from "react";

type Props = {
  onFile: (file: File) => void;
  busy: boolean;
};

export function Dropzone({ onFile, busy }: Props) {
  const [dragging, setDragging] = useState(false);
  const handleDrop = useCallback((event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  }, [onFile]);

  return (
    <label
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`flex min-h-40 cursor-pointer flex-col items-center justify-center gap-3 rounded border border-dashed p-5 text-center transition ${dragging ? "border-sky-300 bg-sky-400/10" : "border-line bg-panel2"}`}
    >
      <Upload className="h-8 w-8 text-sky-300" />
      <div>
        <div className="font-semibold">WAV / MP3をドロップ</div>
        <div className="mt-1 text-sm text-sky-100">UP後は自動解析され、おすすめ補正タイプが選択されます。</div>
        <div className="mt-1 text-sm text-muted">MP3は読み込みのみ対応、保存はWAVです。ファイルは外部送信せず、ブラウザ内で処理します</div>
      </div>
      <input
        type="file"
        accept="audio/wav,audio/x-wav,audio/mpeg,audio/mp3,.wav,.mp3"
        className="hidden"
        disabled={busy}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) onFile(file);
        }}
      />
    </label>
  );
}
