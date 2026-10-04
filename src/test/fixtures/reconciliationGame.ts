import { CANONICAL_BOTS } from '../../../supabase/functions/_shared/bot-catalog';
import { createInitialDealerBootstrapState, resolveDealerBootstrapAndInitializeDealOne } from '@/domain/dealerBootstrap';
import type { CanonicalGameState } from '@/domain/gameState';

export function reconciliationFixture(): CanonicalGameState {
  const bots = [CANONICAL_BOTS[0]!, CANONICAL_BOTS[2]!, CANONICAL_BOTS[4]!, CANONICAL_BOTS[5]!];
  return resolveDealerBootstrapAndInitializeDealOne({
    state: createInitialDealerBootstrapState({
      gameId: '00000000-0000-4000-8000-000000000201',
      roomId: '00000000-0000-4000-8000-000000000202',
      bootstrapActionId: '00000000-0000-5000-8000-000000000203',
      serverEntropySeed: 'ab'.repeat(32),
      seats: bots.map((bot, seatIndex) => ({
        seatIndex, connected: false,
        owner: { type: 'bot', botId: bot.id, displayName: bot.displayName, personalityId: bot.personalityId, strategyProfileId: bot.strategyProfileId, catalogVersion: bot.catalogVersion },
      })) as Parameters<typeof createInitialDealerBootstrapState>[0]['seats'],
    }),
    firstRecipientRandom: () => 0.125,
    selectionShuffleRandom: () => 0.314159,
    dealOneShuffleRandom: () => 0.271828,
    serverNow: new Date().toISOString(),
  });
}
