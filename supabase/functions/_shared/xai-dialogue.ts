import {
  buildDialoguePrompt,
  dialogueLineTooSimilar,
  pickDialoguePreset,
  validateDialogueOutput,
  type DialogueGenerationContext,
} from "./dialogue-core.ts";

export const DEFAULT_XAI_DIALOGUE_MODEL = "grok-4.3";
export const XAI_DIALOGUE_TIMEOUT_MS = 3_000;
export const XAI_DIALOGUE_MAX_OUTPUT_TOKENS = 96;

export interface DialogueGenerationResult {
  text: string | null;
  source: "xai" | "preset" | "silence";
  providerAttempted: boolean;
  providerReason?: string;
}

interface XaiResponse {
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
}

function responseText(payload: XaiResponse): string {
  for (const item of payload.output ?? []) {
    if (item.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text.trim();
      }
    }
  }
  return "";
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
  const model = input.model?.trim() || DEFAULT_XAI_DIALOGUE_MODEL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), XAI_DIALOGUE_TIMEOUT_MS);

  try {
    const response = await fetchImpl("https://api.x.ai/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        store: false,
        reasoning: { effort: "none" },
        max_output_tokens: XAI_DIALOGUE_MAX_OUTPUT_TOKENS,
        prompt_cache_key: `joker-banter-v2:${input.context.botId}`,
        input: [{ role: "user", content: buildDialoguePrompt(input.context) }],
      }),
    });

    if (!response.ok) {
      const fallback = preset();
      return { ...fallback, providerAttempted: true, providerReason: `http-${response.status}` };
    }

    const payload = (await response.json()) as XaiResponse;
    const candidate = responseText(payload);
    const validated = validateDialogueOutput(candidate, input.context.profanityEnabled);
    if (!validated.ok || !validated.text) {
      const fallback = preset();
      return {
        ...fallback,
        providerAttempted: true,
        providerReason: validated.reason ?? "invalid-output",
      };
    }
    if (dialogueLineTooSimilar(validated.text, input.context.recentBanter)) {
      const fallback = preset();
      return {
        ...fallback,
        providerAttempted: true,
        providerReason: "near-duplicate",
      };
    }

    return { text: validated.text, source: "xai", providerAttempted: true };
  } catch (error) {
    const fallback = preset();
    return {
      ...fallback,
      providerAttempted: true,
      providerReason:
        error instanceof DOMException && error.name === "AbortError" ? "timeout" : "network-error",
    };
  } finally {
    clearTimeout(timeout);
  }
}
