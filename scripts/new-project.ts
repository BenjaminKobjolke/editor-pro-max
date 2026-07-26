#!/usr/bin/env npx tsx
/**
 * Move a video from public/assets/ into its own project folder and register
 * it with the Studio's "Projects" folder.
 * Usage: npx tsx scripts/new-project.ts public/assets/<video>.mp4
 * Output: public/projects/<slug>/source/<video>.mp4 + src/generated/projects.ts
 */
import {existsSync, mkdirSync, renameSync} from "fs";
import path from "path";
import {syncProjectsRegistry} from "./lib/projectsRegistry";

const inputPath = process.argv[2];
if (!inputPath || !existsSync(inputPath)) {
  console.error("Usage: npx tsx scripts/new-project.ts public/assets/<video>.mp4");
  process.exit(1);
}

const fileName = path.basename(inputPath);
const slug = fileName.slice(0, fileName.length - path.extname(fileName).length);
const sourceDir = path.join("public", "projects", slug, "source");
mkdirSync(sourceDir, {recursive: true});

const destPath = path.join(sourceDir, fileName);
renameSync(inputPath, destPath);
console.log(`Moved ${inputPath} -> ${destPath}`);

syncProjectsRegistry();

console.log(`\nProject "${slug}" ready. Next:`);
console.log(`  npx tsx scripts/detect-silence.ts ${destPath}`);
console.log(`  npx tsx scripts/export-silence-frames.ts ${destPath}`);
