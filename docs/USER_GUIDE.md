# Suno Artifact Cleaner EG User Guide

## Basic Flow

1. Drop a WAV or MP3 file.
2. Analysis starts automatically.
3. The recommended repair type is selected automatically.
4. Adjust Song Fix or Manual values if needed.
5. Press **Apply Current Settings**.
6. Play and compare the processed sound.
7. Save the processed WAV.

## Song Fix

Song Fix is the main mode.

It uses a stable early reference section and detects high-frequency noise, sibilance, harshness, metallic tone, hiss, image flattening, and stereo instability that increase later in the song.

Main items:

- Late Decay Score
- Max Decay Section
- Primary Cause
- Recommended repair type
- Decay Timeline
- First / middle / last third scores

Click a section in the Decay Timeline to loop that time range.

## Manual / Easy Mastering

Manual controls are mainly subtractive repair controls for reducing unwanted artifacts.

Easy mastering controls are additive enhancements for vocal body, low-end weight, warmth, and loudness. Easy mastering is OFF by default.

## Difference Monitor

Difference Monitor helps check what the processing changed.

- Removed: components reduced by repair
- Added: components added by mastering or additive enhancement

If the Removed signal contains loud main vocals or instrument bodies, the repair is probably too strong.

## Export

The processed audio can be saved locally as WAV.

The Report screen can export `analysis-report.json`.

## Note

This tool prioritizes not damaging the source. Strong repair can reduce noise, but it can also reduce brightness and air. Start with the automatic recommendation, then adjust gradually.
