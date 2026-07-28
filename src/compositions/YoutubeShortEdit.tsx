import React from "react";
import {AbsoluteFill, interpolate, staticFile, useVideoConfig} from "remotion";
import {Audio} from "@remotion/media";
import {TransitionSeries} from "@remotion/transitions";
import {SegmentedClip} from "../components/media/SegmentedClip";
import {VideoClip} from "../components/media/VideoClip";
import {TRANSITION_PRESETS} from "../components/transitions/TransitionPresets";
import type {Clip} from "../utils/buildTimeline";

export const ASSET_PATHS = {
  endscreen: staticFile("assets/endscreen.mp4"),
  music: staticFile("assets/20260724_the_mountain-ambient-487008.mp3"),
};

export interface YoutubeShortEditProps {
  clips?: Clip[];
  mainFrames?: number;
  endscreenFrames?: number;
  transitionFrames?: number;
  mainSrc?: string;
  musicQuiet?: number; // music under the speaker/typing
  musicLoud?: number; // music once the endscreen takes over
  musicFadeOutSeconds?: number;
  backgroundColor?: string;
}

export const YoutubeShortEdit: React.FC<YoutubeShortEditProps> = ({
  clips = [],
  mainFrames = 0,
  endscreenFrames = 0,
  transitionFrames = 45,
  mainSrc = "",
  musicQuiet = 0.04,
  musicLoud = 0.45,
  musicFadeOutSeconds = 1.5,
  backgroundColor = "#000000",
}) => {
  const {fps, durationInFrames} = useVideoConfig();

  // Pillar-bar fill: blurred muted copy behind a contain-fit main layer, so
  // sources taller than 9:16 (e.g. 1080x2460 phone recordings) aren't cropped.
  const backgroundClips = clips.map((c) => ({...c, muted: true, volume: 0}));

  // Swell in sync with the video crossfade, so the music visibly picks up as the endscreen takes over.
  const swellStart = mainFrames - transitionFrames;
  const fadeOutFrames = Math.round(musicFadeOutSeconds * fps);
  const fadeOutStart = durationInFrames - fadeOutFrames;

  const musicVolume = (frame: number): number => {
    const vol = interpolate(frame, [swellStart, mainFrames], [musicQuiet, musicLoud], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    if (frame >= fadeOutStart) {
      return vol * interpolate(frame, [fadeOutStart, durationInFrames], [1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
    }
    return vol;
  };

  return (
    <AbsoluteFill style={{backgroundColor}}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={mainFrames}>
          <AbsoluteFill>
            <SegmentedClip
              src={mainSrc}
              clips={backgroundClips}
              fit="cover"
              style={{filter: "blur(40px)", transform: "scale(1.12)"}}
            />
            <SegmentedClip src={mainSrc} clips={clips} fit="contain" />
          </AbsoluteFill>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition {...TRANSITION_PRESETS.fadeSlow} />
        <TransitionSeries.Sequence durationInFrames={endscreenFrames}>
          <VideoClip src={ASSET_PATHS.endscreen} fit="cover" muted />
        </TransitionSeries.Sequence>
      </TransitionSeries>

      {/* extend: our volume curve is keyed to absolute composition frames (swell/fade-out math above) -
          the default "repeat" would reset the callback's frame to 0 every time the source loops */}
      <Audio src={ASSET_PATHS.music} loop loopVolumeCurveBehavior="extend" volume={musicVolume} />
    </AbsoluteFill>
  );
};
