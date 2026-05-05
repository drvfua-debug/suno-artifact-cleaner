# GitHub Release Checklist

## Before Push

Run:

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
- Static export is generated

## Do Not Commit

- `node_modules/`
- `.next/`
- `out/`
- `web-upload-static/`
- `UPLOAD_TO_DRVF_artifactcleaner_eg_latest/`
- `backups/`
- `*.zip`
- `*.tsbuildinfo`
- local WAV / MP3 test files

## Static Upload

For `https://drvf.net/lando_hp/artifactcleaner_eg/`, upload the contents of:

```text
out/
```

Do not upload the `out` folder itself.

## Manual Smoke Test

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
