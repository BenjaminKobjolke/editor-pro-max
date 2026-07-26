#!/usr/bin/env npx tsx
/**
 * Generate the editable per-project cut list from silence.json + typing.json.
 * Usage: npx tsx scripts/build-timeline.ts public/projects/<slug>/source/video.mp4
 * Output: public/projects/<slug>/timeline.json
 *
 * timeline.json is the source of truth once it exists - Root.tsx's Projects
 * calculateMetadata reads it and renders those exact clips. Edit it by hand
 * (or ask Claude) to trim (startSeconds/endSeconds), reorder (array order),
 * delete (remove an entry), or split (duplicate an entry, set the boundary).
 * Delete the file to fall back to the auto-generated buildTimeline() cut.
 */
import {readFileSync, writeFileSync} from "fs";
import path from "path";
import {projectDirFromPath} from "./lib/projectPaths";
import {buildTimeline} from "../src/utils/buildTimeline";

const inputPath = process.argv[2];

if (!inputPath) {
  console.error("Usage: npx tsx scripts/build-timeline.ts <video-path>");
  process.exit(1);
}

const projectDir = projectDirFromPath(inputPath);
const silence = JSON.parse(readFileSync(path.join(projectDir, "silence.json"), "utf-8"));
const typing = JSON.parse(readFileSync(path.join(projectDir, "typing.json"), "utf-8"));

const fps = 30;
const {clips} = buildTimeline({
  speechSegments: silence.speechSegments,
  typingSegments: typing.typingSegments,
  fps,
  padding: 0.1,
  speakerVolume: 1.6,
  typingSpeed: 4,
});

const editableClips = clips.map((clip, i) => ({
  id: `c${String(i).padStart(2, "0")}`,
  label: clip.muted ? "typing" : "speech",
  ...clip,
}));

const outputPath = path.join(projectDir, "timeline.json");
writeFileSync(outputPath, JSON.stringify({clips: editableClips}, null, 2));

console.log(`Timeline saved to ${outputPath} (${editableClips.length} clips)`);
