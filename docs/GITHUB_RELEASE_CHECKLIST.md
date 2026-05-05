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

The following should not be committed:

- `node_modules/`
- `.next/`
- `out/`
- `web-upload-static/`
- `UPLOAD_TO_DRVF_artifactcleaner_latest/`
- `backups/`
- `*.zip`
- `*.tsbuildinfo`
- local WAV / MP3 test files

## Recommended Git Commands

```bash
git status
git add .
git commit -m "Prepare Suno Artifact Cleaner for GitHub release"
git branch -M main
git remote add origin <YOUR_GITHUB_REPOSITORY_URL>
git push -u origin main
```

If the remote already exists:

```bash
git remote set-url origin <YOUR_GITHUB_REPOSITORY_URL>
git push -u origin main
```

## Static Upload

For `https://drvf.net/lando_hp/artifactcleaner/`, upload the contents of:

```text
out/
```

Do not upload the `out` folder itself.

## Manual Smoke Test

After deployment:

1. Open the deployed URL in Chrome or Edge.
2. Drop a WAV file.
3. Confirm automatic analysis starts.
4. Confirm anおすすめ補正タイプ is selected.
5. Click a degradation timeline section.
6. Confirm loop playback works.
7. Apply the current settings.
8. Compare Original / Processed / 削った音 / 足した音.
9. Export WAV.
10. Export analysis-report.json.

## Notes

Audio files are processed in the browser. The app does not upload selected audio files to a server.
