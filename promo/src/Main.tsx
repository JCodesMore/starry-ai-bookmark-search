import React from "react";
import { AbsoluteFill } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { NightSky } from "./starry/NightSky";
import { HookScene } from "./scenes/HookScene";
import { IntroScene } from "./scenes/IntroScene";
import { DemoScene } from "./scenes/DemoScene";
import { PrivacyScene } from "./scenes/PrivacyScene";
import { FreeScene } from "./scenes/FreeScene";
import { CtaScene } from "./scenes/CtaScene";
import { SCENES, TRANSITION } from "./timeline";
import { FONT } from "./theme";

const crossfade = () => (
  <TransitionSeries.Transition
    presentation={fade()}
    timing={linearTiming({ durationInFrames: TRANSITION })}
  />
);

export const Main: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: FONT }}>
    {/* One continuous sky behind every scene: transitions crossfade content only. */}
    <NightSky />
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={SCENES.hook}>
        <HookScene />
      </TransitionSeries.Sequence>
      {crossfade()}
      <TransitionSeries.Sequence durationInFrames={SCENES.intro}>
        <IntroScene />
      </TransitionSeries.Sequence>
      {crossfade()}
      <TransitionSeries.Sequence durationInFrames={SCENES.demo}>
        <DemoScene />
      </TransitionSeries.Sequence>
      {crossfade()}
      <TransitionSeries.Sequence durationInFrames={SCENES.privacy}>
        <PrivacyScene />
      </TransitionSeries.Sequence>
      {crossfade()}
      <TransitionSeries.Sequence durationInFrames={SCENES.free}>
        <FreeScene />
      </TransitionSeries.Sequence>
      {crossfade()}
      <TransitionSeries.Sequence durationInFrames={SCENES.cta}>
        <CtaScene />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);
