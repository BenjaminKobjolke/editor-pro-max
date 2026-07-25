---
name: calculate-metadata
description: Dynamically set composition duration, dimensions, and props
metadata:
  tags: calculateMetadata, duration, dimensions, props, dynamic
---

# Using calculateMetadata

Use `calculateMetadata` on a `<Composition>` to dynamically set duration, dimensions, and transform props before rendering.

```tsx
<Composition
  id="MyComp"
  component={MyComponent}
  durationInFrames={300}
  fps={30}
  width={1920}
  height={1080}
  defaultProps={{ videoSrc: "https://remotion.media/video.mp4" }}
  calculateMetadata={calculateMetadata}
/>
```

## Setting duration based on a video

Use the [`getVideoDuration`](./get-video-duration.md) and [`getVideoDimensions`](./get-video-dimensions.md) skills to get the video duration and dimensions:

```tsx
import { CalculateMetadataFunction } from "remotion";
import { getVideoDuration } from "./get-video-duration";

const calculateMetadata: CalculateMetadataFunction<Props> = async ({
  props,
}) => {
  const durationInSeconds = await getVideoDuration(props.videoSrc);

  return {
    durationInFrames: Math.ceil(durationInSeconds * 30),
  };
};
```

## Matching dimensions of a video

Use the [`getVideoDimensions`](./get-video-dimensions.md) skill to get the video dimensions:

```tsx
import { CalculateMetadataFunction } from "remotion";
import { getVideoDuration } from "./get-video-duration";
import { getVideoDimensions } from "./get-video-dimensions";

const calculateMetadata: CalculateMetadataFunction<Props> = async ({
  props,
}) => {
  const dimensions = await getVideoDimensions(props.videoSrc);

  return {
    width: dimensions.width,
    height: dimensions.height,
  };
};
```

## Setting duration based on multiple videos

```tsx
const calculateMetadata: CalculateMetadataFunction<Props> = async ({
  props,
}) => {
  const metadataPromises = props.videos.map((video) =>
    getVideoDuration(video.src),
  );
  const allMetadata = await Promise.all(metadataPromises);

  const totalDuration = allMetadata.reduce(
    (sum, durationInSeconds) => sum + durationInSeconds,
    0,
  );

  return {
    durationInFrames: Math.ceil(totalDuration * 30),
  };
};
```

## Setting a default outName

Set the default output filename based on props:

```tsx
const calculateMetadata: CalculateMetadataFunction<Props> = async ({
  props,
}) => {
  return {
    defaultOutName: `video-${props.id}.mp4`,
  };
};
```

## Transforming props

Fetch data or transform props before rendering:

```tsx
const calculateMetadata: CalculateMetadataFunction<Props> = async ({
  props,
  abortSignal,
}) => {
  const response = await fetch(props.dataUrl, { signal: abortSignal });
  const data = await response.json();

  return {
    props: {
      ...props,
      fetchedData: data,
    },
  };
};
```

The `abortSignal` cancels stale requests when props change in the Studio.

## Return value

All fields are optional. Returned values override the `<Composition>` props:

- `durationInFrames`: Number of frames
- `width`: Composition width in pixels
- `height`: Composition height in pixels
- `fps`: Frames per second
- `props`: Transformed props passed to the component
- `defaultOutName`: Default output filename
- `defaultCodec`: Default codec for rendering

## Gotcha: shared utils get bundled for the browser too

`Root.tsx` (and anything it imports, including helper modules used only inside `calculateMetadata`) is bundled with webpack for **both** the Remotion Studio preview (browser) and rendering. If a utility module used by `calculateMetadata` or the component tree happens to reference a Node built-in - `assert`, `process`, `fs`, etc. - even just inside a CLI-only code path (e.g. a `--self-check` block meant to be run standalone with `tsx`), the Studio bundle fails at runtime with an unhelpful error like `Cannot read properties of undefined (reading 'includes')` (from an unguarded `process.argv.includes(...)`) or a webpack module-resolution error for `assert`.

Fixes:
- Don't import Node's `assert` in a file that's also imported by `Root.tsx` / a composition - write a tiny local assert helper instead.
- Guard any `process`-based CLI entry point: `if (typeof process !== "undefined" && process.argv?.includes("--self-check")) { ... }`.
- If a module is genuinely CLI-only, keep it a standalone script (e.g. under `scripts/`) rather than importing it from `src/`.
