import { describe, expect, test } from "vitest";

import {
  DIALOGUE_INTENSITIES,
  isDialogueIntensity,
  toDialogueSettings,
} from "./dialoguePolicy";

describe("dialogue policy", () => {
  test("exposes exactly the three approved intensity levels", () => {
    expect(DIALOGUE_INTENSITIES).toEqual(["conservative", "normal", "chaos"]);
    expect(isDialogueIntensity("conservative")).toBe(true);
    expect(isDialogueIntensity("normal")).toBe(true);
    expect(isDialogueIntensity("chaos")).toBe(true);
    expect(isDialogueIntensity("extreme")).toBe(false);
  });

  test("speech OFF forcibly disables profanity and AI", () => {
    expect(
      toDialogueSettings({
        botsTalk: false,
        allowProfanity: true,
        aiEnabled: true,
        intensity: "chaos",
      }),
    ).toEqual({
      speechEnabled: false,
      allowProfanity: false,
      aiEnabled: false,
      ttsEnabled: false,
      showDialogueText: true,
      intensity: "chaos",
    });
  });

  test("speech ON preserves the independent presentation controls", () => {
    expect(
      toDialogueSettings({
        botsTalk: true,
        allowProfanity: true,
        aiEnabled: false,
        intensity: "normal",
      }),
    ).toEqual({
      speechEnabled: true,
      allowProfanity: true,
      aiEnabled: false,
      ttsEnabled: false,
      showDialogueText: true,
      intensity: "normal",
    });
  });

  test("TTS works with preset text as well as AI; hidden text still requires TTS", () => {
    expect(
      toDialogueSettings({
        botsTalk: true,
        allowProfanity: true,
        aiEnabled: true,
        ttsEnabled: true,
        showDialogueText: false,
        intensity: "chaos",
      }),
    ).toMatchObject({
      speechEnabled: true,
      aiEnabled: true,
      ttsEnabled: true,
      showDialogueText: false,
    });

    expect(
      toDialogueSettings({
        botsTalk: true,
        allowProfanity: false,
        aiEnabled: false,
        ttsEnabled: true,
        showDialogueText: false,
        intensity: "normal",
      }),
    ).toMatchObject({
      ttsEnabled: true,
      showDialogueText: false,
    });
  });
});
