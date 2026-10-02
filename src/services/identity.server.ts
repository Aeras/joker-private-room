import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

const verifyInput = z.object({
  playerId: z.string().uuid(),
  pin: z.string().regex(/^\d{4}$/),
});

export const verifyPlayerPin = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => verifyInput.parse(data))
  .handler(async ({ data }) => {
    const { data: result, error } = await supabaseAdmin.rpc('verify_player_pin', {
      p_player_id: data.playerId,
      p_pin: data.pin,
    });

    if (error || !result) return null;
    return result;
  });
