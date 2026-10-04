import { CANONICAL_BOTS } from '../../../supabase/functions/_shared/bot-catalog';
import { createInitialDealerBootstrapState, resolveDealerBootstrapAndInitializeDealOne } from '@/domain/dealerBootstrap';
import type { CanonicalGameState } from '@/domain/gameState';

export function reconciliationFixture(rulesetId: import("@/domain/rulesets").RulesetId = "popular", targetPresent = false): CanonicalGameState {
  const bots = [CANONICAL_BOTS[0]!, CANONICAL_BOTS[2]!, CANONICAL_BOTS[4]!, CANONICAL_BOTS[5]!];
  const state = resolveDealerBootstrapAndInitializeDealOne({
    state: createInitialDealerBootstrapState({
      gameId: '00000000-0000-4000-8000-000000000201',
      roomId: '00000000-0000-4000-8000-000000000202',
      rulesetId,
      rulesVersion: rulesetId + '-v1' as import("@/domain/rulesets").RulesVersion,
      targetPlayerId: '12302475-c4da-491c-9081-08c039384ac1',
      bootstrapActionId: '00000000-0000-5000-8000-000000000203',
      serverEntropySeed: 'ab'.repeat(32),
      seats: bots.map((bot, seatIndex) => ({
        seatIndex, connected: false,
        owner: targetPresent && seatIndex === 1 ? { type: 'human', playerId: '12302475-c4da-491c-9081-08c039384ac1' } : { type: 'bot', botId: bot.id, displayName: bot.displayName, personalityId: bot.personalityId, strategyProfileId: bot.strategyProfileId, catalogVersion: bot.catalogVersion },
      })) as Parameters<typeof createInitialDealerBootstrapState>[0]['seats'],
    }),
    firstRecipientRandom: () => 0.125,
    selectionShuffleRandom: () => 0.314159,
    dealOneShuffleRandom: () => 0.271828,
    serverNow: new Date().toISOString(),
  });
  if (targetPresent) { state.seats[1].controller = 'temporary_bot'; state.seats[1].reclaimable = true; state.timing.currentHumanDeadline = null; }
  return state;
}
