/**
 * Turn speech + typing segment analysis into an ordered, gap-free render
 * timeline: speech plays at 1x, typing plays sped-up and muted, and
 * everything else (pure silence) is simply omitted - cut.
 */
// Local assert (not Node's `assert`) - this file is imported into Root.tsx
// and bundled for the browser, where Node core modules aren't available.
const assertOk = (cond: unknown, msg?: string): void => {
  if (!cond) throw new Error(msg || "assertion failed");
};
const assert = {
  ok: assertOk,
  strictEqual: (a: unknown, b: unknown, msg?: string) => assertOk(a === b, msg || `${a} !== ${b}`),
};

export interface TimeSegment {
  start: number;
  end: number;
}

export interface Clip {
  startSeconds: number;
  endSeconds: number;
  playbackRate: number;
  muted: boolean;
  volume: number;
}

export interface BuildTimelineOptions {
  speechSegments: TimeSegment[];
  typingSegments: TimeSegment[];
  fps: number;
  padding?: number;
  speakerVolume?: number;
  typingSpeed?: number;
}

export interface TimelineResult {
  clips: Clip[];
  totalFrames: number;
}

/** Subtract `blockers` from `segment`, returning the remaining sub-ranges. */
const subtractIntervals = (segment: TimeSegment, blockers: TimeSegment[]): TimeSegment[] => {
  let remaining = [segment];
  for (const blocker of blockers) {
    const next: TimeSegment[] = [];
    for (const r of remaining) {
      if (blocker.end <= r.start || blocker.start >= r.end) {
        next.push(r); // no overlap
        continue;
      }
      if (blocker.start > r.start) next.push({start: r.start, end: Math.min(blocker.start, r.end)});
      if (blocker.end < r.end) next.push({start: Math.max(blocker.end, r.start), end: r.end});
    }
    remaining = next;
  }
  return remaining.filter((r) => r.end > r.start);
};

const displayFrames = (durationSeconds: number, playbackRate: number, fps: number): number =>
  Math.round((durationSeconds / playbackRate) * fps);

export const buildTimeline = (opts: BuildTimelineOptions): TimelineResult => {
  const {speechSegments, typingSegments, fps, padding = 0, speakerVolume = 1, typingSpeed = 4} = opts;

  type Span = TimeSegment & {playbackRate: number; muted: boolean; volume: number};

  const speechSpans: Span[] = speechSegments.map((s) => ({...s, playbackRate: 1, muted: false, volume: speakerVolume}));

  // Speech wins where typing and speech overlap.
  const typingSpans: Span[] = typingSegments.flatMap((t) =>
    subtractIntervals(t, speechSegments).map((s) => ({...s, playbackRate: typingSpeed, muted: true, volume: 0})),
  );

  const spans = [...speechSpans, ...typingSpans].sort((a, b) => a.start - b.start);

  const clips: Clip[] = spans.map((s) => ({
    startSeconds: Math.max(0, s.start - padding),
    endSeconds: s.end + padding,
    playbackRate: s.playbackRate,
    muted: s.muted,
    volume: s.volume,
  }));

  const totalFrames = clips.reduce(
    (sum, c) => sum + displayFrames(c.endSeconds - c.startSeconds, c.playbackRate, fps),
    0,
  );

  return {clips, totalFrames};
};

const demo = () => {
  const fps = 30;
  const result = buildTimeline({
    speechSegments: [{start: 0, end: 2}, {start: 5, end: 7}],
    // second typing range overlaps the tail of the second speech segment - speech should win there
    typingSegments: [{start: 2, end: 4}, {start: 6.5, end: 8}],
    fps,
    padding: 0,
    speakerVolume: 1.6,
    typingSpeed: 4,
  });

  // Gap 4-5 (pure silence) must not be covered by any clip.
  assert.ok(
    !result.clips.some((c) => c.startSeconds < 5 && c.endSeconds > 4),
    "the 4-5s silence gap should be cut, not covered by any clip",
  );

  // Typing overlapping speech (6.5-7) should be trimmed to 7-8 only.
  const trimmedTyping = result.clips.find((c) => c.muted && c.startSeconds >= 7 - 1e-6);
  assert.ok(trimmedTyping, "expected trimmed typing clip starting at 7");
  assert.strictEqual(trimmedTyping!.startSeconds, 7);
  assert.strictEqual(trimmedTyping!.endSeconds, 8);

  // Ordering: clips sorted by start time.
  for (let i = 1; i < result.clips.length; i++) {
    assert.ok(result.clips[i].startSeconds >= result.clips[i - 1].startSeconds, "clips must be ordered");
  }

  // A 1s typing clip at 4x should take 1/4 the frames of a 1s speech clip.
  const speechFrames = displayFrames(2, 1, fps);
  const typingFrames = displayFrames(1, 4, fps);
  assert.strictEqual(speechFrames, 60);
  assert.strictEqual(typingFrames, Math.round((1 / 4) * fps));

  console.log("buildTimeline.ts self-check passed");
};

if (typeof process !== "undefined" && process.argv?.includes("--self-check")) {
  demo();
}
