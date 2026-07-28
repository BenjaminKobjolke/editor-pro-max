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
takes over. Built once for `20260724_youtube_posts.mp4` ->
`src/compositions/YoutubeShortEdit.tsx`; reuse the same pattern for the next
video rather than reinventing it.

Every video is a **project**: `public/projects/<slug>/`. This keeps each
video's `silence.json`/`typing.json`/frames isolated - the old scheme wrote
everything to shared `public/silence.json`, which silently clobbered one
video's data whenever the pipeline ran on another.

## Inputs

- The raw talking-head recording, dropped in `public/assets/<file>.mp4` by
  the user. May contain stretches where the speaker is silent and doing
  something on-screen (typing, scrolling, waiting for a page to load).
- `public/assets/endscreen.mp4` - shared branded outro clip, crossfaded in
  at the end. Typically muted (music carries it).
- A shared music bed (mp3) in `public/assets/`, referenced via `staticFile`.

Endscreen and music are shared across projects (`ASSET_PATHS` in
`YoutubeShortEdit.tsx`); only the main recording is project-scoped.

## Pipeline

0. **Create the project**
   ```bash
   npx tsx scripts/new-project.ts public/assets/<main>.mp4
   ```
   Moves the video to `public/projects/<slug>/source/<main>.mp4` (slug =
   filename without extension) and regenerates `src/generated/projects.ts`,
   which is what makes the video show up as a Composition under the
   **Projects** folder in Studio (`npm run dev`). Prints the exact next
   commands with the new path filled in.

1. **Silence detection**
   ```bash
   npx tsx scripts/detect-silence.ts public/projects/<slug>/source/<main>.mp4
   ```
   -> `public/projects/<slug>/silence.json`: `speechSegments`,
   `silenceSegments` (`{start,end}` in seconds), `totalDuration`. Tune
   `noiseDb`/`minDuration` args if it over/under-cuts.

2. **Export one frame/sec across the silences**
   ```bash
   npx tsx scripts/export-silence-frames.ts public/projects/<slug>/source/<main>.mp4
   ```
   -> `public/projects/<slug>/silence-frames/*.png` + `manifest.json`.
   General tool, not typing-specific - see the **ffmpeg** skill for what it
   does and why (no ML/heuristic scoring, just samples frames for a
   human/agent to look at).

3. **Classify by eye, write `public/projects/<slug>/typing.json`**
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
     "source": "public/projects/<slug>/source/<main>.mp4",
     "labeledBy": "claude-vision",
     "notes": "why each boundary was placed where it was"
   }
   ```
   Don't chase sub-second precision by extracting more ad-hoc frames -
   1 frame/sec is enough; `buildTimeline`'s speech-wins overlap trimming
   absorbs small misalignments.

   Re-running the pipeline on a **replaced** video (same slug, new footage)
   just means redoing steps 1-3 - they always overwrite the same
   project-scoped files, so there's nothing to clean up first.

4. **Build the timeline** - `src/utils/buildTimeline.ts` merges
   `speechSegments` + `typingSegments` into an ordered, gap-free `Clip[]`:
   - speech -> `playbackRate: 1`, audible, boosted volume
   - typing -> `playbackRate: typingSpeed` (e.g. 4), muted
   - speech always wins where a typing range overlaps speech (trimmed via
     interval subtraction)
   - anything not covered by either -> simply omitted, i.e. cut
   Has a `--self-check` (`npx tsx src/utils/buildTimeline.ts --self-check`)
   - run it after touching the merge/trim logic.

   **Always materialize it to disk** - don't leave this to the runtime
   fallback in `Root.tsx`'s `calculateMetadata`:
   ```bash
   npx tsx scripts/build-timeline.ts public/projects/<slug>/source/<main>.mp4
   ```
   -> `public/projects/<slug>/timeline.json`. This is a mandatory pipeline
   step, not an optional extra - it's the only place to hand-cut something
   that's technically silence-or-speech but shouldn't be in the final video
   (e.g. a transient in-app error message that flashes up during a loading
   stretch: split the enclosing `typingSegments` range around it in
   `typing.json`, rerun this script, and the excised window is simply gone -
   uncovered by any clip). Rerun it any time `silence.json`/`typing.json`
   change; it always overwrites the same file.

5. **Composition** - `src/compositions/YoutubeShortEdit.tsx` is a shared,
   generic component reused by every project (no per-video `.tsx` files):
   - `<TransitionSeries>`: `SegmentedClip` (main, cut+sped timeline, driven
     by the `mainSrc` prop) -> `TransitionSeries.Transition` (crossfade,
     e.g. `TRANSITION_PRESETS.fadeSlow`) -> `VideoClip` (endscreen, muted).
   - `SegmentedClip` (`src/components/media/SegmentedClip.tsx`) is a
     per-clip-speed/mute generalization of `JumpCut` - renders a `<Series>`
     of `VideoClip`s from the `buildTimeline` output.
   - Fit: the main clip renders as **two layers** — a blurred, muted,
     `fit="cover"` copy (`blur(40px)` + `scale(1.12)` to hide the blur
     fringe) behind a `fit="contain"` foreground. Phone screen recordings
     are often taller than 9:16 (e.g. 1080x2460) and a plain `cover` crops
     ~270px off top and bottom — status bar, answer text, bottom UI gone.
     With contain+blur the full frame stays visible and the pillar bars are
     filled; for an exactly-9:16 source the blurred layer is simply hidden
     behind the full-frame foreground, so it needs no per-project switch.
     The background copy must be muted (`{...clip, muted: true, volume: 0}`)
     or the speech audio doubles.
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

6. **Registration is automatic.** `src/Root.tsx` maps over
   `PROJECTS` from `src/generated/projects.ts` (regenerated by
   `new-project.ts` / `scripts/sync-projects.ts`) and renders one
   `<Composition>` per project under a **Projects** `<Folder>`, each with
   its own `calculateMetadata`: fetches
   `projects/<slug>/silence.json` + `projects/<slug>/typing.json`
   (`fetch(staticFile(...))`), gets the endscreen's duration
   (`getVideoMetadata` from `@remotion/media-utils`), runs `buildTimeline`
   to get `mainFrames`, and returns
   `durationInFrames: mainFrames + endscreenFrames - transitionFrames`. No
   manual `<Composition>` block to hand-write per video anymore - if a
   project doesn't show up in Studio, it's because `new-project.ts`/
   `sync-projects.ts` hasn't been run since the folder was added. See the
   **remotion-best-practices** `calculate-metadata.md` gotcha about Node
   builtins (`assert`, `process`) breaking the Studio's browser bundle if a
   utility file like `buildTimeline.ts` isn't guarded - the same applies to
   `scripts/lib/projectPaths.ts` and `projectsRegistry.ts`, which is why
   those stay Node-only scripts, never imported into `Root.tsx` directly
   (only their generated output, `src/generated/projects.ts`, a plain data
   file, is imported).

   Composition `id`s are PascalCase, derived from the slug with leading
   date-like numeric tokens dropped (e.g. `20260725_german_rap_sido` ->
   `GermanRapSido`) - see `slugToPascalCase` in
   `scripts/lib/projectsRegistry.ts`.

## Tunable constants

- `buildTimeline` call (in `Root.tsx`'s `calculateMetadata`): `padding`
  (per-clip head/tail padding, seconds), `speakerVolume`, `typingSpeed`.
  Same defaults for every project (0.1, 1.6, 4) - special-case in
  `Root.tsx` if one project needs different tuning.
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
4. `npx remotion compositions` - confirms every project's
   `calculateMetadata` resolves without a runtime bundling error and prints
   a sane duration under its generated composition id.
5. `npm run dev` -> Studio -> open the project under the **Projects**
   folder, eyeball the cut points, typing speedup, and music swell.
6. `npx remotion render <CompositionId> out/<slug>.mp4` (id from step 4;
   `<slug>` = the input filename without extension, matching `new-project.ts`'s
   naming - e.g. `20260726_moneybag_yo_i_see_why.mp4` -> `out/20260726_moneybag_yo_i_see_why.mp4`,
   never a shortened/renamed variant) then `npx remotion ffprobe
   -show_entries format=duration -show_entries stream=width,height,codec_type
   out/<slug>.mp4` to confirm dimensions, duration, and that both video+audio
   streams are present.

## Related skills

- **ffmpeg** - the `export-silence-frames.ts` tool and the minimal-ffmpeg-
  build gotchas (no `fps`/`crop` filter, `-vn` needed for `-f null -`,
  `r_frame_rate` can lie).
- **remotion-best-practices** - `audio.md` (loop volume curve reset),
  `calculate-metadata.md` (Node builtins breaking the Studio bundle),
  `transitions.md` (`TransitionSeries` duration math).
