import {z} from "zod";
import {zColor} from "@remotion/zod-types";

// Editable tuning knobs for the Projects/YoutubeShortEdit composition.
// The clip timeline itself (clips/mainFrames/endscreenFrames/mainSrc) is
// computed by calculateMetadata in Root.tsx from silence.json/typing.json -
// not user-editable, so it's not part of this schema.
export const YoutubeShortEditSchema = z.object({
  typingSpeed: z.number().min(1).max(10).default(4),
  speakerVolume: z.number().min(0).max(3).default(1.6),
  padding: z.number().min(0).max(1).default(0.1),
  transitionFrames: z.number().min(0).max(120).default(45),
  musicQuiet: z.number().min(0).max(1).default(0.04),
  musicLoud: z.number().min(0).max(1).default(0.45),
  musicFadeOutSeconds: z.number().min(0).max(10).default(1.5),
  backgroundColor: zColor().default("#000000"),
});

export type YoutubeShortEditKnobs = z.infer<typeof YoutubeShortEditSchema>;
