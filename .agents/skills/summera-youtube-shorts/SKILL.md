---
name: summera-youtube-shorts
description: Build a YouTube Short from a raw talking-head recording - cut silence, speed up on-screen typing/app stretches, crossfade to a branded endscreen, duck-then-swell background music. Use when asked to make/edit a "Summera" short, or given a raw talking-head video (+ endscreen, + music) to turn into a short.
metadata:
  tags: youtube-shorts, summera, silence-cut, jump-cut, typing-speedup, crossfade, endscreen, music-ducking
---

# Summera YouTube Shorts

End-to-end recipe for turning a raw talking-head recording into a polished
YouTube Short: silence removed, on-screen stretches (typing, app switching,
loading) kept but sped up and muted, crossfade into a branded endscreen,
background music quiet under the speaker and swelling once the endscreen
takes over. Built once for `public/assets/20260724_youtube_posts.mp4` ->
`src/compositions/YoutubeShortEdit.tsx`; reuse the same pattern for the next
video rather than reinventing it.

## Inputs

- `public/assets/<main>.mp4` - the talking-head recording. May contain
  stretches where the speaker is silent and doing something on-screen
  (typing, scrolling, waiting for a page to load).
- `public/assets/<endscreen>.mp4` - a short branded outro clip, crossfaded
  in at the end. Typically muted (music carries it).
- A music bed (mp3), referenced via `staticFile`.

## Pipeline

1. **Silence detection**
   ```bash
   npx tsx scripts/detect-silence.ts public/assets/<main>.mp4
   ```
   -> `public/silence.json`: `speechSegments`, `silenceSegments`
   (`{start,end}` in seconds), `totalDuration`. Tune `noiseDb`/`minDuration`
   args if it over/under-cuts.

2. **Export one frame/sec across the silences**
   ```bash
   npx tsx scripts/export-silence-frames.ts public/assets/<main>.mp4
   ```
   -> `public/silence-frames/*.png` + `manifest.json`. General tool, not
   typing-specific - see the **ffmpeg** skill for what it does and why (no
   ML/heuristic scoring, just samples frames for a human/agent to look at).

3. **Classify by eye, write `public/typing.json`**
   Read the exported frames (Read tool renders images). For each silence
   segment, decide: is something worth keeping-but-speeding-up visible
   (keyboard, app UI, loading spinner), or is it just a dead pause?
   - A range with visible activity -> keep, mark as a "typing" segment.
   - A range with nothing -> leave it out entirely; `buildTimeline` cuts
     anything not covered by `speechSegments` or `typingSegments`.
   - Snap ranges to the enclosing silence-segment bounds when a segment is
     too short to sample (<1s - no exact-second frame exists for it) but
     sits between two confirmed segments; note the assumption in the file.
   Write:
   ```json
   {
     "typingSegments": [{"start": 27.06, "end": 28.08}, ...],
     "source": "public/assets/<main>.mp4",
     "labeledBy": "claude-vision",
     "notes": "why each boundary was placed where it was"
   }
   ```
   Don't chase sub-second precision by extracting more ad-hoc frames -
   1 frame/sec is enough; `buildTimeline`'s speech-wins overlap trimming
   absorbs small misalignments.

4. **Build the timeline**
   `src/utils/buildTimeline.ts` merges `speechSegments` + `typingSegments`
   into an ordered, gap-free `Clip[]`:
   - speech -> `playbackRate: 1`, audible, boosted volume
   - typing -> `playbackRate: typingSpeed` (e.g. 4), muted
   - speech always wins where a typing range overlaps speech (trimmed via
     interval subtraction)
   - anything not covered by either -> simply omitted, i.e. cut
   Has a `--self-check` (`npx tsx src/utils/buildTimeline.ts --self-check`)
   - run it after touching the merge/trim logic.

5. **Composition** - use `src/compositions/YoutubeShortEdit.tsx` as the
   template:
   - `<TransitionSeries>`: `SegmentedClip` (main, cut+sped timeline) ->
     `TransitionSeries.Transition` (crossfade, e.g.
     `TRANSITION_PRESETS.fadeSlow`) -> `VideoClip` (endscreen, muted).
   - `SegmentedClip` (`src/components/media/SegmentedClip.tsx`) is a
     per-clip-speed/mute generalization of `JumpCut` - renders a `<Series>`
     of `VideoClip`s from the `buildTimeline` output.
   - Music: **don't** use `AudioTrack`'s `duckDuringSegments` for this - it
     hard-sets volume with no ramp, so the quiet->loud jump at the endscreen
     sounds like an instant cut. Use `<Audio>` directly with a custom
     `volume` callback that ramps over the same window as the video
     crossfade (`interpolate` from `MUSIC_QUIET` to `MUSIC_LOUD` across
     `transitionFrames`), plus a fade-out at the very end. See
     `YoutubeShortEdit.tsx` for the exact curve.
   - **Always** set `loopVolumeCurveBehavior="extend"` on that `<Audio>` -
     see the **remotion-best-practices** `audio.md` gotcha: a composition-
     frame-keyed volume curve silently desyncs if the source loops with the
     default `"repeat"` behavior.

6. **Register in `Root.tsx`** with `calculateMetadata`: fetch
   `silence.json` + `typing.json` (`fetch(staticFile(...))`), get the
   endscreen's duration (`getVideoMetadata` from `@remotion/media-utils`),
   run `buildTimeline` to get `mainFrames`, and return
   `durationInFrames: mainFrames + endscreenFrames - transitionFrames`. See
   the **remotion-best-practices** `calculate-metadata.md` gotcha about
   Node builtins (`assert`, `process`) breaking the Studio's browser bundle
   if a utility file like `buildTimeline.ts` isn't guarded.

## Tunable constants

- `buildTimeline` call (in `Root.tsx`'s `calculateMetadata`): `padding`
  (per-clip head/tail padding, seconds), `speakerVolume`, `typingSpeed`.
- `YoutubeShortEdit.tsx`: `MUSIC_QUIET`, `MUSIC_LOUD`,
  `MUSIC_FADE_OUT_SECONDS`. The swell window reuses `transitionFrames` so
  the audio and video transitions stay in sync automatically.
- Transition choice: swap `TRANSITION_PRESETS.fadeSlow` for another preset
  in `src/components/transitions/TransitionPresets.ts` if a different feel
  is wanted; `transitionFrames` in `Root.tsx` must match its
  `getDurationInFrames()`.

## Verification

1. `npx tsx scripts/export-silence-frames.ts <video> ...` -> sanity-check
   `manifest.json` frame count looks right for the video length.
2. `npx tsx src/utils/buildTimeline.ts --self-check`
3. `npx tsc --noEmit`
4. `npx remotion compositions` - confirms `calculateMetadata` resolves
   without a runtime bundling error and prints a sane duration.
5. `npm run dev` -> Studio -> eyeball the cut points, typing speedup, and
   music swell.
6. `npx remotion render YoutubeShortEdit out/short.mp4` then
   `npx remotion ffprobe -show_entries format=duration -show_entries
   stream=width,height,codec_type out/short.mp4` to confirm dimensions,
   duration, and that both video+audio streams are present.

## Related skills

- **ffmpeg** - the `export-silence-frames.ts` tool and the minimal-ffmpeg-
  build gotchas (no `fps`/`crop` filter, `-vn` needed for `-f null -`,
  `r_frame_rate` can lie).
- **remotion-best-practices** - `audio.md` (loop volume curve reset),
  `calculate-metadata.md` (Node builtins breaking the Studio bundle),
  `transitions.md` (`TransitionSeries` duration math).
