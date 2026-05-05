# Deployment Checklist

Use this checklist before publishing or updating the hosted app.

## Required Commands

```bash
npm install
npm run typecheck
npm test
npm run build
npm run build:static
```

Expected result:

- TypeScript passes
- Vitest passes
- Next.js production build passes
- Static export passes

## Static Upload Target

Target URL:

```text
https://drvf.net/lando_hp/artifactcleaner/
```

Build command:

```bash
npm run build:static
```

Upload the contents of:

```text
out/
```

to:

```text
/lando_hp/artifactcleaner/
```

Do not upload the `out` folder itself.

## GitHub / Vercel Notes

Recommended Vercel settings:

- Framework preset: Next.js
- Install command: `npm ci`
- Build command: `npm run build`
- Output directory: default
- Node.js: 20.x or 22.x

No environment variables are required.

## Manual Smoke Test

After deployment:

1. Open the deployed URL in Chrome or Edge.
2. Drop a WAV or MP3 file.
3. Confirm automatic analysis starts.
4. Confirm a recommended repair type is selected.
5. Click a Decay Timeline section.
6. Confirm loop playback works.
7. Apply the current settings.
8. Compare Original / Processed / Removed / Added.
9. Export WAV.
10. Export `analysis-report.json`.

## Security / Privacy Notes

- Audio is processed in the browser.
- Selected audio files are not uploaded by the application code.
- Production browser source maps are explicitly disabled in `next.config.mjs`.
- Do not commit `.env`, local audio files, `out/`, `.next/`, zip files, or upload folders.

## Known Operational Notes

- Large files can use significant browser memory.
- LUFS and True Peak are approximation meters in this MVP.
- For final mastering decisions, compare with a DAW or dedicated metering tool.
