import React from "react";
import { AbsoluteFill, Video } from "remotion";

interface BackgroundProps {
  src: string;
}

export const Background: React.FC<BackgroundProps> = ({ src }) => {
  return (
    <AbsoluteFill>
      <Video src={src} style={{ width: "100%", height: "100%" }} />
    </AbsoluteFill>
  );
};
