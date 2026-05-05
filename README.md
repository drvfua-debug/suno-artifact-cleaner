# Suno Artifact Cleaner

AI生成音源やWAV書き出し音源に出やすい耳障りな高域ノイズ、歯擦音、金属感、刺さる帯域、こもり、ピーク過多をブラウザ内で解析・補正・書き出しするWebツールです。

This is a browser-only audio artifact analysis and repair tool built with Next.js, TypeScript, React, Web Audio API, Canvas, Web Workers, and Vitest.

## 特徴

- WAV / MP3読み込み対応
- 書き出しは16bit PCM WAV
- 音声ファイルはサーバーにアップロードしないブラウザ内処理
- WAVアップ後に自動解析し、おすすめ補正タイプを自動選択
- Song Fixで長尺曲の中盤後半からの劣化を10秒チャンク単位で検出
- Reference Sectionを自動選定し、安定区間との差分から劣化を判定
- 高域チリつき、歯擦音、刺さり、金属感、ヒス、こもり、クリップをスコア化
- Original / Processed / 削った音 / 足した音を切り替えて確認
- マイナス補正とプラス補正を分離
- Easy masteringは初期OFF
- analysis-report.jsonを書き出し可能
- 静的ホスティング向けビルド対応

## 主な画面

- **Song Fix**: WAVアップ、解析、おすすめ補正、劣化タイムライン、A/B確認
- **Manual / Easy mastering**: 手動補正、マスタリング系の追加補正
- **Report**: 解析JSONプレビューとレポート書き出し

## 使い方

1. WAVまたはMP3をドロップします。
2. アップ後、自動で解析されます。
3. おすすめ補正タイプが自動で選択されます。
4. 必要ならSong FixやManualで数値を調整します。
5. 「現在の設定を適用」で補正します。
6. Original / Processed / 削った音 / 足した音で確認します。
7. 問題なければWAV保存します。
8. 必要ならReportからanalysis-report.jsonを保存します。

## Long Song / Song Fixの考え方

このツールは、曲全体を単純に明るくしたり暗くしたりするEQアプリではありません。

曲の前半にある比較的安定した区間をReference Sectionとして選び、後続の10秒チャンクと比較します。単に後半の音量が上がっただけでは劣化扱いにせず、8kHz〜18kHzのザラつき、5kHz〜8.5kHzの歯擦音、2.5kHz〜5kHzの刺さり、ダイナミックレンジ低下、ステレオ幅の不安定さなどを重視してスコア化します。

## DSP Notes

MVP実装のため、LUFSとTrue Peakは近似です。将来的にITU-R BS.1770準拠のラウドネスメーターや高精度True Peak oversamplingへ差し替えられるよう、解析ロジックは分離しています。

WAV書き出し時には、最後の短いフェードアウトとゼロ終端を入れて、ファイル末尾の「ブチッ」というクリックノイズを抑えています。

## セットアップ

```bash
npm install
npm run dev
```

ブラウザで開きます。

```text
http://localhost:3000
```

## 検証コマンド

GitHubにpushする前、または公開前に以下を実行してください。

```bash
npm run typecheck
npm test
npm run build
npm run build:static
```

## 静的ホスティング

静的ファイルを書き出します。

```bash
npm run build:static
```

`out/` の中身をサーバーの公開ディレクトリにアップロードします。

現在想定している公開先:

```text
https://drvf.net/lando_hp/artifactcleaner/
```

アップロードするのは `out/` フォルダ自体ではなく、`out/` の中身です。

## GitHubに含めるもの

含めるもの:

- `src/`
- `scripts/`
- `docs/`
- `package.json`
- `package-lock.json`
- `next.config.mjs`
- `tailwind.config.ts`
- `tsconfig.json`
- `vitest.config.ts`
- `README.md`
- `DEPLOYMENT.md`

含めないもの:

- `node_modules/`
- `.next/`
- `out/`
- `web-upload-static/`
- `UPLOAD_TO_DRVF_artifactcleaner_latest/`
- `backups/`
- `*.zip`
- `*.tsbuildinfo`

## Privacy

このアプリの音声解析、補正、プレビュー再生、WAV保存はブラウザ内で行われます。通常の静的ホスティングではHTML、CSS、JavaScriptだけが配信され、ユーザーが選択した音声ファイルをアプリ側でサーバーへ送信する処理はありません。

## Known Limitations

- LUFSとTrue Peakは近似です。
- MP3は読み込み可能ですが、書き出しはWAVです。
- ブラウザのメモリ制限により、長尺・巨大ファイルでは処理が重くなる場合があります。
- 本格的な商用マスタリング判断には、DAWや専用メーターとの併用を推奨します。
