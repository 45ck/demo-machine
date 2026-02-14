import React from "react";
import { Audio } from "remotion";

interface NarrationAudioProps {
  src: string;
}

export const NarrationAudio: React.FC<NarrationAudioProps> = ({ src }) => {
  return <Audio src={src} />;
};
