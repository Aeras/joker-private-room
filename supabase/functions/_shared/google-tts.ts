import type { CanonicalBotId } from "./bot-catalog.ts";

export interface BotTtsProfile {
  languageCode: "el-GR";
  voiceName: string;
}

export const BOT_TTS_PROFILES: Record<CanonicalBotId, BotTtsProfile> = {
  "giorgos-nousios": { languageCode: "el-GR", voiceName: "el-GR-Chirp3-HD-Orus" },
  "thomoulis": { languageCode: "el-GR", voiceName: "el-GR-Chirp3-HD-Puck" },
  "theia-tamara": { languageCode: "el-GR", voiceName: "el-GR-Chirp3-HD-Gacrux" },
  "mounara": { languageCode: "el-GR", voiceName: "el-GR-Chirp3-HD-Aoede" },
  "ka-monika": { languageCode: "el-GR", voiceName: "el-GR-Chirp3-HD-Kore" },
  "archimandritis": { languageCode: "el-GR", voiceName: "el-GR-Chirp3-HD-Rasalgethi" },
};

interface GoogleServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

const TTS_TIMEOUT_MS = 6_000;
const OAUTH_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlText(value: string): string {
  return base64Url(new TextEncoder().encode(value));
}

function pemToDer(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function accessToken(serviceAccount: GoogleServiceAccount, fetchImpl: typeof fetch): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlText(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64UrlText(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: OAUTH_SCOPE,
    aud: serviceAccount.token_uri ?? "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claim}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  ));
  const assertion = `${unsigned}.${base64Url(signature)}`;

  const response = await fetchImpl(serviceAccount.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) throw new Error(`google-oauth-${response.status}`);
  const payload = await response.json() as { access_token?: string };
  if (!payload.access_token) throw new Error("google-oauth-missing-token");
  return payload.access_token;
}

export async function synthesizeBotSpeech(input: {
  botId: CanonicalBotId;
  text: string;
  serviceAccountJson?: string;
  fetchImpl?: typeof fetch;
}): Promise<{ audioContent: string; mimeType: "audio/mpeg"; voiceName: string } | null> {
  if (!input.serviceAccountJson) return null;
  const profile = BOT_TTS_PROFILES[input.botId];
  if (!profile) return null;

  let account: GoogleServiceAccount;
  try {
    account = JSON.parse(input.serviceAccountJson) as GoogleServiceAccount;
  } catch {
    return null;
  }
  if (!account.client_email || !account.private_key) return null;

  const fetchImpl = input.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);
  try {
    const token = await accessToken(account, fetchImpl);
    const response = await fetchImpl("https://texttospeech.googleapis.com/v1/text:synthesize", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: { text: input.text },
        voice: {
          languageCode: profile.languageCode,
          name: profile.voiceName,
        },
        audioConfig: { audioEncoding: "MP3" },
      }),
    });
    if (!response.ok) {
      console.error("google-tts-failed", { status: response.status, botId: input.botId, voiceName: profile.voiceName });
      return null;
    }
    const payload = await response.json() as { audioContent?: string };
    if (!payload.audioContent) return null;
    return { audioContent: payload.audioContent, mimeType: "audio/mpeg", voiceName: profile.voiceName };
  } catch (error) {
    console.error("google-tts-failed", {
      botId: input.botId,
      reason: error instanceof DOMException && error.name === "AbortError" ? "timeout" : "error",
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
