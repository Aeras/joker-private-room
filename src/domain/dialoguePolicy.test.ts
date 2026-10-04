import { describe, expect, test } from "bun:test";

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
      intensity: "normal",
    });
  });
});
