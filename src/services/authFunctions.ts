import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { z } from "zod";

import type { PublicPlayer } from "@/domain/players";
import {
  EXTERNAL_SUPABASE_PUBLISHABLE_KEY,
  EXTERNAL_SUPABASE_URL,
} from "@/integrations/external-supabase/client";

const SESSION_COOKIE = "__Host-joker_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24;

export type AuthFailureCode =
  | "INVALID_CREDENTIALS"
  | "PIN_COOLDOWN_ACTIVE"
  | "SECOND_ACTIVE_CONNECTION"
  | "SESSION_EXPIRED"
  | "SERVICE_UNAVAILABLE";

export type AuthenticateResult =
  | { ok: true; player: PublicPlayer }
  | { ok: false; code: AuthFailureCode; retryAfterSeconds?: number };

type EdgePayload = {
  player?: PublicPlayer;
  sessionToken?: string | null;
  reuseSession?: boolean;
  code?: AuthFailureCode;
  retryAfterSeconds?: number | null;
};

function setSessionCookie(token: string) {
  setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

function clearSessionCookie() {
  setCookie(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

async function callAuthEdge(body: Record<string, unknown>) {
  const response = await fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/verify-player-pin`, {
    method: "POST",
    headers: {
      apikey: EXTERNAL_SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  let payload: EdgePayload = {};
  try {
    payload = (await response.json()) as EdgePayload;
  } catch {
    // Keep a stable service-level failure if the backend returns malformed data.
  }

  return { response, payload };
}

export const authenticatePlayer = createServerFn({ method: "POST" })
  .validator(
    z.object({
      playerId: z.string().uuid(),
      pin: z.string().regex(/^\d{4}$/),
    }),
  )
  .handler(async ({ data }): Promise<AuthenticateResult> => {
    try {
      const currentSessionToken = getCookie(SESSION_COOKIE) ?? null;
      const { response, payload } = await callAuthEdge({
        action: "authenticate",
        playerId: data.playerId,
        pin: data.pin,
        currentSessionToken,
      });

      if (!response.ok || !payload.player) {
        return {
          ok: false,
          code: payload.code ?? "SERVICE_UNAVAILABLE",
          ...(typeof payload.retryAfterSeconds === "number"
            ? { retryAfterSeconds: payload.retryAfterSeconds }
            : {}),
        };
      }

      if (payload.sessionToken) {
        if (!/^[0-9a-f]{64}$/i.test(payload.sessionToken)) {
          return { ok: false, code: "SERVICE_UNAVAILABLE" };
        }
        setSessionCookie(payload.sessionToken);
      } else if (!payload.reuseSession || !currentSessionToken) {
        return { ok: false, code: "SERVICE_UNAVAILABLE" };
      }

      return { ok: true, player: payload.player };
    } catch {
      return { ok: false, code: "SERVICE_UNAVAILABLE" };
    }
  });

export const getCurrentPlayer = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicPlayer | null> => {
    const token = getCookie(SESSION_COOKIE);
    if (!token) return null;

    try {
      const { response, payload } = await callAuthEdge({ action: "validate", sessionToken: token });
      if (!response.ok || !payload.player) {
        clearSessionCookie();
        return null;
      }
      return payload.player;
    } catch {
      return null;
    }
  },
);

export const logoutPlayer = createServerFn({ method: "POST" }).handler(async () => {
  const token = getCookie(SESSION_COOKIE);
  try {
    if (token) await callAuthEdge({ action: "revoke", sessionToken: token });
  } finally {
    clearSessionCookie();
  }
  return { ok: true } as const;
});
