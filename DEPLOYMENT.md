# Deployment Checklist

Use this checklist before uploading the project for a web test run.

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

## Recommended Host

Vercel is the simplest path for this Next.js app.

Settings:

- Framework preset: Next.js
- Build command: `npm run build`
- Install command: `npm ci`
- Output directory: leave default
- Node.js: 20.x or 22.x

## Static Upload Target

Target URL:

```text
https://drvf.net/lando_hp/artifactcleaner_eg/
```

Build command:

```bash
npm run build:static
```

Upload the contents of:

```text
out/
```

to the server folder:

```text
/lando_hp/artifactcleaner_eg/
```

The exported app includes `index.html`, `404.html`, and `_next/` assets. Do not upload the source project for this static hosting mode.

## Manual Smoke Test

After deployment:

1. Open the deployed URL in Chrome or Edge.
2. Drop a WAV file.
3. Confirm file info and analysis scores appear.
4. Confirm the degradation timeline appears.
5. Click a timeline chunk and confirm loop text updates.
6. Run a Long Song Decay Fix preset.
7. Switch Original / Processed / Difference Monitor.
8. Export `processed.wav`.
9. Export `analysis-report.json`.

## Important Notes

- Audio is processed in the browser.
- Selected audio files are not uploaded by the application code.
- Large files can use a lot of browser memory.
- LUFS and True Peak are approximation meters in this MVP.
- For accurate production mastering decisions, compare with a dedicated metering tool.
