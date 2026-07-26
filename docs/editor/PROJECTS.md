# How projects work in Editor Pro Max

A "project" here is one **Remotion composition**: a React component that
renders a video, registered once in `src/Root.tsx` and shown as a row in
Remotion Studio (`npm run dev` → http://localhost:3000). There's no separate
project file/format — the composition *is* the project.

## Two ways a project gets made

### 1. From scratch
You describe a video, Claude writes a composition using the building blocks
below. See `CLAUDE.md`'s "Component Reference" / "Templates Reference" for
the full catalog (`AnimatedTitle`, `GradientBackground`, `TikTokVideo`,
`Presentation`, etc.).

### 2. Editing existing footage
You drop a video in `public/assets/`, `npx tsx scripts/new-project.ts
public/assets/<file>.mp4` moves it into its own
`public/projects/<slug>/source/` folder and auto-registers it, then a
pipeline of scripts analyzes it and a composition assembles the result. See
"The editing pipeline" below.

For path A, the steps to add a project are:

1. Create `src/compositions/MyVideo.tsx` (or reuse a template from
   `src/templates/`).
2. Register it in `src/Root.tsx` with a `<Composition>` element.
3. Preview in Studio, render with `npx remotion render <id> out/file.mp4`.

Path B skips steps 1-2 — `new-project.ts` + the shared `YoutubeShortEdit`
component + the generated `Projects` folder in `Root.tsx` do that part
automatically (see below).

## Folder map

```
src/
├── compositions/     one file per video project (from-scratch) / shared editing components (path B)
├── generated/         projects.ts — auto-generated project registry, do not edit by hand
├── templates/        ready-made project shapes (social/content/promo/editing)
├── components/       reusable building blocks (text, backgrounds, overlays, media, layout, transitions)
├── presets/           colors, dimensions, fonts, easings — shared constants
├── hooks/             useAnimation, useCaptions, useSilenceSegments, useVideoMetadata
├── schemas/            Zod schemas for template props
├── utils/              animation math, editing helpers (buildTimeline, cut lists, etc.)
└── Root.tsx            registers every composition — nothing shows in Studio without an entry here
```

`public/assets/` holds shared media (endscreen, music, one-off logos) and is
where the user first drops a new raw video, referenced with
`staticFile("assets/filename.ext")`.

`public/projects/<slug>/` is where a raw video ends up once
`new-project.ts` picks it up — one folder per edited video:

```
public/projects/<slug>/
├── source/<file>.mp4        the raw footage, moved here by new-project.ts
├── silence.json             detect-silence.ts output
├── typing.json              hand-classified on-screen-activity ranges
├── silence-frames/          export-silence-frames.ts thumbnails + manifest.json
├── video-metadata.json      analyze-video.ts output
├── audio.wav                extract-audio.ts output
└── captions.json            transcribe.ts output
```

Every pipeline script derives its output path from its input path (see
`scripts/lib/projectPaths.ts`), so two videos processed back-to-back never
clobber each other's data — the old scheme wrote everything to a shared
`public/*.json` and silently overwrote it on the second run.

## Registering a project (`Root.tsx`)

```tsx
<Composition
  id="MyVideo"
  component={MyVideo}
  durationInFrames={300}
  fps={30}
  width={1080}
  height={1920}
  defaultProps={{ title: "..." }}
/>
```

`id` is the name shown in Studio's sidebar and used on the render CLI
(`npx remotion render MyVideo out/x.mp4`). Compositions are grouped under
`<Folder name="...">` — Studio has no "open" button, you click the row
itself in the sidebar to preview it.

**Editing-pipeline projects (path B) register themselves.** `Root.tsx`
imports `PROJECTS` from `src/generated/projects.ts` and `.map()`s it into a
`<Composition>` per entry, all under a `<Folder name="Projects">` — that
folder *is* the "open project" list in Studio's sidebar. Nothing to hand-add
here; if a project is missing, regenerate the registry:

```bash
npx tsx scripts/sync-projects.ts        # rescan public/projects/, no move
npx tsx scripts/new-project.ts <video>  # move a video in AND regenerate
```

`compositionId` (the `id` shown in Studio) is PascalCase, derived from the
project's slug with leading date-like numeric tokens stripped — e.g.
`20260725_german_rap_sido` → `GermanRapSido`. See `slugToPascalCase` in
`scripts/lib/projectsRegistry.ts`.

### Dynamic duration/props with `calculateMetadata`

When a project's length depends on its source media (a video's actual
duration, a computed cut list), skip the fixed `durationInFrames`/`width`/
`height` and use `calculateMetadata` instead — it runs before render/preview
and can fetch data, probe video files, and return the real dimensions:

```tsx
<Composition
  id="MyVideo"
  component={MyVideo}
  calculateMetadata={async () => {
    const meta = await getVideoMetadata(staticFile("assets/video.mp4"));
    return {
      fps: 30,
      width: 1080,
      height: 1920,
      durationInFrames: Math.round(meta.durationInSeconds * 30),
      props: {/* computed props for the component */},
    };
  }}
/>
```

**Gotcha:** `Root.tsx` and everything it imports gets bundled for the
*browser* (Studio preview), not just for rendering. A helper module used
only by `calculateMetadata` still can't import Node builtins (`assert`,
`process`, `fs`) even inside a guarded/CLI-only code path, or the Studio
bundle fails at runtime with a cryptic error. See the
**remotion-best-practices** skill's `calculate-metadata.md` for the full
writeup.

## The editing pipeline (turning raw footage into a project)

```bash
npx tsx scripts/new-project.ts public/assets/<file>.mp4     # 0. create + register the project
npx tsx scripts/analyze-video.ts public/projects/<slug>/source/<file>.mp4
npx tsx scripts/extract-audio.ts public/projects/<slug>/source/<file>.mp4
npx tsx scripts/transcribe.ts public/projects/<slug>/audio.wav
npx tsx scripts/detect-silence.ts public/projects/<slug>/source/<file>.mp4
npx tsx scripts/export-silence-frames.ts public/projects/<slug>/source/<file>.mp4
```

Every script (except `remove-bg.ts`, not project-scoped) takes a path under
`public/projects/<slug>/...` and writes its output into that same folder,
derived automatically via `scripts/lib/projectPaths.ts`:

| Script | Output | Purpose |
|---|---|---|
| `new-project.ts` | `projects/<slug>/source/<file>` + registry | create/register a project |
| `sync-projects.ts` | registry only | rescan `public/projects/`, regenerate `src/generated/projects.ts` |
| `analyze-video.ts` | `video-metadata.json` | duration, fps, dimensions |
| `extract-audio.ts` | `audio.wav` | 16kHz WAV for transcription |
| `transcribe.ts` | `captions.json` | word-level captions |
| `detect-silence.ts` | `silence.json` | speech/silence segments |
| `export-silence-frames.ts` | `silence-frames/*.png` + manifest | thumbnails to eyeball what's happening during silences |
| `build-timeline.ts` | `timeline.json` | the hand-editable cut, generated from `silence.json` + `typing.json` |
| `remove-bg.ts` | `*-nobg.png` | AI background removal (not project-scoped) |

Replacing a project's footage later (same slug, new file dropped in
`source/`)? Just rerun the pipeline scripts — they always overwrite the same
project-scoped files, nothing to clean up first.

A composition combines this analysis with editing components
(`VideoClip`, `JumpCut`/`SegmentedClip`, `CaptionOverlay`, `AudioTrack`) to
assemble the final cut. `src/utils/buildTimeline.ts` is the general pattern
for merging multiple segment analyses (e.g. speech + on-screen-activity)
into one ordered, gap-free render timeline.

### Editing the cut (`timeline.json`)

`npx tsx scripts/build-timeline.ts public/projects/<slug>/source/<file>.mp4`
writes `public/projects/<slug>/timeline.json` — the ordered clip list
(`{id, label, startSeconds, endSeconds, playbackRate, muted, volume}`) that
`buildTimeline` would otherwise derive on the fly. Once it exists, the
Projects composition's `calculateMetadata` (`src/Root.tsx`) reads it instead
of re-deriving the cut, so **editing the actual video is editing this file**
— by hand, or by asking Claude:
- **Trim** → change a clip's `startSeconds`/`endSeconds`
- **Move/reorder** → reorder entries in the `clips` array (array order = playback order, clips are always gap-free)
- **Delete** → remove an entry
- **Split** → duplicate an entry into two, each covering part of the original range

Delete `timeline.json` to fall back to the auto-generated cut again.

**Why not just edit props in Studio?** The Projects composition does have a
Zod `schema` (`src/schemas/youtubeShortEdit.schema.ts`) for tuning knobs
(transition length, music volume curve, background color) — that panel is
live-editable in a Studio session. But Studio's **Save** button only works
when a `<Composition>` has a statically inlined `defaultProps` object; ours
is generated via `PROJECTS.map()` with a dynamic `id`, so Save always fails
there (`Could not find or extract defaultProps for composition "..."`) — a
structural Remotion limitation, not a bug to fix. `timeline.json` is the
actual persistence mechanism for the cut; the props panel is for
session-only preview tweaks.

## Worked example: `YoutubeShortEdit`

`src/compositions/YoutubeShortEdit.tsx` is the most complete example of this
pattern so far — silence removed, on-screen typing kept-but-sped-up, a
crossfade into a branded endscreen, background music that's quiet under the
speaker and swells over the endscreen. It's one shared, generic component —
every project in the `Projects` folder reuses it (via its `mainSrc` prop),
no per-video `.tsx` file. The full recipe (which scripts to run, in what
order, how the composition is put together, what to tune) is written up in
the **summera-youtube-shorts** skill
(`.agents/skills/summera-youtube-shorts/SKILL.md`) — read that before
building a similar project rather than re-deriving it.

## Preview & render

```bash
npm run dev                                          # Studio at localhost:3000
npx remotion render <id> out/video.mp4                # render a project
npx remotion still <id> out/frame.png --frame=45       # single frame
npx remotion compositions                              # list all projects + resolved duration (also a quick way to catch calculateMetadata errors)
./scripts/batch-render.sh <id> youtube tiktok square    # multi-platform export
```

Or `render_project.bat` (repo root, Windows) — picks a project from a numbered
menu and renders it to `out/<slug>.mp4` via `scripts/render-project.ts`.

## Further reading

- `docs/project/` — one doc per per-project JSON artifact (`silence.json`, `typing.json`, `timeline.json`, etc.), exact field shapes and what generates/consumes each.
- `CLAUDE.md` — component/template catalog, platform specs, presets, animation golden rules.
- **remotion-best-practices** skill — correct API usage per topic (audio, video, transitions, captions, calculateMetadata, ...).
- **ffmpeg** skill — raw ffmpeg/ffprobe usage and this project's bundled-ffmpeg gotchas.
- **summera-youtube-shorts** skill — the silence-cut/typing-speedup/endscreen-crossfade project recipe.
