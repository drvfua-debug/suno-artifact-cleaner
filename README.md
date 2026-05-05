# Suno Artifact Cleaner

SunoなどのAI生成音源やWAV書き出し音源に出やすい、耳障りな高域ノイズ、歯擦音、金属感、ヒス、こもり、ピーク過多、長尺曲の時間経過による音質劣化を、ブラウザ内で解析・補正・書き出しするWebツールです。

English version: [Suno Artifact Cleaner EG](https://github.com/drvfua-debug/suno-artifact-cleaner/tree/english-version)

## Demo URL

- Japanese: [https://drvf.net/lando_hp/artifactcleaner/](https://drvf.net/lando_hp/artifactcleaner/)
- English: [https://drvf.net/lando_hp/artifactcleaner_eg/](https://drvf.net/lando_hp/artifactcleaner_eg/)

## Screenshots

Screenshots are planned. See [docs/screenshots/README.md](docs/screenshots/README.md).

## Features

- WAV / MP3読み込み
- 16bit PCM WAV書き出し
- 音声ファイルを外部送信しないブラウザ内処理
- アップロード後の自動解析
- 解析結果に基づくおすすめ補正タイプの自動選択
- Song Fixによる長尺曲の劣化タイムライン表示
- Reference Sectionを使った前半基準との差分解析
- 高域チリつき、歯擦音、刺さり、金属感、ヒス、こもり、クリップのスコア化
- Original / Processed / Removed / Added の比較再生
- ノイズを減らすマイナス補正と、質感を足すプラス補正の分離
- Easy masteringは初期OFF
- `analysis-report.json` 書き出し
- 静的ホスティング対応

## Basic Flow

1. WAVまたはMP3をドロップします。
2. 自動で解析されます。
3. おすすめ補正タイプが自動で選択されます。
4. 必要に応じてSong FixまたはManualで調整します。
5. **現在の設定を適用** を押します。
6. Original / Processed / Removed / Added で確認します。
7. 補正後WAVを保存します。
8. 必要なら `analysis-report.json` を保存します。

## Song Fix Concept

Song Fixは単純な全体EQではありません。

曲の前半にある比較的安定した区間をReference Sectionとして選び、後続の10秒チャンクと比較します。単に後半の音量が上がっただけでは劣化扱いにせず、8kHz〜18kHzのチリつき、5kHz〜8.5kHzの歯擦音、2.5kHz〜5kHzの刺さり、ダイナミックレンジ低下、ステレオ幅の不安定さなどを重視してスコア化します。

## DSP Notes

LUFSとTrue PeakはMVP段階の近似です。将来的にITU-R BS.1770準拠のラウドネスメーターや、より高精度なTrue Peak oversamplingへ差し替えられるよう、解析ロジックは分離しています。

WAV書き出し時には、ファイル末尾のクリックノイズを抑えるため、短いフェードアウトとゼロ終端処理を入れています。

## Setup

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

## Checks

Run before publishing:

```bash
npm run typecheck
npm test
npm run build
npm run build:static
```

## Static Hosting

Build static files:

```bash
npm run build:static
```

Upload the contents of `out/` to:

```text
https://drvf.net/lando_hp/artifactcleaner/
```

Upload the contents of `out/`, not the `out` folder itself.

## Privacy

音声の読み込み、解析、補正、プレビュー再生、WAV保存はブラウザ内で行われます。アプリ側のコードで、ユーザーが選択した音声ファイルをサーバーへ送信する処理はありません。

## Known Limitations

- LUFSとTrue Peakは近似です。
- MP3は読み込み可能ですが、書き出しはWAVです。
- 長尺・巨大ファイルはブラウザのメモリを多く使う場合があります。
- 最終的なマスタリング判断では、DAWや専用メーターとの併用を推奨します。
