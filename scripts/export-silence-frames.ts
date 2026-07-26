#!/usr/bin/env npx tsx
/**
 * Export one low-res frame per second across the silent stretches of a
 * video, so an agent (or a human) can eyeball them and decide what's
 * happening during each silence — e.g. is the speaker typing, or just
 * pausing. Not keyboard-specific: general "sample thumbnails from the quiet
 * parts" tool.
 *
 * Usage: npx tsx scripts/export-silence-frames.ts <video-path> [everySec] [width] [outDir]
 *   everySec  seconds between sampled frames within a segment (default: 1)
 *   width     output frame width in px, scaled proportionally (default: 320)
 *   outDir    where frames + manifest.json go (default: public/projects/<slug>/silence-frames)
 *
 * Reads public/projects/<slug>/silence.json (see detect-silence.ts) for
 * silenceSegments. Falls back to scanning the whole video if it's missing.
 *
 * Output: <outDir>/f_<seconds>.png for each sampled timestamp, plus
 * <outDir>/manifest.json -> [{file, timeSeconds}], sorted by time.
 *
 * ffmpeg gotchas (Remotion's bundled build is minimal, see `npx remotion
 * ffmpeg -filters` for the allow-list):
 *   - No `fps` or `crop` filter. `scale` works fine.
 *   - `r_frame_rate` can report a bogus value (e.g. 90000/1) on some phone
 *     recordings; don't rely on it for frame math.
 * So frames are pulled one at a time with `-ss <t> -frames:v 1`, which
 * sidesteps both issues entirely.
 */
import {execSync} from "child_process";
import {writeFileSync, existsSync, readFileSync, mkdirSync} from "fs";
import path from "path";
import assert from "assert";
import {projectDirFromPath} from "./lib/projectPaths";

interface Segment {
  start: number;
  end: number;
}

// ---- pure logic (self-tested below, no I/O) ----
export const secondsToSample = (segments: Segment[], everySec: number): number[] => {
  const times: number[] = [];
  for (const seg of segments) {
    for (let t = Math.ceil(seg.start); t <= Math.floor(seg.end); t += everySec) {
      times.push(t);
    }
  }
  return [...new Set(times)].sort((a, b) => a - b);
};

const demo = () => {
  const segments: Segment[] = [
    {start: 0.2, end: 0.6}, // shorter than 1s - no whole second inside, sampled empty
    {start: 3.6, end: 6.4}, // whole seconds 4, 5, 6
    {start: 6.4, end: 6.9}, // shorter than 1s again - empty
  ];
  const times = secondsToSample(segments, 1);
  assert.deepStrictEqual(times, [4, 5, 6], "expected only whole seconds inside long segment");

  const everyTwo = secondsToSample(segments, 2);
  assert.deepStrictEqual(everyTwo, [4, 6], "expected 2s spacing");

  console.log("export-silence-frames.ts self-check passed");
};

if (process.argv.includes("--self-check")) {
  demo();
  process.exit(0);
}

// ---- CLI ----
const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: npx tsx scripts/export-silence-frames.ts <video-path> [everySec] [width] [outDir]");
  console.error("  everySec: seconds between sampled frames (default: 1)");
  console.error("  width: output frame width in px (default: 320)");
  console.error("  outDir: output directory (default: public/silence-frames)");
  process.exit(1);
}

const projectDir = projectDirFromPath(inputPath);
const everySec = parseFloat(process.argv[3] || "1");
const width = parseInt(process.argv[4] || "320", 10);
const outDir = process.argv[5] || path.join(projectDir, "silence-frames");

console.log(`Exporting silence frames from: ${inputPath}`);
console.log(`  Every ${everySec}s, width ${width}px, output ${outDir}`);

const silencePath = path.join(projectDir, "silence.json");
let segments: Segment[];
if (existsSync(silencePath)) {
  const silence = JSON.parse(readFileSync(silencePath, "utf-8"));
  segments = (silence.silenceSegments || []).map((s: any) => ({start: s.start, end: s.end}));
  console.log(`  Using ${segments.length} silence segment(s) from ${silencePath}`);
} else {
  const probeCmd = `npx remotion ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputPath}"`;
  const totalDuration = parseFloat(execSync(probeCmd, {encoding: "utf-8"}).trim());
  segments = [{start: 0, end: totalDuration}];
  console.log(`  No silence.json found - scanning whole video (${totalDuration.toFixed(2)}s)`);
}

const times = secondsToSample(segments, everySec);
if (times.length === 0) {
  console.log("No timestamps to sample (segments shorter than everySec everywhere).");
  process.exit(0);
}

mkdirSync(outDir, {recursive: true});

const manifest: Array<{file: string; timeSeconds: number}> = [];
for (const t of times) {
  const fileName = `f_${String(t).padStart(5, "0")}.png`;
  const filePath = path.join(outDir, fileName);
  execSync(`npx remotion ffmpeg -ss ${t} -i "${inputPath}" -frames:v 1 -vf "scale=${width}:-2" -y "${filePath}"`, {
    stdio: "pipe",
  });
  manifest.push({file: fileName, timeSeconds: t});
}

writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

console.log(`\nExported ${manifest.length} frame(s) to ${outDir}`);
console.log(`  Manifest: ${path.join(outDir, "manifest.json")}`);
