import {Composition, Folder, staticFile} from "remotion";
import {getVideoMetadata} from "@remotion/media-utils";

// Compositions
import {ShowcaseComposition} from "./compositions/Showcase";
import {YoutubeShortEdit, ASSET_PATHS} from "./compositions/YoutubeShortEdit";
import {buildTimeline, clipsTotalFrames} from "./utils/buildTimeline";
import type {Clip} from "./utils/buildTimeline";
import {PROJECTS} from "./generated/projects";
import {YoutubeShortEditSchema} from "./schemas/youtubeShortEdit.schema";

// Social templates
import {TikTokVideo} from "./templates/social/TikTokVideo";
import {InstagramReel} from "./templates/social/InstagramReel";
import {YouTubeShort} from "./templates/social/YouTubeShort";

// Content templates
import {Presentation} from "./templates/content/Presentation";
import {Testimonial} from "./templates/content/Testimonial";

// Promo templates
import {Announcement} from "./templates/promo/Announcement";
import {BeforeAfterDemo} from "./compositions/BeforeAfterDemo";

// Editing templates
import {TalkingHeadEdit} from "./templates/editing/TalkingHeadEdit";
import {PodcastClip} from "./templates/editing/PodcastClip";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Folder name="Examples">
        <Composition
          id="Showcase"
          component={ShowcaseComposition}
          durationInFrames={300}
          fps={30}
          width={1920}
          height={1080}
        />
      </Folder>

      <Folder name="Social">
        <Composition
          id="TikTok"
          component={TikTokVideo}
          durationInFrames={270}
          fps={30}
          width={1080}
          height={1920}
          defaultProps={{
            hook: "Did you know this?",
            body: "AI can edit videos now using just code.",
            cta: "Follow for more",
          }}
        />
        <Composition
          id="InstagramReel"
          component={InstagramReel}
          durationInFrames={240}
          fps={30}
          width={1080}
          height={1920}
          defaultProps={{
            headline: "Your headline here",
            subtext: "Supporting text goes here",
            brandName: "Brand",
          }}
        />
        <Composition
          id="YouTubeShort"
          component={YouTubeShort}
          durationInFrames={300}
          fps={30}
          width={1080}
          height={1920}
          defaultProps={{
            title: "Your Title Here",
            subtitle: "Subtitle goes here",
          }}
        />
      </Folder>

      <Folder name="Content">
        <Composition
          id="Presentation"
          component={Presentation}
          durationInFrames={450}
          fps={30}
          width={1920}
          height={1080}
          defaultProps={{
            slides: [
              {title: "Welcome", body: "This is slide one"},
              {title: "The Problem", body: "Here's what we're solving"},
              {title: "The Solution", body: "Here's how we solve it"},
            ],
          }}
        />
        <Composition
          id="Testimonial"
          component={Testimonial}
          durationInFrames={180}
          fps={30}
          width={1920}
          height={1080}
          defaultProps={{
            quote:
              "This product completely changed how we work. Highly recommended.",
            author: "Jane Doe",
            role: "CEO at Company",
          }}
        />
      </Folder>

      <Folder name="Promo">
        <Composition
          id="Announcement"
          component={Announcement}
          durationInFrames={300}
          fps={30}
          width={1920}
          height={1080}
          defaultProps={{
            preTitle: "Introducing",
            title: "Something Amazing",
            subtitle: "The future is here",
            cta: "Learn More",
          }}
        />
        <Composition
          id="BeforeAfter"
          component={BeforeAfterDemo}
          durationInFrames={180}
          fps={30}
          width={1920}
          height={1080}
        />
      </Folder>

      <Folder name="Editing">
        <Composition
          id="TalkingHeadEdit"
          component={TalkingHeadEdit}
          durationInFrames={900}
          fps={30}
          width={1920}
          height={1080}
          defaultProps={{
            videoSrc: "assets/video.mp4",
            showCaptions: true,
            captionPreset: "bold" as const,
            removeSilence: false,
          }}
        />
        <Composition
          id="PodcastClip"
          component={PodcastClip}
          durationInFrames={900}
          fps={30}
          width={1080}
          height={1920}
          defaultProps={{
            videoSrc: "assets/video.mp4",
            clipStartSeconds: 0,
            clipEndSeconds: 30,
            showCaptions: true,
            captionPreset: "bold" as const,
          }}
        />
      </Folder>

      <Folder name="Projects">
        {PROJECTS.map((project) => (
          <Composition
            key={project.slug}
            id={project.compositionId}
            component={YoutubeShortEdit}
            schema={YoutubeShortEditSchema}
            defaultProps={{
              typingSpeed: 4,
              speakerVolume: 1.6,
              padding: 0.1,
              transitionFrames: 45,
              musicQuiet: 0.04,
              musicLoud: 0.45,
              musicFadeOutSeconds: 1.5,
              backgroundColor: "#000000",
            }}
            calculateMetadata={async ({props}) => {
              const fps = 30;
              const transitionFrames = props.transitionFrames ?? 45;
              const mainSrc = staticFile(project.mainSrc);

              // timeline.json (written by scripts/build-timeline.ts) is the hand-editable
              // cut - trim/reorder/delete/split live there. Missing/invalid -> fall back
              // to the auto-generated cut from silence.json + typing.json.
              const fetchTimeline = async (): Promise<Clip[] | null> => {
                try {
                  const res = await fetch(staticFile(`projects/${project.slug}/timeline.json`));
                  if (!res.ok) return null;
                  const data = await res.json();
                  return Array.isArray(data.clips) && data.clips.length > 0 ? data.clips : null;
                } catch {
                  return null;
                }
              };

              const [timelineClips, endscreenMeta] = await Promise.all([
                fetchTimeline(),
                getVideoMetadata(ASSET_PATHS.endscreen),
              ]);

              let clips: Clip[];
              let mainFrames: number;
              if (timelineClips) {
                clips = timelineClips;
                mainFrames = clipsTotalFrames(clips, fps);
              } else {
                const [silence, typing] = await Promise.all([
                  fetch(staticFile(`projects/${project.slug}/silence.json`)).then((r) => r.json()),
                  fetch(staticFile(`projects/${project.slug}/typing.json`)).then((r) => r.json()),
                ]);
                ({clips, totalFrames: mainFrames} = buildTimeline({
                  speechSegments: silence.speechSegments,
                  typingSegments: typing.typingSegments,
                  fps,
                  padding: props.padding,
                  speakerVolume: props.speakerVolume,
                  typingSpeed: props.typingSpeed,
                }));
              }
              mainFrames = Math.max(1, mainFrames);

              const endscreenFrames = Math.round(endscreenMeta.durationInSeconds * fps);

              return {
                fps,
                width: 1080,
                height: 1920,
                durationInFrames: mainFrames + endscreenFrames - transitionFrames,
                props: {...props, clips, mainFrames, endscreenFrames, mainSrc},
              };
            }}
          />
        ))}
      </Folder>
    </>
  );
};
