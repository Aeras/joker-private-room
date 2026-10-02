import { supabase } from '@/integrations/supabase/client';
import type { PublicPlayer } from '@/domain/players';
import type { IdentityService, PlayerSession } from './identity';

const mapPlayer = (p: { id: string; display_name: string; is_host: boolean }): PublicPlayer => ({ id: p.id, displayName: p.display_name, role: p.is_host ? 'host' : 'player' });

export const realIdentityService: IdentityService = {
  async listPlayers(): Promise<PublicPlayer[]> {
    const { data, error } = await supabase.rpc('list_active_players');
    if (error) throw error;
    return (data ?? []).map(mapPlayer);
  },
  async verifyPin(playerId: string, pin: string): Promise<PlayerSession | null> {
    if (!/^\d{4}$/.test(pin)) return null;
    const { data, error } = await supabase.functions.invoke('verify-player-pin', { body: { playerId, pin } });
    if (error || !data?.player) return null;
    return { player: data.player as PublicPlayer, token: `verified:${data.player.id}` };
  },
};
