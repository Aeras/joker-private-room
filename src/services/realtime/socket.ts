import { createClient } from "@supabase/supabase-js";
import {
  EXTERNAL_SUPABASE_URL,
  EXTERNAL_SUPABASE_PUBLISHABLE_KEY,
} from "@/integrations/external-supabase/client";
import { REALTIME_EVENT, type RealtimeCapability } from "./protocol";
import type { ReceiveConnection } from "./lifecycle";
/** Dedicated ephemeral client: never changes PIN auth or another feature's socket/token. */
export async function openReceiveSocket(
  capability: RealtimeCapability,
  message: (payload: unknown) => void,
  status: (value: string) => void,
): Promise<ReceiveConnection> {
  let accessToken: string | null = capability.token;
  const client = createClient(EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_PUBLISHABLE_KEY, {
    accessToken: async () => accessToken,
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  await client.realtime.setAuth(capability.token);
  const channel = client.channel(capability.topic, {
    config: { private: true, broadcast: { self: false } },
  });
  channel
    .on("broadcast", { event: REALTIME_EVENT }, (envelope) => message(envelope["payload"]))
    .subscribe(status);
  let closed = false;
  return {
    close() {
      if (closed) return;
      closed = true;
      accessToken = null;
      void client.removeAllChannels().catch(() => undefined);
      client.realtime.disconnect();
    },
  };
}
