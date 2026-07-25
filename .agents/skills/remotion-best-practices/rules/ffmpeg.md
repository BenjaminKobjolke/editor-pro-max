---
name: ffmpeg
description: Using FFmpeg and FFprobe in Remotion
metadata:
  tags: ffmpeg, ffprobe, video, trimming
---

## FFmpeg in Remotion

`ffmpeg` and `ffprobe` do not need to be installed. They are available via the `bunx remotion ffmpeg` and `bunx remotion ffprobe`:

```bash
bunx remotion ffmpeg -i input.mp4 output.mp3
bunx remotion ffprobe input.mp4
```

### Trimming videos

You have 2 options for trimming videos:

1. Use the FFmpeg command line. You MUST re-encode the video to avoid frozen frames at the start of the video.

```bash
# Re-encodes from the exact frame
bunx remotion ffmpeg -ss 00:00:05 -i public/input.mp4 -to 00:00:10 -c:v libx264 -c:a aac public/output.mp4
```

2. Use the `trimBefore` and `trimAfter` props of the `<Video>` component. The benefit is that this is non-destructive and you can change the trim at any time.

```tsx
import { Video } from "@remotion/media";

<Video
  src={staticFile("video.mp4")}
  trimBefore={5 * fps}
  trimAfter={10 * fps}
/>;
```

### Minimal filter set

Remotion's bundled ffmpeg is often a minimal build - most video filters are compiled out, leaving only a small allow-list (`scale`, `colorspace`, a handful of audio filters, etc). Run `npx remotion ffmpeg -filters` to see what's actually available before reaching for `-vf`; don't assume common filters like `fps` or `crop` exist. Two consequences seen in practice:

- **No `fps`/`crop` filter** - to sample frames at a custom rate or crop a region, seek + grab one frame at a time instead (`-ss <t> -frames:v 1 -vf scale=<w>:-2`), or do the cropping in post (e.g. with `sharp`) rather than in the ffmpeg call.
- **`-f null -` needs `-vn`** - without it, `silencedetect`-style audio-only analysis can fail with "Automatic encoder selection failed... codec wrapped_avframe" because it also tries (and fails) to set up a null video encoder.

Also don't trust `r_frame_rate` from `ffprobe` for frame-rate math - on some phone recordings it reports the container's `tbr` instead of the real frame rate (e.g. `90000/1`). Prefer `avg_frame_rate`, or avoid needing native fps entirely by seeking to timestamps directly.

See the standalone **ffmpeg** skill for the full write-up and a reusable frame-sampling tool (`scripts/export-silence-frames.ts` in this project).
