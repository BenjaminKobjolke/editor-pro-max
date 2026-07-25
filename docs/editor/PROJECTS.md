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
You drop a video in `public/assets/`, a pipeline of scripts analyzes it,
then a composition assembles the result. See "The editing pipeline" below.

Either way, the steps to add a project are the same:

1. Create `src/compositions/MyVideo.tsx` (or reuse a template from
   `src/templates/`).
2. Register it in `src/Root.tsx` with a `<Composition>` element.
3. Preview in Studio, render with `npx remotion render <id> out/file.mp4`.

## Folder map

```
src/
├── compositions/     one file per video project
├── templates/        ready-made project shapes (social/content/promo/editing)
├── components/       reusable building blocks (text, backgrounds, overlays, media, layout, transitions)
├── presets/           colors, dimensions, fonts, easings — shared constants
├── hooks/             useAnimation, useCaptions, useSilenceSegments, useVideoMetadata
├── schemas/            Zod schemas for template props
├── utils/              animation math, editing helpers (buildTimeline, cut lists, etc.)
└── Root.tsx            registers every composition — nothing shows in Studio without an entry here
```

`public/assets/` holds user-supplied media (video/image/audio), referenced
with `staticFile("assets/filename.ext")`. `public/*.json` holds pipeline
output (captions, silence, typing ranges, video metadata) that compositions
read at build time.

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

Scripts under `scripts/` analyze a video and write JSON to `public/` that a
composition then reads:

| Script | Output | Purpose |
|---|---|---|
| `analyze-video.ts` | `video-metadata.json` | duration, fps, dimensions |
| `extract-audio.ts` | `assets/audio.wav` | 16kHz WAV for transcription |
| `transcribe.ts` | `captions.json` | word-level captions |
| `detect-silence.ts` | `silence.json` | speech/silence segments |
| `export-silence-frames.ts` | `silence-frames/*.png` + manifest | thumbnails to eyeball what's happening during silences |
| `remove-bg.ts` | `*-nobg.png` | AI background removal |

A composition combines this analysis with editing components
(`VideoClip`, `JumpCut`/`SegmentedClip`, `CaptionOverlay`, `AudioTrack`) to
assemble the final cut. `src/utils/buildTimeline.ts` is the general pattern
for merging multiple segment analyses (e.g. speech + on-screen-activity)
into one ordered, gap-free render timeline.

## Worked example: `YoutubeShortEdit`

`src/compositions/YoutubeShortEdit.tsx` is the most complete example of this
pattern so far — silence removed, on-screen typing kept-but-sped-up, a
crossfade into a branded endscreen, background music that's quiet under the
speaker and swells over the endscreen. The full recipe (which scripts to
run, in what order, how the composition is put together, what to tune) is
written up in the **summera-youtube-shorts** skill
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

## Further reading

- `CLAUDE.md` — component/template catalog, platform specs, presets, animation golden rules.
- **remotion-best-practices** skill — correct API usage per topic (audio, video, transitions, captions, calculateMetadata, ...).
- **ffmpeg** skill — raw ffmpeg/ffprobe usage and this project's bundled-ffmpeg gotchas.
- **summera-youtube-shorts** skill — the silence-cut/typing-speedup/endscreen-crossfade project recipe.
