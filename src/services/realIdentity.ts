import { supabase } from '@/integrations/supabase/client';
import type { PublicPlayer } from '@/domain/players';
import type { IdentityService, PlayerSession } from './identity';
import { verifyPlayerPin } from './identity.server';

const mapPlayer = (p: { id: string; display_name: string; is_host: boolean }): PublicPlayer => ({
  id: p.id,
  displayName: p.display_name,
  role: p.is_host ? 'host' : 'player',
});

export const realIdentityService: IdentityService = {
  async listPlayers(): Promise<PublicPlayer[]> {
    const { data, error } = await supabase.rpc('list_active_players');
    if (error) throw error;
    return (data ?? []).map(mapPlayer);
  },

  async verifyPin(playerId: string, pin: string): Promise<PlayerSession | null> {
    const result = await verifyPlayerPin({ data: { playerId, pin } });
    if (!result) return null;
    return { player: result.player, token: `verified:${result.player.id}` };
  },
};
