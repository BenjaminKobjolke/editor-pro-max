import React from "react";
import {AbsoluteFill, Series, useVideoConfig} from "remotion";
import {VideoClip} from "./VideoClip";
import type {Clip} from "../../utils/buildTimeline";

export interface SegmentedClipProps {
  src: string;
  clips: Clip[];
  fit?: "cover" | "contain" | "fill";
  style?: React.CSSProperties;
}

/** Like JumpCut, but each clip can have its own playbackRate/muted/volume. */
export const SegmentedClip: React.FC<SegmentedClipProps> = ({src, clips, fit = "cover", style}) => {
  const {fps} = useVideoConfig();

  if (clips.length === 0) return null;

  return (
    <AbsoluteFill style={style}>
      <Series>
        {clips.map((clip, i) => {
          const durationInFrames = Math.round(((clip.endSeconds - clip.startSeconds) / clip.playbackRate) * fps);
          if (durationInFrames <= 0) return null;

          return (
            <Series.Sequence key={i} durationInFrames={durationInFrames}>
              <VideoClip
                src={src}
                trimStartSeconds={clip.startSeconds}
                trimEndSeconds={clip.endSeconds}
                playbackRate={clip.playbackRate}
                volume={clip.volume}
                muted={clip.muted}
                fit={fit}
              />
            </Series.Sequence>
          );
        })}
      </Series>
    </AbsoluteFill>
  );
};
