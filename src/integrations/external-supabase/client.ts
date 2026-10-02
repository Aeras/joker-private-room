/**
 * The ONLY backend client of this app: the owner's external Supabase project.
 * Lovable Cloud (src/integrations/supabase/*) is auto-generated and must not be imported.
 * URL + publishable key are public values and safe in client code.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const EXTERNAL_SUPABASE_URL = "https://wubrgnzbvtrzbvvqalfw.supabase.co";
export const EXTERNAL_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_H87jN4yJmozkeoLpbJY1bA_elzCv8M5";

// New sb_ keys are opaque (not JWTs): send as apikey, never as a Bearer token.
function keyFetch(key: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    if (headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
}

let _client: SupabaseClient | undefined;

export function getBackend(): SupabaseClient {
  if (!_client) {
    const isBrowser = typeof window !== "undefined";
    _client = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_PUBLISHABLE_KEY, {
      global: { fetch: keyFetch(EXTERNAL_SUPABASE_PUBLISHABLE_KEY) },
      auth: { persistSession: isBrowser, autoRefreshToken: isBrowser },
    });
  }
  return _client;
}
