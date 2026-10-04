import {
  buildGeminiPrompt,
  pickDialoguePreset,
  validateDialogueOutput,
  type DialogueGenerationContext,
} from "./dialogue-core.ts";

export const DEFAULT_GEMINI_DIALOGUE_MODEL = "gemini-3.8-flash";
export const GEMINI_DIALOGUE_TIMEOUT_MS = 3_000;
export const GEMINI_DIALOGUE_MAX_OUTPUT_TOKENS = 96;

export interface DialogueGenerationResult {
  text: string | null;
  source: "gemini" | "preset" | "silence";
  providerAttempted: boolean;
  providerReason?: string;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
}

export async function generateDialogueLine(input: {
  context: DialogueGenerationContext;
  aiEnabled: boolean;
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  random?: () => number;
}): Promise<DialogueGenerationResult> {
  const preset = () => {
    const text = pickDialoguePreset(input.context, input.random);
    return text
      ? { text, source: "preset" as const, providerAttempted: false }
      : { text: null, source: "silence" as const, providerAttempted: false };
  };

  if (!input.aiEnabled || !input.apiKey) return preset();

  const fetchImpl = input.fetchImpl ?? fetch;
  const model = input.model?.trim() || DEFAULT_GEMINI_DIALOGUE_MODEL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_DIALOGUE_TIMEOUT_MS);

  try {
    const response = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": input.apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: buildGeminiPrompt(input.context) }] }],
          generationConfig: {
            thinkingConfig: { thinkingLevel: "low" },
            maxOutputTokens: GEMINI_DIALOGUE_MAX_OUTPUT_TOKENS,
            temperature: input.context.intensity === "chaos" ? 1.0 : input.context.intensity === "normal" ? 0.8 : 0.6,
          },
        }),
      },
    );

    if (!response.ok) {
      const fallback = preset();
      return { ...fallback, providerAttempted: true, providerReason: `http-${response.status}` };
    }

    const payload = (await response.json()) as GeminiResponse;
    const candidate = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? "";
    const validated = validateDialogueOutput(candidate, input.context.profanityEnabled);
    if (!validated.ok || !validated.text) {
      const fallback = preset();
      return { ...fallback, providerAttempted: true, providerReason: validated.reason ?? "invalid-output" };
    }

    return { text: validated.text, source: "gemini", providerAttempted: true };
  } catch (error) {
    const fallback = preset();
    return {
      ...fallback,
      providerAttempted: true,
      providerReason: error instanceof DOMException && error.name === "AbortError" ? "timeout" : "network-error",
    };
  } finally {
    clearTimeout(timeout);
  }
}
