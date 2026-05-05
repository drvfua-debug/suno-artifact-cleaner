# Suno Artifact Cleaner

Browser-only audio artifact analysis and repair tool for AI-generated music exports.

Suno Artifact Cleaner helps detect and reduce harshness, sibilance, metallic high-frequency artifacts, hiss, mud, clipping risk, excessive peaks, and long-song temporal quality decay. Audio files are processed locally in the browser by the application code.

This repository is prepared for public release and static hosting.

## Demo URL

- Japanese UI: [https://drvf.net/lando_hp/artifactcleaner/](https://drvf.net/lando_hp/artifactcleaner/)
- English UI: [https://drvf.net/lando_hp/artifactcleaner_eg/](https://drvf.net/lando_hp/artifactcleaner_eg/)

## Screenshots

Screenshots are planned. See [docs/screenshots/README.md](docs/screenshots/README.md).

## Features

- WAV and MP3 input
- 16-bit PCM WAV export
- Browser-only decoding, analysis, processing, preview, and export
- Automatic analysis after upload
- Automatic recommended repair type selection
- Song Fix timeline for long-song artifact growth
- Reference Section selection for comparing stable early audio against later sections
- Scores for harshness, sibilance, metallic tone, hiss, mud, clipping, and high-frequency loss
- Original / Processed / Removed / Added monitoring
- Separate subtractive repair and additive enhancement controls
- Easy mastering is OFF by default
- `analysis-report.json` export
- Static hosting support

## Basic Flow

1. Drop a WAV or MP3 file.
2. The app analyzes it automatically.
3. The recommended repair type is selected automatically.
4. Adjust Song Fix or Manual controls if needed.
5. Press **Apply Current Settings**.
6. Compare Original / Processed / Removed / Added.
7. Save the processed WAV.
8. Export `analysis-report.json` if needed.

## Song Fix Concept

Song Fix is not a simple global EQ.

It selects a stable early Reference Section, then compares later 10-second chunks against that profile. It avoids treating a normal chorus loudness increase as degradation. The score emphasizes unnatural growth in 8-18 kHz fizz/hiss, 5-8.5 kHz sibilance, 2.5-5 kHz harshness, dynamic range loss, and unstable stereo width.

## DSP Notes

LUFS and True Peak are approximations in this MVP. The analysis code is separated so it can be replaced later with an ITU-R BS.1770-compliant loudness meter and more accurate true-peak oversampling.

WAV export applies a very short tail fade and final zeroing to reduce end-of-file click noise.

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

Audio loading, analysis, processing, preview playback, and WAV export run in the browser. The application code does not upload selected audio files to a server.

## Known Limitations

- LUFS and True Peak are approximate.
- MP3 is supported for input, but export is WAV.
- Very long or large files can use significant browser memory.
- For final mastering decisions, compare with a DAW or dedicated metering tool.
