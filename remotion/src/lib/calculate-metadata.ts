import type { CalculateMetadataFunction } from "remotion";
import type { DemoCompositionProps } from "./types.js";

export const calculateMetadata: CalculateMetadataFunction<DemoCompositionProps> = async ({
  props,
}) => {
  const fps = props.fps || 30;
  let durationInFrames = fps * 10; // default 10s

  if (props.audioSrc) {
    try {
      const { getAudioDurationInSeconds } = await import("@remotion/media-utils");
      const audioDuration = await getAudioDurationInSeconds(props.audioSrc);
      durationInFrames = Math.ceil(audioDuration * fps) + fps; // +1s padding
    } catch {
      // Fall back to default duration
    }
  }

  return {
    fps,
    durationInFrames,
    width: props.resolution.width,
    height: props.resolution.height,
  };
};
