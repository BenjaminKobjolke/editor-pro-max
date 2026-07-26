#!/usr/bin/env npx tsx
/**
 * Rescan public/projects/ and regenerate src/generated/projects.ts without
 * moving anything. Use after manually adding/removing a project folder.
 * Usage: npx tsx scripts/sync-projects.ts
 */
import {syncProjectsRegistry} from "./lib/projectsRegistry";

syncProjectsRegistry();
