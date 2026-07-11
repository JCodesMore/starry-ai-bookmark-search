import React from "react";
import { Composition } from "remotion";
import { Main } from "./Main";
import { Thumbnail } from "./Thumbnail";
import {
  FPS,
  HEIGHT,
  THUMB_HEIGHT,
  THUMB_WIDTH,
  TOTAL_FRAMES,
  WIDTH,
} from "./timeline";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="promo"
        component={Main}
        durationInFrames={TOTAL_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="thumbnail"
        component={Thumbnail}
        durationInFrames={1}
        fps={FPS}
        width={THUMB_WIDTH}
        height={THUMB_HEIGHT}
      />
    </>
  );
};
