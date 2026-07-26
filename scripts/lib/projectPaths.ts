/**
 * Shared helper for pipeline scripts: every video lives at
 * public/projects/<slug>/source/<file>, and every derived artifact
 * (silence.json, typing.json, audio.wav, captions.json, ...) is written
 * directly into public/projects/<slug>/ - never into a shared public/*.json
 * file, which is how two videos processed back-to-back used to clobber
 * each other's data.
 */
import path from "path";

const PROJECT_PATH_RE = /public[\\/]projects[\\/]([^\\/]+)[\\/]/;

export const projectDirFromPath = (inputPath: string): string => {
  const match = inputPath.replace(/\\/g, "/").match(PROJECT_PATH_RE);
  if (!match) {
    throw new Error(
      `Expected a path under public/projects/<slug>/..., got: ${inputPath}\n` +
        `Run "npx tsx scripts/new-project.ts <video>" first to create the project folder.`,
    );
  }
  return path.join("public", "projects", match[1]);
};
