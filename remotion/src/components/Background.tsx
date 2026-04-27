import React from "react";
import { AbsoluteFill, Video } from "remotion";

interface BackgroundProps {
  src: string;
  startFrom?: number;
}

export const Background: React.FC<BackgroundProps> = ({ src, startFrom }) => {
  return (
    <AbsoluteFill>
      <Video src={src} startFrom={startFrom} style={{ width: "100%", height: "100%" }} />
    </AbsoluteFill>
  );
};
