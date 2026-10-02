import { createServerFn } from '@tanstack/react-start';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '@/integrations/supabase/types';

const verifyInput = z.object({
  playerId: z.string().uuid(),
  pin: z.string().regex(/^\d{4}$/),
});

function serverClient() {
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_PUBLISHABLE_KEY'];
  if (!url || !key) throw new Error('Missing external Joker Supabase server environment');
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const verifyPlayerPin = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => verifyInput.parse(data))
  .handler(async ({ data }) => {
    const { data: rows, error } = await serverClient().rpc('verify_player_pin', {
      p_player_id: data.playerId,
      p_pin: data.pin,
    });
    if (error || !rows?.length) return null;
    const player = rows[0];
    return {
      player: {
        id: player.id,
        displayName: player.display_name,
        role: player.is_host ? 'host' as const : 'player' as const,
      },
    };
  });
