#!/usr/bin/env npx tsx
/**
 * Interactive: pick a project, render its composition to out/<slug>.mp4.
 * Usage: npx tsx scripts/render-project.ts  (or run render_project.bat)
 */
import {execSync} from "child_process";
import {createInterface} from "readline/promises";
import {PROJECTS} from "../src/generated/projects";

const main = async () => {
  if (PROJECTS.length === 0) {
    console.error("No projects found. Run: npx tsx scripts/new-project.ts public/assets/<name>.mp4");
    process.exit(1);
  }

  console.log("Projects:");
  PROJECTS.forEach((p, i) => console.log(`  ${i + 1}) ${p.compositionId}  (${p.slug})`));

  const rl = createInterface({input: process.stdin, output: process.stdout});
  const answer = await rl.question(`\nRender which project? [1-${PROJECTS.length}]: `);
  rl.close();

  const index = Number(answer.trim()) - 1;
  const project = PROJECTS[index];

  if (!project) {
    console.error(`Invalid choice: "${answer}"`);
    process.exit(1);
  }

  const outPath = `out/${project.slug}.mp4`;
  console.log(`\nRendering ${project.compositionId} -> ${outPath}\n`);
  execSync(`npx remotion render ${project.compositionId} ${outPath}`, {stdio: "inherit"});
};

main();
