export const DIALOGUE_INTENSITIES = ["conservative", "normal", "chaos"] as const;

export type DialogueIntensity = (typeof DIALOGUE_INTENSITIES)[number];

export const DEFAULT_DIALOGUE_INTENSITY: DialogueIntensity = "normal";

export interface DialogueSettings {
  /** Master presentation gate. When false, no preset or AI dialogue may be emitted. */
  speechEnabled: boolean;
  /** Independent presentation policy; meaningful only when speech is enabled. */
  allowProfanity: boolean;
  /** Optional provider path. When false, dialogue is preset-only. */
  aiEnabled: boolean;
  /** Google Cloud TTS output; only valid when AI is enabled. */
  ttsEnabled: boolean;
  /** Whether dialogue text is shown alongside speech. */
  showDialogueText: boolean;
  intensity: DialogueIntensity;
}

export function isDialogueIntensity(value: unknown): value is DialogueIntensity {
  return typeof value === "string" && (DIALOGUE_INTENSITIES as readonly string[]).includes(value);
}

export function toDialogueSettings(input: {
  botsTalk: boolean;
  allowProfanity: boolean;
  aiEnabled: boolean;
  ttsEnabled?: boolean;
  showDialogueText?: boolean;
  intensity: DialogueIntensity;
}): DialogueSettings {
  if (!input.botsTalk) {
    return {
      speechEnabled: false,
      allowProfanity: false,
      aiEnabled: false,
      ttsEnabled: false,
      showDialogueText: true,
      intensity: input.intensity,
    };
  }

  return {
    speechEnabled: true,
    allowProfanity: input.allowProfanity,
    aiEnabled: input.aiEnabled,
    ttsEnabled: input.aiEnabled && input.ttsEnabled === true,
    showDialogueText: input.aiEnabled && input.ttsEnabled === true ? input.showDialogueText !== false : true,
    intensity: input.intensity,
  };
}
