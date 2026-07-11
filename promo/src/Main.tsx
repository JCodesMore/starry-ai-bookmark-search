import React from "react";
import { AbsoluteFill, Series } from "remotion";
import { NightSky } from "./starry/NightSky";
import { SceneShell } from "./lib/SceneShell";
import { HookScene } from "./scenes/HookScene";
import { SolutionScene } from "./scenes/SolutionScene";
import { IntroScene } from "./scenes/IntroScene";
import { DemoScene } from "./scenes/DemoScene";
import { PrivacyScene } from "./scenes/PrivacyScene";
import { FreeScene } from "./scenes/FreeScene";
import { CtaScene } from "./scenes/CtaScene";
import { SCENES } from "./timeline";
import { FONT } from "./theme";

export const Main: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: FONT }}>
    {/* One continuous sky behind every scene; scenes clear the stage in turn. */}
    <NightSky />
    <Series>
      <Series.Sequence durationInFrames={SCENES.hook}>
        <SceneShell duration={SCENES.hook}>
          <HookScene />
        </SceneShell>
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENES.solution}>
        <SceneShell duration={SCENES.solution}>
          <SolutionScene />
        </SceneShell>
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENES.intro}>
        <SceneShell duration={SCENES.intro}>
          <IntroScene />
        </SceneShell>
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENES.demo}>
        <SceneShell duration={SCENES.demo}>
          <DemoScene />
        </SceneShell>
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENES.privacy}>
        <SceneShell duration={SCENES.privacy}>
          <PrivacyScene />
        </SceneShell>
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENES.free}>
        <SceneShell duration={SCENES.free}>
          <FreeScene />
        </SceneShell>
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENES.cta}>
        <SceneShell duration={SCENES.cta} holdEnd>
          <CtaScene />
        </SceneShell>
      </Series.Sequence>
    </Series>
  </AbsoluteFill>
);
