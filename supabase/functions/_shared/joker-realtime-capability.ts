/** Portable broker core; only game-state's service-role gateway invokes it. */
export interface CapabilityAuthorization {
  playerId: string;
  sessionId: string;
  expiresAt: string;
}
export interface CapabilityBrokerDependencies {
  enabled: boolean;
  now(): number;
  authorize(sessionToken: string, gameId: string): Promise<CapabilityAuthorization | null>;
  sign(claims: Record<string, string | number>): Promise<string>;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function issueRealtimeCapability(
  sessionToken: string,
  gameId: string,
  deps: CapabilityBrokerDependencies,
) {
  if (!deps.enabled) return { ok: false as const, code: "DISABLED" as const };
  if (!/^[0-9a-f]{64}$/i.test(sessionToken))
    return { ok: false as const, code: "NOT_AUTHENTICATED" as const };
  if (!uuid.test(gameId)) return { ok: false as const, code: "NOT_MEMBER" as const };
  try {
    const identity = await deps.authorize(sessionToken, gameId);
    if (!identity || !uuid.test(identity.playerId) || !uuid.test(identity.sessionId))
      return { ok: false as const, code: "NOT_MEMBER" as const };
    const now = Math.floor(deps.now() / 1000);
    const exp = Math.min(now + 90, Math.floor(Date.parse(identity.expiresAt) / 1000));
    if (!Number.isFinite(exp) || exp <= now + 5)
      return { ok: false as const, code: "NOT_AUTHENTICATED" as const };
    const topic = `joker:v1:${gameId}:${identity.sessionId}`;
    const token = await deps.sign({
      sub: identity.playerId,
      role: "authenticated",
      aud: "authenticated",
      iat: now,
      exp,
      jkr_scope: "receive",
      jkr_game_id: gameId,
      jkr_session_id: identity.sessionId,
      jkr_topic: topic,
    });
    return { ok: true as const, capability: { gameId, token, topic, expiresAt: exp * 1000 } };
  } catch {
    return { ok: false as const, code: "UNAVAILABLE" as const };
  }
}
function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}
/** Explicit imported key only. Never derives a signing key from service-role credentials. */
export async function signRealtimeJwt(
  claims: Record<string, string | number>,
  key: JsonWebKey,
  kid: string,
  issuer: string,
): Promise<string> {
  if (
    key.kty !== "EC" ||
    key.crv !== "P-256" ||
    !key.d ||
    !kid ||
    !issuer ||
    (key.alg != null && key.alg !== "ES256")
  )
    throw new Error("INVALID_SIGNING_CONFIGURATION");
  const encoder = new TextEncoder();
  const input =
    base64url(encoder.encode(JSON.stringify({ alg: "ES256", typ: "JWT", kid }))) +
    "." +
    base64url(encoder.encode(JSON.stringify({ ...claims, iss: issuer })));
  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    key,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    encoder.encode(input),
  );
  return input + "." + base64url(new Uint8Array(signature));
}
