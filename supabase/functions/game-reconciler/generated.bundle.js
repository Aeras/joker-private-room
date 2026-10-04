// supabase/functions/game-reconciler/index.ts
import"jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// src/domain/cards.ts
var SUITS = ["spades", "hearts", "diamonds", "clubs"];
var RANKS = ["6", "7", "8", "9", "10", "J", "Q", "K", "A"];
var RANK_VALUE = Object.fromEntries(RANKS.map((rank, index) => [rank, index]));
var EXCLUDED_CARDS = [
  { suit: "spades", rank: "6" },
  { suit: "clubs", rank: "6" }
];
var JOKER_COUNT = 2;
function cardId(card) {
  return `${card.rank}-${card.suit}`;
}
function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      if (EXCLUDED_CARDS.some((c) => c.suit === suit && c.rank === rank))
        continue;
      deck.push({ kind: "standard", id: cardId({ suit, rank }), suit, rank });
    }
  }
  for (let i = 1;i <= JOKER_COUNT; i += 1) {
    deck.push({ kind: "joker", id: `joker-${i}` });
  }
  return deck;
}
function compareRanks(a, b) {
  return RANK_VALUE[a] - RANK_VALUE[b];
}
function shuffleCards(cards, random) {
  const result = cards.slice();
  for (let i = result.length - 1;i > 0; i -= 1) {
    const sample = random();
    if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
      throw new Error("RNG must return a finite value in [0, 1)");
    }
    const j = Math.floor(sample * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// src/domain/engine.ts
function requireValidJokerPlay(play, index) {
  if (play.card.kind !== "joker") {
    if (play.joker)
      throw new Error("Normal card cannot carry Joker semantics");
    throw new Error("Expected Joker play");
  }
  if (!play.joker)
    throw new Error("Joker play requires semantic metadata");
  if (index === 0 && play.joker.context !== "LEAD") {
    throw new Error("Leading Joker requires LEAD semantics");
  }
  if (index > 0 && play.joker.context !== "OPEN_TRICK") {
    throw new Error("Non-leading Joker requires OPEN_TRICK semantics");
  }
  return play.joker;
}
function requestedSuitForTrick(plays) {
  const lead = plays[0];
  if (!lead)
    return null;
  if (lead.card.kind === "standard")
    return lead.card.suit;
  const semantic = requireValidJokerPlay(lead, 0);
  if (semantic.context !== "LEAD")
    throw new Error("Invalid leading Joker semantic");
  return semantic.requestedSuit;
}
function legalCards(args) {
  const { hand, requestedSuit, trump } = args;
  if (!requestedSuit)
    return hand.slice();
  const jokers = hand.filter((card) => card.kind === "joker");
  const requested = hand.filter((card) => card.kind === "standard" && card.suit === requestedSuit);
  if (requested.length > 0)
    return [...requested, ...jokers];
  if (trump) {
    const trumps = hand.filter((card) => card.kind === "standard" && card.suit === trump);
    if (trumps.length > 0)
      return [...trumps, ...jokers];
  }
  return hand.slice();
}
function legalMoves(view) {
  return legalCards({
    hand: view.hand,
    requestedSuit: requestedSuitForTrick(view.currentTrick),
    trump: view.trump
  });
}
function highestStandard(plays, suit) {
  const candidates = plays.filter((play) => play.card.kind === "standard" && play.card.suit === suit);
  if (candidates.length === 0)
    return null;
  return candidates.reduce((best, play) => {
    if (best.card.kind !== "standard" || play.card.kind !== "standard")
      return best;
    return compareRanks(play.card.rank, best.card.rank) > 0 ? play : best;
  });
}
function lastCompetingJoker(plays) {
  let winner = null;
  plays.forEach((play, index) => {
    if (play.card.kind !== "joker" || index === 0)
      return;
    const semantic = requireValidJokerPlay(play, index);
    if (semantic.context === "OPEN_TRICK" && semantic.mode === "COMPETE")
      winner = play;
  });
  return winner;
}
function standardWinner(args) {
  const { plays, requestedSuit, trump } = args;
  if (trump) {
    const bestTrump = highestStandard(plays, trump);
    if (bestTrump)
      return { play: bestTrump, reason: "NORMAL_TRUMP" };
  }
  const bestRequested = highestStandard(plays, requestedSuit);
  if (!bestRequested)
    throw new Error("No competing standard card for requested suit");
  return { play: bestRequested, reason: "NORMAL_LED_SUIT" };
}
function resolveTrick(args) {
  const { plays, trump } = args;
  if (plays.length !== 4)
    throw new Error("A trick requires exactly four committed plays");
  const seats = new Set(plays.map((play) => play.seatIndex));
  if (seats.size !== 4)
    throw new Error("Each seat must play exactly once");
  plays.forEach((play, index) => {
    if (play.card.kind === "joker")
      requireValidJokerPlay(play, index);
    else if (play.joker)
      throw new Error("Normal card cannot carry Joker semantics");
  });
  const requestedSuit = requestedSuitForTrick(plays);
  if (!requestedSuit)
    throw new Error("Trick has no requested suit");
  const competingJoker = lastCompetingJoker(plays);
  if (competingJoker) {
    return {
      winnerSeat: competingJoker.seatIndex,
      winningPlay: competingJoker,
      nextLeader: competingJoker.seatIndex,
      requestedSuit,
      reason: "COMPETING_JOKER"
    };
  }
  const lead = plays[0];
  if (lead.card.kind === "joker") {
    const semantic = requireValidJokerPlay(lead, 0);
    if (semantic.context !== "LEAD")
      throw new Error("Invalid leading Joker semantic");
    if (semantic.mode === "HIGHER_SUIT") {
      if (trump && semantic.requestedSuit !== trump) {
        const bestTrump = highestStandard(plays, trump);
        if (bestTrump) {
          return {
            winnerSeat: bestTrump.seatIndex,
            winningPlay: bestTrump,
            nextLeader: bestTrump.seatIndex,
            requestedSuit,
            reason: "JOKER_HIGHER_SUIT_TRUMPED"
          };
        }
      }
      return {
        winnerSeat: lead.seatIndex,
        winningPlay: lead,
        nextLeader: lead.seatIndex,
        requestedSuit,
        reason: "JOKER_HIGHER_SUIT"
      };
    }
    const standard = standardWinner({ plays, requestedSuit, trump });
    return {
      winnerSeat: standard.play.seatIndex,
      winningPlay: standard.play,
      nextLeader: standard.play.seatIndex,
      requestedSuit,
      reason: "JOKER_SUIT_WINS"
    };
  }
  const standard = standardWinner({ plays, requestedSuit, trump });
  return {
    winnerSeat: standard.play.seatIndex,
    winningPlay: standard.play,
    nextLeader: standard.play.seatIndex,
    requestedSuit,
    reason: standard.reason
  };
}

// src/domain/projection.ts
function publicSeat(seat) {
  return {
    seatIndex: seat.seatIndex,
    owner: seat.owner,
    controller: seat.controller,
    connected: seat.connected
  };
}
function publicDealerSelection(state) {
  const selection = state.initialDealerSelection;
  if (!selection)
    return null;
  if (selection.status === "pending")
    return { status: "pending" };
  return {
    status: "resolved",
    firstRecipientSeat: selection.firstRecipientSeat,
    revealedSelectionCards: selection.revealedSelectionCards.slice(),
    selectedDealerSeat: selection.selectedDealerSeat,
    resolvedAtStateVersion: selection.resolvedAtStateVersion
  };
}
function visibleOwnHand(state, seat) {
  if (state.progression.phase === "INITIAL_DEALER_SELECTION")
    return { hand: [], visible: false };
  if (!state.cards.hiddenPartialNineCardHands)
    return { hand: state.cards.hands[seat].slice(), visible: true };
  if (state.trump.status === "chooser_pending" && state.trump.chooserSeat === seat) {
    return { hand: state.cards.hands[seat].slice(), visible: true };
  }
  return { hand: [], visible: false };
}
function resolvedTrump(state) {
  return state.trump.status === "resolved" ? state.trump.suit : null;
}
function playerView(state, seat, hand) {
  return {
    seatIndex: seat,
    hand,
    cardsPerPlayer: state.progression.cardsPerPlayer,
    trump: resolvedTrump(state),
    declarations: Array.from(state.declarations.declarations),
    tricksTaken: Array.from(state.score.tricksTaken),
    currentTrick: state.cards.currentTrick.slice(),
    history: { completedTricks: state.cards.completedTricks.slice() }
  };
}
function jokerOptions(state) {
  if (state.cards.currentTrick.length === 0) {
    return SUITS.flatMap((requestedSuit) => [
      { context: "LEAD", mode: "HIGHER_SUIT", requestedSuit },
      { context: "LEAD", mode: "SUIT_WINS", requestedSuit }
    ]);
  }
  return [
    { context: "OPEN_TRICK", mode: "COMPETE" },
    { context: "OPEN_TRICK", mode: "FROM_BELOW" }
  ];
}
function localLegalActions(state, seat, visibleHand) {
  const actions = [];
  if (state.progression.phase === "DECLARATION" && state.declarations.currentDeclarerSeat === seat) {
    actions.push({ type: "declare", values: state.declarations.legalValues.slice() });
  }
  if (state.progression.phase === "NINE_CARD_TRUMP_CHOICE" && state.trump.status === "chooser_pending" && state.trump.chooserSeat === seat) {
    actions.push({ type: "choose_trump", suits: [...SUITS, null] });
  }
  if (state.progression.phase === "CARD_PLAY" && state.progression.currentActorSeat === seat && visibleHand.length > 0) {
    actions.push({ type: "play_card", cardIds: legalMoves(playerView(state, seat, visibleHand)).map((card) => card.id) });
  }
  if (state.progression.phase === "JOKER_DECISION" && state.joker.pendingForSeat === seat) {
    actions.push({ type: "choose_joker_semantic", options: jokerOptions(state) });
  }
  const localSeat = state.seats[seat];
  if (localSeat.owner.type === "human" && localSeat.reclaimable)
    actions.push({ type: "reclaim_control" });
  return actions;
}
function projectGameForSeat(state, seat) {
  if (state.seats[seat]?.seatIndex !== seat)
    throw new Error("Projection seat does not exist");
  const own = visibleOwnHand(state, seat);
  return {
    gameId: state.gameId,
    roomId: state.roomId,
    rulesetId: state.rulesetId,
    rulesVersion: state.rulesVersion,
    stateSchemaVersion: state.stateSchemaVersion,
    stateVersion: state.stateVersion,
    lifecycle: state.lifecycle,
    viewerSeat: seat,
    progression: { ...state.progression },
    initialDealerSelection: publicDealerSelection(state),
    seats: state.seats.map(publicSeat),
    trump: { ...state.trump },
    declarations: {
      currentDeclarerSeat: state.declarations.currentDeclarerSeat,
      values: [...state.declarations.declarations]
    },
    cards: {
      ownHand: own.hand,
      ownHandVisible: own.visible,
      exposedTrumpCard: state.cards.exposedTrumpCard,
      currentTrick: state.cards.currentTrick.map((play) => ({ ...play, card: { ...play.card } })),
      completedTricks: state.cards.completedTricks.map((trick) => ({
        winnerSeat: trick.winnerSeat,
        cards: trick.cards.map((play) => ({ ...play, card: { ...play.card } }))
      }))
    },
    score: {
      tricksTaken: [...state.score.tricksTaken],
      currentDealScores: [...state.score.currentDealScores],
      cumulativeTotals: [...state.score.cumulativeTotals],
      finalPlacements: [...state.score.finalPlacements],
      completedDeals: (state.score.completedDeals ?? []).map((record) => ({
        ...record,
        declarations: [...record.declarations],
        tricksTaken: [...record.tricksTaken],
        dealScores: [...record.dealScores],
        totalsAfterDeal: [...record.totalsAfterDeal]
      })),
      roundPremia: (state.score.roundPremia ?? []).map((record) => ({
        ...record,
        qualified: [...record.qualified],
        adjustments: [...record.adjustments],
        transfers: record.transfers.map((transfer) => ({ ...transfer })),
        totalsAfterPremia: [...record.totalsAfterPremia]
      }))
    },
    timing: {
      currentHumanDeadline: state.timing.currentHumanDeadline
    },
    local: {
      legalActions: localLegalActions(state, seat, own.hand),
      reclaimAvailable: state.seats[seat].owner.type === "human" && state.seats[seat].reclaimable,
      humanDeadline: state.progression.currentActorSeat === seat ? state.timing.currentHumanDeadline : null
    }
  };
}

// src/domain/controller.ts
var HUMAN_TURN_TIMEOUT_MS = 30000;
var MAX_SYNCHRONOUS_BOT_STEPS = 32;
function parseServerTime(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function humanDeadlineFromServerTime(serverNow) {
  const now = parseServerTime(serverNow);
  if (now == null)
    throw new Error("Invalid server time");
  return new Date(now + HUMAN_TURN_TIMEOUT_MS).toISOString();
}
function isHumanDeadlineOverdue(state, serverNow) {
  const now = parseServerTime(serverNow);
  if (now == null)
    return false;
  const deadline = state.timing.currentHumanDeadline;
  if (!deadline)
    return false;
  const deadlineMs = Date.parse(deadline);
  return Number.isFinite(deadlineMs) && deadlineMs <= now;
}
function applyOverdueTimeout(state, serverNow) {
  if (parseServerTime(serverNow) == null)
    return { ok: false, code: "INVALID_SERVER_TIME" };
  if (state.lifecycle !== "active" || !isHumanDeadlineOverdue(state, serverNow)) {
    return { ok: true, changed: false, state };
  }
  const actor = state.progression.currentActorSeat;
  if (actor == null)
    return { ok: true, changed: false, state };
  const seat = state.seats[actor];
  if (seat.owner.type !== "human" || seat.controller !== "human") {
    return { ok: true, changed: false, state };
  }
  const seats = state.seats.map((item) => ({ ...item }));
  seats[actor] = {
    ...seats[actor],
    controller: "temporary_bot",
    takeoverAt: serverNow,
    reclaimable: true
  };
  return {
    ok: true,
    changed: true,
    state: {
      ...state,
      stateVersion: state.stateVersion + 1,
      seats,
      timing: {
        currentHumanDeadline: null,
        timeoutTakeoverActive: true
      }
    }
  };
}

// src/lib/stableFingerprint.ts
function stableNormalize(value) {
  if (Array.isArray(value))
    return value.map(stableNormalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stableNormalize(child)]));
  }
  return value;
}
function stableJson(value) {
  return JSON.stringify(stableNormalize(value));
}
async function fingerprintJson(value) {
  const bytes = new TextEncoder().encode(stableJson(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// src/server/internalDeterminism.ts
var UINT32_RANGE = 4294967296;
async function digest(input) {
  const bytes = new TextEncoder().encode(input);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}
async function stableInternalActionId(gameId, label) {
  const bytes = (await digest(`jk001:${label}:${gameId}`)).slice(0, 16);
  bytes[6] = bytes[6] & 15 | 80;
  bytes[8] = bytes[8] & 63 | 128;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
async function deterministicRandomUnitsFromSeed(seedHex, label, count) {
  if (!/^[0-9a-f]{64}$/i.test(seedHex))
    throw new Error("Invalid private entropy seed");
  if (!Number.isInteger(count) || count < 1)
    throw new Error("count must be a positive integer");
  const result = [];
  let counter = 0;
  while (result.length < count) {
    const bytes = await digest(`jk001-private:${seedHex.toLowerCase()}:${label}:${counter}`);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let offset = 0;offset + 4 <= bytes.byteLength && result.length < count; offset += 4) {
      result.push(view.getUint32(offset, false) / UINT32_RANGE);
    }
    counter += 1;
  }
  return result;
}
function randomIterator(values) {
  let index = 0;
  return () => {
    const value = values[index];
    if (value == null)
      throw new Error("Deterministic random stream exhausted");
    index += 1;
    return value;
  };
}

// src/domain/gameConfig.ts
var SEAT_COUNT = 4;
var GAME_PHASES = [
  { phase: 1, deals: [1, 2, 3, 4, 5, 6, 7, 8] },
  { phase: 2, deals: [9, 9, 9, 9] },
  { phase: 3, deals: [8, 7, 6, 5, 4, 3, 2, 1] },
  { phase: 4, deals: [9, 9, 9, 9] }
];
var DEALS = GAME_PHASES.flatMap((p, pi) => p.deals.map((cards, i) => ({
  dealNumber: GAME_PHASES.slice(0, pi).reduce((n, x) => n + x.deals.length, 0) + i + 1,
  phase: p.phase,
  indexInPhase: i + 1,
  cardsPerPlayer: cards
})));
var TOTAL_DEALS = DEALS.length;
var dealsOfPhase = (phase) => DEALS.filter((d) => d.phase === phase);

// src/domain/dealing.ts
function assertSeatIndex(value) {
  if (!Number.isInteger(value) || value < 0 || value >= SEAT_COUNT) {
    throw new Error(`Invalid seat index: ${value}`);
  }
}
function nextSeat(seat, offset = 1) {
  assertSeatIndex(seat);
  const normalized = (offset % SEAT_COUNT + SEAT_COUNT) % SEAT_COUNT;
  return (seat + normalized) % SEAT_COUNT;
}
function emptyHands() {
  return [[], [], [], []];
}
function cloneHands(hands) {
  if (!hands)
    return emptyHands();
  return [hands[0].slice(), hands[1].slice(), hands[2].slice(), hands[3].slice()];
}
function dealCards(deck, dealerSeat, cardsPerSeat, cursor = 0, existingHands) {
  if (!Number.isInteger(cardsPerSeat) || cardsPerSeat < 0) {
    throw new Error("cardsPerSeat must be a non-negative integer");
  }
  if (!Number.isInteger(cursor) || cursor < 0 || cursor > deck.length) {
    throw new Error("Invalid deck cursor");
  }
  const hands = cloneHands(existingHands);
  let nextCursor = cursor;
  const firstSeat = nextSeat(dealerSeat);
  for (let round = 0;round < cardsPerSeat; round += 1) {
    for (let offset = 0;offset < SEAT_COUNT; offset += 1) {
      const card = deck[nextCursor];
      if (!card)
        throw new Error("Deck exhausted during deal");
      const seat = nextSeat(firstSeat, offset);
      hands[seat].push(card);
      nextCursor += 1;
    }
  }
  return { hands, cursor: nextCursor };
}
function trumpFromReveal(card) {
  return card.kind === "standard" ? card.suit : null;
}
function dealWithTrumpReveal(deck, dealerSeat, cardsPerSeat) {
  if (cardsPerSeat < 1 || cardsPerSeat > 8) {
    throw new Error("Trump-reveal deals must contain 1..8 cards per seat");
  }
  const dealt = dealCards(deck, dealerSeat, cardsPerSeat);
  const revealedTrumpCard = deck[dealt.cursor];
  if (!revealedTrumpCard)
    throw new Error("Missing trump reveal card");
  return {
    ...dealt,
    revealedTrumpCard,
    trump: trumpFromReveal(revealedTrumpCard)
  };
}
function dealNineCardInitial(deck, dealerSeat) {
  return dealCards(deck, dealerSeat, 3);
}
function completeNineCardDeal(deck, dealerSeat, initial) {
  if (initial.cursor !== 12 || initial.hands.some((hand) => hand.length !== 3)) {
    throw new Error("Invalid nine-card initial deal state");
  }
  const completed = dealCards(deck, dealerSeat, 6, initial.cursor, initial.hands);
  if (completed.cursor !== 36 || completed.hands.some((hand) => hand.length !== 9)) {
    throw new Error("Invalid completed nine-card deal state");
  }
  return completed;
}

// src/domain/declarations.ts
function declarationOrder(dealerSeat) {
  return [
    nextSeat(dealerSeat, 1),
    nextSeat(dealerSeat, 2),
    nextSeat(dealerSeat, 3),
    dealerSeat
  ];
}
function nextDeclarer(dealerSeat, declarations) {
  return declarationOrder(dealerSeat).find((seat) => declarations[seat] == null) ?? null;
}
function legalDeclarationValues(args) {
  const { cardsPerPlayer, dealerSeat, seatIndex, declarations } = args;
  if (!Number.isInteger(cardsPerPlayer) || cardsPerPlayer < 1 || cardsPerPlayer > 9) {
    throw new Error("cardsPerPlayer must be an integer from 1 to 9");
  }
  const expected = nextDeclarer(dealerSeat, declarations);
  if (expected !== seatIndex)
    return [];
  const values = Array.from({ length: cardsPerPlayer + 1 }, (_, value) => value);
  if (seatIndex !== dealerSeat)
    return values;
  const others = declarations.filter((_, index) => index !== dealerSeat);
  if (others.some((value) => value == null))
    return [];
  const declaredByOthers = others.reduce((sum, value) => sum + (value ?? 0), 0);
  const forbidden = cardsPerPlayer - declaredByOthers;
  return values.filter((value) => value !== forbidden);
}
function applyDeclaration(args) {
  const legal = legalDeclarationValues(args);
  if (!legal.includes(args.declared)) {
    throw new Error("Illegal declaration");
  }
  const next = args.declarations.slice();
  next[args.seatIndex] = args.declared;
  return next;
}
function declarationsAreComplete(declarations) {
  return declarations.length === SEAT_COUNT && declarations.every((value) => value != null);
}

// src/domain/gameplayCommands.ts
function validServerTime(value) {
  return Number.isFinite(Date.parse(value));
}
function resolvedTrump2(state) {
  if (state.trump.status !== "resolved")
    throw new Error("Trump is not resolved");
  return state.trump.suit;
}
function playerView2(state, seat) {
  return {
    seatIndex: seat,
    hand: state.cards.hands[seat].slice(),
    cardsPerPlayer: state.progression.cardsPerPlayer,
    trump: resolvedTrump2(state),
    declarations: Array.from(state.declarations.declarations),
    tricksTaken: Array.from(state.score.tricksTaken),
    currentTrick: state.cards.currentTrick.slice(),
    history: { completedTricks: state.cards.completedTricks.slice() }
  };
}
function timeoutActiveForActor(state, actor) {
  return actor != null && state.seats[actor].controller === "temporary_bot";
}
function timingForActor(state, actor, serverNow, preserveDeadline = false) {
  if (actor == null)
    return { currentHumanDeadline: null, timeoutTakeoverActive: false };
  const controller = state.seats[actor].controller;
  return {
    currentHumanDeadline: controller === "human" ? preserveDeadline && state.progression.currentActorSeat === actor ? state.timing.currentHumanDeadline : humanDeadlineFromServerTime(serverNow) : null,
    timeoutTakeoverActive: timeoutActiveForActor(state, actor)
  };
}
function forbiddenDealerValue(state, seat) {
  const dealerSeat = state.progression.dealerSeat;
  if (dealerSeat == null || seat !== dealerSeat)
    return null;
  const others = state.declarations.declarations.filter((_, index) => index !== seat);
  if (others.some((value) => value == null))
    return null;
  const sum = others.reduce((total, value) => total + (value ?? 0), 0);
  const forbidden = state.progression.cardsPerPlayer - sum;
  return forbidden >= 0 && forbidden <= state.progression.cardsPerPlayer ? forbidden : null;
}
function applyDeclarationCommand(state, seat, value, serverNow) {
  if (state.progression.phase !== "DECLARATION")
    return { ok: false, code: "WRONG_PHASE" };
  const dealerSeat = state.progression.dealerSeat;
  const firstLeaderSeat = state.progression.firstLeaderSeat;
  if (dealerSeat == null || firstLeaderSeat == null) {
    return { ok: false, code: "INTERNAL_STATE_INVARIANT_FAILED" };
  }
  if (state.declarations.currentDeclarerSeat !== seat || state.progression.currentActorSeat !== seat) {
    return { ok: false, code: "NOT_CURRENT_ACTOR" };
  }
  if (seat === dealerSeat && state.declarations.forbiddenDealerValue === value) {
    return { ok: false, code: "FORBIDDEN_DEALER_DECLARATION" };
  }
  let declarations;
  try {
    declarations = applyDeclaration({
      cardsPerPlayer: state.progression.cardsPerPlayer,
      dealerSeat,
      seatIndex: seat,
      declarations: state.declarations.declarations,
      declared: value
    });
  } catch {
    return { ok: false, code: "INVALID_DECLARATION" };
  }
  if (declarationsAreComplete(declarations)) {
    const actor = firstLeaderSeat;
    return {
      ok: true,
      state: {
        ...state,
        stateVersion: state.stateVersion + 1,
        progression: { ...state.progression, phase: "CARD_PLAY", currentActorSeat: actor },
        declarations: {
          ...state.declarations,
          currentDeclarerSeat: null,
          declarations,
          legalValues: [],
          forbiddenDealerValue: null
        },
        timing: timingForActor(state, actor, serverNow)
      }
    };
  }
  const actor = nextDeclarer(dealerSeat, declarations);
  if (actor == null)
    return { ok: false, code: "INTERNAL_STATE_INVARIANT_FAILED" };
  const declarationState = {
    ...state.declarations,
    currentDeclarerSeat: actor,
    declarations,
    legalValues: legalDeclarationValues({
      cardsPerPlayer: state.progression.cardsPerPlayer,
      dealerSeat,
      seatIndex: actor,
      declarations
    }),
    forbiddenDealerValue: null
  };
  const intermediate = { ...state, declarations: declarationState };
  declarationState.forbiddenDealerValue = forbiddenDealerValue(intermediate, actor);
  return {
    ok: true,
    state: {
      ...state,
      stateVersion: state.stateVersion + 1,
      progression: { ...state.progression, currentActorSeat: actor },
      declarations: declarationState,
      timing: timingForActor(state, actor, serverNow)
    }
  };
}
function applyTrumpChoice(state, seat, suit, serverNow) {
  if (state.progression.phase !== "NINE_CARD_TRUMP_CHOICE")
    return { ok: false, code: "WRONG_PHASE" };
  if (state.trump.status !== "chooser_pending" || state.trump.chooserSeat !== seat || state.progression.currentActorSeat !== seat)
    return { ok: false, code: "NOT_CURRENT_ACTOR" };
  if (suit !== null && !SUITS.includes(suit))
    return { ok: false, code: "INVALID_TRUMP_CHOICE" };
  const dealerSeat = state.progression.dealerSeat;
  const actor = state.progression.firstDeclarerSeat;
  if (dealerSeat == null || actor == null)
    return { ok: false, code: "INTERNAL_STATE_INVARIANT_FAILED" };
  let completed;
  try {
    completed = completeNineCardDeal(state.cards.deck, dealerSeat, {
      cursor: state.cards.drawCursor,
      hands: state.cards.hands
    });
  } catch {
    return { ok: false, code: "INTERNAL_STATE_INVARIANT_FAILED" };
  }
  const declarations = [null, null, null, null];
  const declarationState = {
    ...state.declarations,
    currentDeclarerSeat: actor,
    declarations,
    legalValues: legalDeclarationValues({ cardsPerPlayer: 9, dealerSeat, seatIndex: actor, declarations }),
    forbiddenDealerValue: null
  };
  return {
    ok: true,
    state: {
      ...state,
      stateVersion: state.stateVersion + 1,
      progression: { ...state.progression, phase: "DECLARATION", currentActorSeat: actor },
      cards: {
        ...state.cards,
        hands: completed.hands,
        drawCursor: completed.cursor,
        hiddenPartialNineCardHands: false,
        exposedTrumpCard: null
      },
      declarations: declarationState,
      trump: { status: "resolved", suit },
      timing: timingForActor(state, actor, serverNow)
    }
  };
}
function removeCard(hand, cardId) {
  const index = hand.findIndex((card) => card.id === cardId);
  if (index < 0)
    return null;
  const next = hand.slice();
  next.splice(index, 1);
  return next;
}
function completeCommittedPlay(args) {
  const { state, seat, play, nextHand, serverNow } = args;
  const hands = state.cards.hands.map((hand) => hand.slice());
  hands[seat] = nextHand;
  const currentTrick = [...state.cards.currentTrick, play];
  if (currentTrick.length < 4) {
    const actor = nextSeat(seat);
    return {
      ok: true,
      state: {
        ...state,
        stateVersion: state.stateVersion + 1,
        progression: { ...state.progression, phase: "CARD_PLAY", currentActorSeat: actor },
        cards: { ...state.cards, hands, currentTrick },
        joker: { pendingForSeat: null, cardId: null, semantic: null },
        timing: timingForActor(state, actor, serverNow)
      }
    };
  }
  let resolution;
  try {
    resolution = resolveTrick({ plays: currentTrick, trump: resolvedTrump2(state) });
  } catch {
    return { ok: false, code: "INTERNAL_STATE_INVARIANT_FAILED" };
  }
  const tricksTaken = [...state.score.tricksTaken];
  const winner = resolution.winnerSeat;
  tricksTaken[winner] += 1;
  const dealFinished = hands.every((hand) => hand.length === 0);
  const actor = dealFinished ? null : winner;
  return {
    ok: true,
    state: {
      ...state,
      stateVersion: state.stateVersion + 1,
      progression: {
        ...state.progression,
        phase: dealFinished ? "DEAL_RESULT" : "CARD_PLAY",
        currentActorSeat: actor
      },
      cards: {
        ...state.cards,
        hands,
        currentTrick: [],
        completedTricks: [...state.cards.completedTricks, { cards: currentTrick, winnerSeat: winner }]
      },
      joker: { pendingForSeat: null, cardId: null, semantic: null },
      score: { ...state.score, tricksTaken },
      timing: timingForActor(state, actor, serverNow)
    }
  };
}
function applyCardPlay(state, seat, cardId, serverNow) {
  if (state.progression.phase !== "CARD_PLAY")
    return { ok: false, code: "WRONG_PHASE" };
  if (state.progression.currentActorSeat !== seat)
    return { ok: false, code: "NOT_CURRENT_ACTOR" };
  let legal;
  try {
    legal = legalMoves(playerView2(state, seat));
  } catch {
    return { ok: false, code: "INTERNAL_STATE_INVARIANT_FAILED" };
  }
  const card = legal.find((candidate) => candidate.id === cardId);
  if (!card)
    return { ok: false, code: "ILLEGAL_CARD" };
  if (card.kind === "joker") {
    return {
      ok: true,
      state: {
        ...state,
        stateVersion: state.stateVersion + 1,
        progression: { ...state.progression, phase: "JOKER_DECISION", currentActorSeat: seat },
        joker: { pendingForSeat: seat, cardId: card.id, semantic: null },
        timing: timingForActor(state, seat, serverNow, true)
      }
    };
  }
  const nextHand = removeCard(state.cards.hands[seat], card.id);
  if (!nextHand)
    return { ok: false, code: "ILLEGAL_CARD" };
  return completeCommittedPlay({ state, seat, play: { seatIndex: seat, card }, nextHand, serverNow });
}
function validJokerSemantic(state, semantic) {
  if (state.cards.currentTrick.length === 0) {
    return semantic.context === "LEAD" && (semantic.mode === "HIGHER_SUIT" || semantic.mode === "SUIT_WINS") && SUITS.includes(semantic.requestedSuit);
  }
  return semantic.context === "OPEN_TRICK" && (semantic.mode === "COMPETE" || semantic.mode === "FROM_BELOW");
}
function applyJokerChoice(state, seat, semantic, serverNow) {
  if (state.progression.phase !== "JOKER_DECISION")
    return { ok: false, code: "WRONG_PHASE" };
  if (state.progression.currentActorSeat !== seat || state.joker.pendingForSeat !== seat) {
    return { ok: false, code: "NOT_CURRENT_ACTOR" };
  }
  if (!state.joker.cardId)
    return { ok: false, code: "JOKER_CHOICE_REQUIRED" };
  if (!validJokerSemantic(state, semantic))
    return { ok: false, code: "INVALID_JOKER_CHOICE" };
  const card = state.cards.hands[seat].find((candidate) => candidate.id === state.joker.cardId);
  if (!card || card.kind !== "joker")
    return { ok: false, code: "INTERNAL_STATE_INVARIANT_FAILED" };
  const nextHand = removeCard(state.cards.hands[seat], card.id);
  if (!nextHand)
    return { ok: false, code: "INTERNAL_STATE_INVARIANT_FAILED" };
  return completeCommittedPlay({
    state,
    seat,
    play: { seatIndex: seat, card, joker: semantic },
    nextHand,
    serverNow
  });
}
function applyGameplayCommand(args) {
  const { state, seat, command, serverNow, expectedController } = args;
  if (!validServerTime(serverNow))
    return { ok: false, code: "INTERNAL_STATE_INVARIANT_FAILED" };
  if (state.lifecycle !== "active")
    return { ok: false, code: "WRONG_PHASE" };
  if (state.seats[seat]?.seatIndex !== seat)
    return { ok: false, code: "INTERNAL_STATE_INVARIANT_FAILED" };
  if (expectedController && state.seats[seat].controller !== expectedController) {
    return { ok: false, code: "CONTROLLER_CHANGED" };
  }
  switch (command.type) {
    case "declare":
      return applyDeclarationCommand(state, seat, command.value, serverNow);
    case "choose_trump":
      return applyTrumpChoice(state, seat, command.suit, serverNow);
    case "play_card":
      return applyCardPlay(state, seat, command.cardId, serverNow);
    case "choose_joker_semantic":
      return applyJokerChoice(state, seat, command.semantic, serverNow);
  }
}

// src/bots/strategy.ts
var DEFAULT_TIER3_SIMULATION_BUDGET = 96;
var MAX_TIER3_SIMULATION_BUDGET = 192;
function requireChoice(values, label) {
  const first = values[0];
  if (first === undefined)
    throw new Error(`Bot strategy received no legal ${label}`);
  return first;
}
function standardStrength(card, trump) {
  const rank = RANK_VALUE[card.rank] + 1;
  return rank + (card.suit === trump ? 5 : 0);
}
function cardStrength(card, trump) {
  return card.kind === "joker" ? 20 : standardStrength(card, trump);
}
function remainingTricksNeeded(view) {
  const declaration = view.declarations[view.seatIndex] ?? 0;
  return Math.max(0, declaration - (view.tricksTaken[view.seatIndex] ?? 0));
}
function chooseClosestLegal(legalValues, estimate) {
  const first = requireChoice(legalValues, "declaration");
  return legalValues.reduce((best, value) => {
    const bestDistance = Math.abs(best - estimate);
    const distance = Math.abs(value - estimate);
    return distance < bestDistance || distance === bestDistance && value < best ? value : best;
  }, first);
}
function declarationEstimate(view) {
  let estimate = 0;
  const suitCounts = new Map;
  for (const card of view.hand) {
    if (card.kind === "joker") {
      estimate += 0.9;
      continue;
    }
    suitCounts.set(card.suit, (suitCounts.get(card.suit) ?? 0) + 1);
    const rankWeight = {
      "6": 0.02,
      "7": 0.04,
      "8": 0.07,
      "9": 0.1,
      "10": 0.14,
      J: 0.22,
      Q: 0.36,
      K: 0.58,
      A: 0.86
    };
    estimate += rankWeight[card.rank];
    if (card.suit === view.trump)
      estimate += 0.16;
  }
  if (view.trump) {
    const trumpLength = suitCounts.get(view.trump) ?? 0;
    if (trumpLength >= 3)
      estimate += (trumpLength - 2) * 0.18;
  }
  return Math.max(0, Math.min(view.cardsPerPlayer, Math.round(estimate)));
}
function suitQuality(view, suit) {
  const suited = view.hand.filter((card) => card.kind === "standard" && card.suit === suit);
  return suited.reduce((sum, card) => sum + RANK_VALUE[card.rank] + 1, 0) + suited.length * 2.25;
}
function noTrumpQuality(view) {
  let highCards = 0;
  let jokers = 0;
  for (const card of view.hand) {
    if (card.kind === "joker")
      jokers += 1;
    else if (RANK_VALUE[card.rank] >= RANK_VALUE.Q)
      highCards += 1;
  }
  return highCards * 3 + jokers * 5;
}
function chooseStrongBasicTrump(view, legalSuits) {
  const first = requireChoice(legalSuits, "trump choice");
  return legalSuits.reduce((best, candidate) => {
    const score = candidate === null ? noTrumpQuality(view) : suitQuality(view, candidate);
    const bestScore = best === null ? noTrumpQuality(view) : suitQuality(view, best);
    return score > bestScore ? candidate : best;
  }, first);
}
function chooseByStrength(view, legalMoves, preferWinning) {
  const first = requireChoice(legalMoves, "card");
  return legalMoves.reduce((best, card) => {
    const delta = cardStrength(card, view.trump) - cardStrength(best, view.trump);
    if (delta === 0)
      return card.id < best.id ? card : best;
    return preferWinning ? delta > 0 ? card : best : delta < 0 ? card : best;
  }, first);
}
function chooseBasicJokerSemantic(view, options) {
  const first = requireChoice(options, "Joker semantic");
  const needWin = remainingTricksNeeded(view) > 0;
  if (first.context === "OPEN_TRICK") {
    const targetMode = needWin ? "COMPETE" : "FROM_BELOW";
    return options.find((option) => option.context === "OPEN_TRICK" && option.mode === targetMode) ?? first;
  }
  const targetMode = needWin ? "HIGHER_SUIT" : "SUIT_WINS";
  const sameMode = options.filter((option) => option.context === "LEAD" && option.mode === targetMode);
  if (sameMode.length === 0)
    return first;
  const bestTrump = chooseStrongBasicTrump(view, sameMode.map((option) => option.requestedSuit));
  return sameMode.find((option) => option.requestedSuit === bestTrump) ?? sameMode[0];
}
function derivePublicInference(view) {
  const playedCardIds = new Set;
  const mutableVoids = new Map;
  const observeTrick = (plays) => {
    for (const play of plays)
      playedCardIds.add(play.card.id);
    const requestedSuit = requestedSuitForTrick(plays);
    if (!requestedSuit)
      return;
    for (let index = 1;index < plays.length; index += 1) {
      const play = plays[index];
      if (play.card.kind === "joker")
        continue;
      if (play.card.suit === requestedSuit)
        continue;
      const voids = mutableVoids.get(play.seatIndex) ?? new Set;
      voids.add(requestedSuit);
      mutableVoids.set(play.seatIndex, voids);
    }
  };
  for (const trick of view.history.completedTricks)
    observeTrick(trick.cards);
  observeTrick(view.currentTrick);
  return {
    playedCardIds,
    voidSuitsBySeat: new Map([...mutableVoids.entries()].map(([seat, suits]) => [seat, new Set(suits)]))
  };
}
function publicRiskPenalty(view, card, inference) {
  if (card.kind !== "standard" || !view.trump || card.suit === view.trump)
    return 0;
  let penalty = 0;
  for (let seat = 0;seat < 4; seat += 1) {
    if (seat === view.seatIndex)
      continue;
    if (inference.voidSuitsBySeat.get(seat)?.has(card.suit))
      penalty += 3;
  }
  return penalty;
}
function unseenHigherCount(view, card, inference) {
  if (card.kind !== "standard")
    return 0;
  const ownIds = new Set(view.hand.map((item) => item.id));
  return createDeck().filter((candidate) => candidate.kind === "standard" && candidate.suit === card.suit && RANK_VALUE[candidate.rank] > RANK_VALUE[card.rank] && !ownIds.has(candidate.id) && !inference.playedCardIds.has(candidate.id)).length;
}
function chooseMemoryCard(view, legalMoves) {
  const first = requireChoice(legalMoves, "card");
  const inference = derivePublicInference(view);
  const needWin = remainingTricksNeeded(view) > 0;
  return legalMoves.reduce((best, card) => {
    const score = cardStrength(card, view.trump) - publicRiskPenalty(view, card, inference) - unseenHigherCount(view, card, inference) * 0.7;
    const bestScore = cardStrength(best, view.trump) - publicRiskPenalty(view, best, inference) - unseenHigherCount(view, best, inference) * 0.7;
    if (score === bestScore)
      return card.id < best.id ? card : best;
    return needWin ? score > bestScore ? card : best : score < bestScore ? card : best;
  }, first);
}
function stableHash32(input) {
  let hash = 2166136261;
  for (let index = 0;index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
function seededRandom(seed) {
  let state = stableHash32(seed) || 2654435769;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}
function fairUnknownCards(view, inference) {
  const known = new Set(view.hand.map((card) => card.id));
  for (const id of inference.playedCardIds)
    known.add(id);
  return createDeck().filter((card) => !known.has(card.id));
}
function sampleWithoutReplacement(cards, count, random) {
  const pool = cards.slice();
  const result = [];
  const limit = Math.min(count, pool.length);
  for (let index = 0;index < limit; index += 1) {
    const selected = Math.floor(random() * pool.length);
    result.push(pool[selected]);
    pool.splice(selected, 1);
  }
  return result;
}
function sampledThreat(view, candidate, sampled) {
  if (candidate.kind === "joker")
    return false;
  const requested = requestedSuitForTrick(view.currentTrick) ?? candidate.suit;
  return sampled.some((card) => {
    if (card.kind === "joker")
      return true;
    if (view.trump && candidate.suit !== view.trump && card.suit === view.trump)
      return true;
    if (card.suit !== candidate.suit && candidate.suit === requested)
      return false;
    return card.suit === candidate.suit && RANK_VALUE[card.rank] > RANK_VALUE[candidate.rank];
  });
}
function viewSeed(view) {
  const history = view.history.completedTricks.flatMap((trick) => trick.cards.map((play) => `${play.seatIndex}:${play.card.id}`)).join(",");
  return [
    view.seatIndex,
    view.trump ?? "none",
    view.hand.map((card) => card.id).sort().join(","),
    view.declarations.join(","),
    view.tricksTaken.join(","),
    view.currentTrick.map((play) => `${play.seatIndex}:${play.card.id}`).join(","),
    history
  ].join("|");
}
function createProbabilitySimulationStrategy(options = {}) {
  const requestedBudget = options.simulationBudget ?? DEFAULT_TIER3_SIMULATION_BUDGET;
  const simulationBudget = Number.isFinite(requestedBudget) ? Math.max(0, Math.min(MAX_TIER3_SIMULATION_BUDGET, Math.floor(requestedBudget))) : DEFAULT_TIER3_SIMULATION_BUDGET;
  const baseSeed = options.seed ?? "production";
  return {
    id: "probability-simulation-v1",
    chooseDeclaration(view, legalValues) {
      const inference = derivePublicInference(view);
      const exposedHighCards = [...inference.playedCardIds].length / 12;
      return chooseClosestLegal(legalValues, declarationEstimate(view) + Math.min(1, exposedHighCards));
    },
    chooseTrump: chooseStrongBasicTrump,
    chooseCard(view, legalMoves) {
      const fallback = chooseMemoryCard(view, legalMoves);
      if (simulationBudget === 0 || legalMoves.length <= 1)
        return fallback;
      const inference = derivePublicInference(view);
      const unknown = fairUnknownCards(view, inference);
      if (unknown.length === 0)
        return fallback;
      const needWin = remainingTricksNeeded(view) > 0;
      const iterationsPerCandidate = Math.max(1, Math.floor(simulationBudget / legalMoves.length));
      let best = fallback;
      let bestScore = Number.NEGATIVE_INFINITY;
      for (const candidate of legalMoves) {
        const random = seededRandom(`${baseSeed}|${viewSeed(view)}|${candidate.id}`);
        let safeSamples = 0;
        for (let iteration = 0;iteration < iterationsPerCandidate; iteration += 1) {
          const sampled = sampleWithoutReplacement(unknown, 3, random);
          if (!sampledThreat(view, candidate, sampled))
            safeSamples += 1;
        }
        const winProbability = safeSamples / iterationsPerCandidate;
        const conservation = 1 - cardStrength(candidate, view.trump) / 20;
        const score = needWin ? winProbability * 4 + conservation : (1 - winProbability) * 3 + conservation;
        if (score > bestScore || score === bestScore && candidate.id < best.id) {
          best = candidate;
          bestScore = score;
        }
      }
      return best;
    },
    chooseJokerSemantic: chooseBasicJokerSemantic
  };
}
var strongBasicStrategy = {
  id: "strong-basic-v1",
  chooseDeclaration(view, legalValues) {
    return chooseClosestLegal(legalValues, declarationEstimate(view));
  },
  chooseTrump: chooseStrongBasicTrump,
  chooseCard(view, legalMoves) {
    return chooseByStrength(view, legalMoves, remainingTricksNeeded(view) > 0);
  },
  chooseJokerSemantic: chooseBasicJokerSemantic
};
var memoryInferenceStrategy = {
  id: "memory-inference-v1",
  chooseDeclaration(view, legalValues) {
    const inference = derivePublicInference(view);
    const publicInformationAdjustment = Math.min(1, Math.floor(inference.playedCardIds.size / 16));
    return chooseClosestLegal(legalValues, declarationEstimate(view) + publicInformationAdjustment);
  },
  chooseTrump: chooseStrongBasicTrump,
  chooseCard: chooseMemoryCard,
  chooseJokerSemantic: chooseBasicJokerSemantic
};
var probabilitySimulationStrategy = createProbabilitySimulationStrategy();
var STRATEGIES = {
  "strong-basic-v1": strongBasicStrategy,
  "memory-inference-v1": memoryInferenceStrategy,
  "probability-simulation-v1": probabilitySimulationStrategy
};
function resolveBotStrategy(profileId) {
  return STRATEGIES[profileId];
}

// src/bots/runtime.ts
var TEMPORARY_CONTROLLER_STRATEGY_ID = "temporary-controller-v1";
function playerViewFromProjection(projection) {
  return {
    seatIndex: projection.viewerSeat,
    hand: projection.cards.ownHand.slice(),
    cardsPerPlayer: projection.progression.cardsPerPlayer,
    trump: projection.trump.status === "resolved" ? projection.trump.suit : null,
    declarations: Array.from(projection.declarations.values),
    tricksTaken: Array.from(projection.score.tricksTaken),
    currentTrick: projection.cards.currentTrick.slice(),
    history: { completedTricks: projection.cards.completedTricks.slice() }
  };
}
function permanentStrategy(profileId) {
  if (profileId !== "strong-basic-v1" && profileId !== "memory-inference-v1" && profileId !== "probability-simulation-v1") {
    return null;
  }
  return resolveBotStrategy(profileId);
}
function strategyForProjection(projection) {
  const seat = projection.seats[projection.viewerSeat];
  if (seat.controller === "human")
    return null;
  if (seat.controller === "temporary_bot") {
    if (seat.owner.type !== "human")
      return null;
    return {
      strategy: strongBasicStrategy,
      strategyId: TEMPORARY_CONTROLLER_STRATEGY_ID,
      controller: "temporary_bot"
    };
  }
  if (seat.owner.type !== "bot")
    return null;
  const strategy = permanentStrategy(seat.owner.strategyProfileId);
  return strategy ? {
    strategy,
    strategyId: strategy.id,
    controller: "permanent_bot"
  } : null;
}
function cardChoices(projection, action) {
  const legalIds = new Set(action.cardIds);
  return projection.cards.ownHand.filter((card) => legalIds.has(card.id));
}
function sameSemantic(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
function commandForAction(projection, strategy, action) {
  const view = playerViewFromProjection(projection);
  switch (action.type) {
    case "declare": {
      const value = strategy.chooseDeclaration(view, action.values);
      return action.values.includes(value) ? { type: "declare", value } : null;
    }
    case "choose_trump": {
      const suit = strategy.chooseTrump(view, action.suits);
      return action.suits.includes(suit) ? { type: "choose_trump", suit } : null;
    }
    case "play_card": {
      const legal = cardChoices(projection, action);
      if (legal.length !== action.cardIds.length)
        return null;
      const card = strategy.chooseCard(view, legal);
      return action.cardIds.includes(card.id) ? { type: "play_card", cardId: card.id } : null;
    }
    case "choose_joker_semantic": {
      const semantic = strategy.chooseJokerSemantic(view, action.options);
      return action.options.some((option) => sameSemantic(option, semantic)) ? { type: "choose_joker_semantic", semantic } : null;
    }
    case "reclaim_control":
      return null;
  }
}
function selectAutomaticGameplayCommand(projection) {
  const selected = strategyForProjection(projection);
  if (!selected)
    return null;
  const gameplayAction = projection.local.legalActions.find((action) => action.type !== "reclaim_control");
  if (!gameplayAction)
    return null;
  const command = commandForAction(projection, selected.strategy, gameplayAction);
  if (!command)
    return null;
  return {
    command,
    strategyId: selected.strategyId,
    controller: selected.controller
  };
}

// src/bots/progression.ts
function planAutomaticGameplayStep(state, serverNow) {
  if (state.lifecycle !== "active")
    return { ok: false, stopReason: "GAME_NOT_ACTIVE" };
  const actor = state.progression.currentActorSeat;
  if (actor == null)
    return { ok: false, stopReason: "NO_ACTOR" };
  const controller = state.seats[actor].controller;
  if (controller === "human")
    return { ok: false, stopReason: "HUMAN_INPUT" };
  const projection = projectGameForSeat(state, actor);
  const selected = selectAutomaticGameplayCommand(projection);
  if (!selected)
    return { ok: false, stopReason: "NO_LEGAL_ACTION" };
  if (selected.controller !== controller) {
    return { ok: false, stopReason: "INVALID_AUTOMATIC_STATE" };
  }
  const transition = applyGameplayCommand({
    state,
    seat: actor,
    command: selected.command,
    serverNow,
    expectedController: controller
  });
  if (!transition.ok)
    return { ok: false, stopReason: "INVALID_AUTOMATIC_STATE" };
  return {
    ok: true,
    command: selected.command,
    strategyId: selected.strategyId,
    controller,
    actorSeat: actor,
    nextState: transition.state
  };
}

// src/domain/scoring.ts
var ZERO_TRICK_PENALTY = -200;
function scoreDeal({ declared, taken, tricksInDeal }) {
  if (declared === taken) {
    if (tricksInDeal > 0 && declared === tricksInDeal)
      return 100 * tricksInDeal;
    return 50 + 50 * declared;
  }
  if (taken === 0)
    return ZERO_TRICK_PENALTY;
  return 10 * taken;
}

// src/domain/premia.ts
function canonicalScores(outcome) {
  return [0, 1, 2, 3].map((seat) => scoreDeal({
    declared: outcome.declarations[seat],
    taken: outcome.tricksTaken[seat],
    tricksInDeal: outcome.cardsPerPlayer
  }));
}
function bestEligibleScore(outcomes, seat) {
  let best = null;
  for (const outcome of outcomes.slice(0, -1)) {
    const amount = canonicalScores(outcome)[seat];
    if (amount < 150)
      continue;
    if (!best || amount > best.amount) {
      best = { indexInPhase: outcome.indexInPhase, amount };
    }
  }
  return best;
}
function validateRoundOutcomes(phase, outcomes) {
  const expected = dealsOfPhase(phase);
  if (outcomes.length !== expected.length) {
    throw new Error(`Phase ${phase} requires ${expected.length} completed deal outcomes`);
  }
  expected.forEach((deal, index) => {
    const outcome = outcomes[index];
    if (!outcome || outcome.indexInPhase !== deal.indexInPhase) {
      throw new Error("Round outcomes must be complete and in canonical order");
    }
    if (outcome.cardsPerPlayer !== deal.cardsPerPlayer) {
      throw new Error("Round outcome cardsPerPlayer does not match canonical schedule");
    }
    if (outcome.declarations.some((value) => !Number.isInteger(value) || value < 0 || value > deal.cardsPerPlayer) || outcome.tricksTaken.some((value) => !Number.isInteger(value) || value < 0 || value > deal.cardsPerPlayer)) {
      throw new Error("Invalid declaration or trick count in round outcome");
    }
    const declaredTotal = outcome.declarations.reduce((sum, value) => sum + value, 0);
    const tricksTotal = outcome.tricksTaken.reduce((sum, value) => sum + value, 0);
    if (declaredTotal === deal.cardsPerPlayer) {
      throw new Error("Declaration total may not equal available tricks");
    }
    if (tricksTotal !== deal.cardsPerPlayer) {
      throw new Error("Taken tricks must equal available tricks");
    }
  });
}
function buildQualifiedRuns(qualified) {
  const firstNonQualified = qualified.findIndex((value) => !value);
  if (firstNonQualified === -1) {
    throw new Error("All four seats cannot qualify for premia under canonical declaration rules");
  }
  const runs = [];
  let current = [];
  for (let step = 1;step <= SEAT_COUNT; step += 1) {
    const seat = (firstNonQualified + step) % SEAT_COUNT;
    if (qualified[seat]) {
      current.push(seat);
    } else if (current.length > 0) {
      runs.push(current);
      current = [];
    }
  }
  if (current.length > 0)
    runs.push(current);
  return runs;
}
function resolvePremia(phase, outcomes) {
  validateRoundOutcomes(phase, outcomes);
  const qualified = [0, 1, 2, 3].map((seat) => outcomes.every((outcome) => outcome.declarations[seat] === outcome.tricksTaken[seat]));
  const adjustments = [0, 0, 0, 0];
  const transfers = [];
  for (const run of buildQualifiedRuns(qualified)) {
    let selectedBonus = null;
    for (const seat of run) {
      const candidate = bestEligibleScore(outcomes, seat);
      if (!candidate)
        continue;
      selectedBonus = { seat, ...candidate };
      break;
    }
    if (!selectedBonus)
      continue;
    const lastSeat = run[run.length - 1];
    const targetSeat = (lastSeat + 1) % SEAT_COUNT;
    if (qualified[targetSeat])
      throw new Error("Premia target must be the next non-premia seat");
    const removal = bestEligibleScore(outcomes, targetSeat);
    adjustments[selectedBonus.seat] = (adjustments[selectedBonus.seat] ?? 0) + selectedBonus.amount;
    if (removal) {
      adjustments[targetSeat] = (adjustments[targetSeat] ?? 0) - removal.amount;
    }
    transfers.push({
      bonusSeat: selectedBonus.seat,
      bonusDealIndex: selectedBonus.indexInPhase,
      bonusAmount: selectedBonus.amount,
      targetSeat,
      removedDealIndex: removal?.indexInPhase ?? null,
      removedAmount: removal?.amount ?? 0
    });
  }
  transfers.sort((a, b) => a.bonusSeat - b.bonusSeat);
  return { qualified, adjustments, transfers };
}

// src/domain/ranking.ts
function rankFinalScores(scores) {
  const sorted = scores.map((score, seatIndex) => ({ seatIndex, score })).sort((a, b) => b.score - a.score || a.seatIndex - b.seatIndex);
  let previousScore = null;
  let previousPlacement = 0;
  return sorted.map((entry, index) => {
    const placement = previousScore === entry.score ? previousPlacement : index + 1;
    previousScore = entry.score;
    previousPlacement = placement;
    return { ...entry, placement };
  });
}

// src/domain/gameLifecycle.ts
function validServerTime2(value) {
  return Number.isFinite(Date.parse(value));
}
function tuple4(values) {
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) {
    throw new Error("Expected four finite values");
  }
  return [values[0], values[1], values[2], values[3]];
}
function completedDeals(state) {
  return (state.score.completedDeals ?? []).map((record) => ({
    ...record,
    declarations: [...record.declarations],
    tricksTaken: [...record.tricksTaken],
    dealScores: [...record.dealScores],
    totalsAfterDeal: [...record.totalsAfterDeal]
  }));
}
function roundPremia(state) {
  return (state.score.roundPremia ?? []).map((record) => ({
    ...record,
    qualified: [...record.qualified],
    adjustments: [...record.adjustments],
    transfers: record.transfers.map((transfer) => ({ ...transfer })),
    totalsAfterPremia: [...record.totalsAfterPremia]
  }));
}
function declarationsTuple(state) {
  const values = state.declarations.declarations;
  if (values.some((value) => value == null))
    return null;
  return values;
}
function dealScoresFor(declarations, tricksTaken, cardsPerPlayer) {
  return tuple4([0, 1, 2, 3].map((seat) => scoreDeal({
    declared: declarations[seat],
    taken: tricksTaken[seat],
    tricksInDeal: cardsPerPlayer
  })));
}
function isLastDealOfRound(state) {
  return state.progression.indexInPhase === dealsOfPhase(state.progression.round).length;
}
function initialDeclarations(dealerSeat, firstDeclarerSeat, cardsPerPlayer) {
  const declarations = [null, null, null, null];
  return {
    order: declarationOrder(dealerSeat),
    currentDeclarerSeat: firstDeclarerSeat,
    declarations,
    legalValues: legalDeclarationValues({
      cardsPerPlayer,
      dealerSeat,
      seatIndex: firstDeclarerSeat,
      declarations
    }),
    forbiddenDealerValue: null
  };
}
function nextDealState(state, random, serverNow) {
  const nextInfo = DEALS[state.progression.dealNumber];
  const currentDealer = state.progression.dealerSeat;
  if (!nextInfo || currentDealer == null)
    throw new Error("Missing next deal or dealer");
  const dealerSeat = nextSeat(currentDealer);
  const firstDeclarerSeat = nextSeat(dealerSeat);
  const firstLeaderSeat = firstDeclarerSeat;
  const deck = shuffleCards(createDeck(), random);
  const actorController = state.seats[firstDeclarerSeat].controller;
  const timing = {
    currentHumanDeadline: actorController === "human" ? humanDeadlineFromServerTime(serverNow) : null,
    timeoutTakeoverActive: actorController === "temporary_bot"
  };
  if (nextInfo.cardsPerPlayer === 9) {
    const initial = dealNineCardInitial(deck, dealerSeat);
    return {
      ...state,
      lifecycle: "active",
      progression: {
        round: nextInfo.phase,
        dealNumber: nextInfo.dealNumber,
        indexInPhase: nextInfo.indexInPhase,
        cardsPerPlayer: 9,
        dealerSeat,
        firstDeclarerSeat,
        firstLeaderSeat,
        currentActorSeat: firstDeclarerSeat,
        phase: "NINE_CARD_TRUMP_CHOICE"
      },
      cards: {
        deck,
        drawCursor: initial.cursor,
        hands: initial.hands,
        hiddenPartialNineCardHands: true,
        exposedTrumpCard: null,
        currentTrick: [],
        completedTricks: []
      },
      declarations: initialDeclarations(dealerSeat, firstDeclarerSeat, 9),
      trump: { status: "chooser_pending", chooserSeat: firstDeclarerSeat },
      joker: { pendingForSeat: null, cardId: null, semantic: null },
      score: {
        ...state.score,
        tricksTaken: [0, 0, 0, 0],
        currentDealScores: [null, null, null, null]
      },
      timing
    };
  }
  const dealt = dealWithTrumpReveal(deck, dealerSeat, nextInfo.cardsPerPlayer);
  return {
    ...state,
    lifecycle: "active",
    progression: {
      round: nextInfo.phase,
      dealNumber: nextInfo.dealNumber,
      indexInPhase: nextInfo.indexInPhase,
      cardsPerPlayer: nextInfo.cardsPerPlayer,
      dealerSeat,
      firstDeclarerSeat,
      firstLeaderSeat,
      currentActorSeat: firstDeclarerSeat,
      phase: "DECLARATION"
    },
    cards: {
      deck,
      drawCursor: dealt.cursor,
      hands: dealt.hands,
      hiddenPartialNineCardHands: false,
      exposedTrumpCard: dealt.revealedTrumpCard,
      currentTrick: [],
      completedTricks: []
    },
    declarations: initialDeclarations(dealerSeat, firstDeclarerSeat, nextInfo.cardsPerPlayer),
    trump: { status: "resolved", suit: dealt.trump },
    joker: { pendingForSeat: null, cardId: null, semantic: null },
    score: {
      ...state.score,
      tricksTaken: [0, 0, 0, 0],
      currentDealScores: [null, null, null, null]
    },
    timing
  };
}
function settleDeal(state, random, serverNow) {
  const declarations = declarationsTuple(state);
  if (!declarations)
    return { ok: false, code: "INVALID_LIFECYCLE_STATE" };
  if (state.cards.hands.some((hand) => hand.length !== 0) || state.cards.currentTrick.length !== 0) {
    return { ok: false, code: "INVALID_LIFECYCLE_STATE" };
  }
  if (state.score.tricksTaken.reduce((sum, value) => sum + value, 0) !== state.progression.cardsPerPlayer) {
    return { ok: false, code: "INVALID_LIFECYCLE_STATE" };
  }
  const dealScores = dealScoresFor(declarations, state.score.tricksTaken, state.progression.cardsPerPlayer);
  const totalsAfterDeal = tuple4(state.score.cumulativeTotals.map((total, seat) => total + dealScores[seat]));
  const record = {
    dealNumber: state.progression.dealNumber,
    round: state.progression.round,
    indexInPhase: state.progression.indexInPhase,
    cardsPerPlayer: state.progression.cardsPerPlayer,
    declarations: [...declarations],
    tricksTaken: [...state.score.tricksTaken],
    dealScores,
    totalsAfterDeal
  };
  const history = completedDeals(state);
  if (history.some((existing) => existing.dealNumber === record.dealNumber)) {
    return { ok: false, code: "INVALID_LIFECYCLE_STATE" };
  }
  history.push(record);
  const scored = {
    ...state,
    stateVersion: state.stateVersion + 1,
    progression: {
      ...state.progression,
      phase: isLastDealOfRound(state) ? "PHASE_RESULT" : state.progression.phase,
      currentActorSeat: null
    },
    score: {
      ...state.score,
      currentDealScores: dealScores,
      cumulativeTotals: totalsAfterDeal,
      completedDeals: history,
      roundPremia: roundPremia(state)
    },
    timing: { currentHumanDeadline: null, timeoutTakeoverActive: false }
  };
  if (isLastDealOfRound(state)) {
    return { ok: true, changed: true, state: scored, transition: "DEAL_SETTLED" };
  }
  if (!random)
    return { ok: false, code: "INVALID_LIFECYCLE_STATE" };
  try {
    return {
      ok: true,
      changed: true,
      state: nextDealState(scored, random, serverNow),
      transition: "DEAL_SETTLED"
    };
  } catch {
    return { ok: false, code: "INVALID_LIFECYCLE_STATE" };
  }
}
function settleRound(state, random, serverNow) {
  const history = completedDeals(state);
  const round = state.progression.round;
  const expected = dealsOfPhase(round);
  const roundRecords = history.filter((record) => record.round === round);
  if (roundRecords.length !== expected.length)
    return { ok: false, code: "INVALID_LIFECYCLE_STATE" };
  if ((state.score.roundPremia ?? []).some((record) => record.round === round)) {
    return { ok: false, code: "INVALID_LIFECYCLE_STATE" };
  }
  const outcomes = roundRecords.map((record) => ({
    indexInPhase: record.indexInPhase,
    cardsPerPlayer: record.cardsPerPlayer,
    declarations: [...record.declarations],
    tricksTaken: [...record.tricksTaken]
  }));
  let premia;
  try {
    premia = resolvePremia(round, outcomes);
  } catch {
    return { ok: false, code: "INVALID_LIFECYCLE_STATE" };
  }
  const totalsAfterPremia = tuple4(state.score.cumulativeTotals.map((total, seat) => total + premia.adjustments[seat]));
  const premiaRecord = {
    round,
    qualified: [...premia.qualified],
    adjustments: [...premia.adjustments],
    transfers: premia.transfers.map((transfer) => ({ ...transfer })),
    totalsAfterPremia
  };
  const premiaHistory = [...roundPremia(state), premiaRecord];
  const finalDeal = state.progression.dealNumber === DEALS.length;
  if (finalDeal) {
    const placements = [null, null, null, null];
    for (const ranked of rankFinalScores(totalsAfterPremia))
      placements[ranked.seatIndex] = ranked.placement;
    return {
      ok: true,
      changed: true,
      transition: "ROUND_SETTLED",
      state: {
        ...state,
        stateVersion: state.stateVersion + 1,
        lifecycle: "complete",
        progression: { ...state.progression, phase: "GAME_COMPLETE", currentActorSeat: null },
        score: {
          ...state.score,
          cumulativeTotals: totalsAfterPremia,
          finalPlacements: placements,
          completedDeals: history,
          roundPremia: premiaHistory
        },
        timing: { currentHumanDeadline: null, timeoutTakeoverActive: false }
      }
    };
  }
  if (!random)
    return { ok: false, code: "INVALID_LIFECYCLE_STATE" };
  try {
    const settled = {
      ...state,
      stateVersion: state.stateVersion + 1,
      score: {
        ...state.score,
        cumulativeTotals: totalsAfterPremia,
        completedDeals: history,
        roundPremia: premiaHistory
      }
    };
    return {
      ok: true,
      changed: true,
      state: nextDealState(settled, random, serverNow),
      transition: "ROUND_SETTLED"
    };
  } catch {
    return { ok: false, code: "INVALID_LIFECYCLE_STATE" };
  }
}
function settleCanonicalLifecycle(args) {
  if (!validServerTime2(args.serverNow))
    return { ok: false, code: "INVALID_LIFECYCLE_STATE" };
  if (args.state.lifecycle !== "active")
    return { ok: true, changed: false, state: args.state };
  if (args.state.progression.phase === "DEAL_RESULT") {
    return settleDeal(args.state, args.nextDealRandom ?? null, args.serverNow);
  }
  if (args.state.progression.phase === "PHASE_RESULT") {
    return settleRound(args.state, args.nextDealRandom ?? null, args.serverNow);
  }
  return { ok: true, changed: false, state: args.state };
}

// src/server/reconciliationCore.ts
function failureFromPersist(result) {
  return result.currentStateVersion == null ? { ok: false, code: result.code } : { ok: false, code: result.code, currentStateVersion: result.currentStateVersion };
}
function lifecycleCommandType(phase) {
  return phase === "PHASE_RESULT" ? "settle_round" : "settle_deal";
}
async function lifecycleTransition(gameId, loaded, dependencies) {
  const state = loaded.canonicalState;
  if (state.progression.phase !== "DEAL_RESULT" && state.progression.phase !== "PHASE_RESULT") {
    return { kind: "none" };
  }
  const entropySeed = state.serverEntropySeed;
  if (!entropySeed)
    return { kind: "failure", result: { ok: false, code: "INVALID_CANONICAL_STATE" } };
  const finalRoundBoundary = state.progression.phase === "PHASE_RESULT" && state.progression.dealNumber === 24;
  let nextDealRandom;
  if (!finalRoundBoundary) {
    const nextDealNumber = state.progression.dealNumber + 1;
    const units = await dependencies.randomUnits(entropySeed, `deal-${nextDealNumber}-shuffle-v1`, 35);
    nextDealRandom = randomIterator(units);
  }
  const transition = settleCanonicalLifecycle({
    state,
    ...nextDealRandom ? { nextDealRandom } : {},
    serverNow: dependencies.now()
  });
  if (!transition.ok)
    return { kind: "failure", result: { ok: false, code: "INVALID_CANONICAL_STATE" } };
  if (!transition.changed)
    return { kind: "none" };
  const phase = state.progression.phase;
  const actionId = await dependencies.actionId(gameId, `lifecycle-v1:${loaded.stateVersion}:${state.progression.dealNumber}:${phase}`);
  const persisted = transition.state.lifecycle === "complete" ? await dependencies.finalize({
    gameId,
    actionId,
    expectedStateVersion: loaded.stateVersion,
    newState: transition.state
  }) : await dependencies.persist({
    gameId,
    actionId,
    commandType: lifecycleCommandType(phase),
    expectedStateVersion: loaded.stateVersion,
    commandPayload: {
      source: "canonical_lifecycle",
      dealNumber: state.progression.dealNumber,
      round: state.progression.round,
      fromPhase: phase,
      transition: transition.transition
    },
    newState: transition.state
  });
  if (!persisted.ok) {
    if (persisted.code === "STALE_STATE")
      return { kind: "stale" };
    return { kind: "failure", result: failureFromPersist(persisted) };
  }
  return transition.state.lifecycle === "complete" ? { kind: "complete", replayed: persisted.replayed } : { kind: "committed", replayed: persisted.replayed };
}
async function advanceGameUntilBlockedWithDependencies(gameId, maxSteps, dependencies) {
  if (!Number.isInteger(maxSteps) || maxSteps < 1)
    return { ok: false, code: "INVALID_REQUEST" };
  let committedSteps = 0;
  let staleRaces = 0;
  for (let attempt = 0;attempt < maxSteps; attempt += 1) {
    const loaded = await dependencies.load(gameId);
    if (!loaded.ok) {
      return loaded.stateVersion == null ? { ok: false, code: loaded.code } : { ok: false, code: loaded.code, currentStateVersion: loaded.stateVersion };
    }
    const state = loaded.canonicalState;
    if (state.lifecycle === "complete") {
      return { ok: true, stateVersion: loaded.stateVersion, steps: committedSteps, stopReason: "GAME_COMPLETE" };
    }
    const serverNow = dependencies.now();
    const timeout = applyOverdueTimeout(state, serverNow);
    if (!timeout.ok)
      return { ok: false, code: "INVALID_CANONICAL_STATE" };
    if (timeout.changed) {
      const actionId = await dependencies.actionId(gameId, `timeout-v1:${loaded.stateVersion}:${state.progression.currentActorSeat ?? "none"}:${state.timing.currentHumanDeadline ?? "none"}`);
      const persisted = await dependencies.persist({
        gameId,
        actionId,
        commandType: "system_timeout_takeover",
        expectedStateVersion: loaded.stateVersion,
        commandPayload: {
          deadline: state.timing.currentHumanDeadline,
          actorSeat: state.progression.currentActorSeat
        },
        newState: timeout.state
      });
      if (!persisted.ok) {
        if (persisted.code === "STALE_STATE") {
          staleRaces += 1;
          continue;
        }
        return failureFromPersist(persisted);
      }
      if (!persisted.replayed)
        committedSteps += 1;
      continue;
    }
    const lifecycle = await lifecycleTransition(gameId, loaded, dependencies);
    if (lifecycle.kind === "failure")
      return lifecycle.result;
    if (lifecycle.kind === "stale") {
      staleRaces += 1;
      continue;
    }
    if (lifecycle.kind === "committed") {
      if (!lifecycle.replayed)
        committedSteps += 1;
      continue;
    }
    if (lifecycle.kind === "complete") {
      if (!lifecycle.replayed)
        committedSteps += 1;
      const final = await dependencies.load(gameId);
      if (final.ok) {
        return { ok: true, stateVersion: final.stateVersion, steps: committedSteps, stopReason: "GAME_COMPLETE" };
      }
      return final.stateVersion == null ? { ok: false, code: final.code } : { ok: false, code: final.code, currentStateVersion: final.stateVersion };
    }
    const plan = planAutomaticGameplayStep(state, serverNow);
    if (!plan.ok) {
      return {
        ok: true,
        stateVersion: loaded.stateVersion,
        steps: committedSteps,
        stopReason: plan.stopReason
      };
    }
    const actionId = await dependencies.actionId(gameId, [
      "automatic-gameplay-v1",
      String(loaded.stateVersion),
      String(plan.actorSeat),
      plan.controller,
      plan.strategyId
    ].join(":"));
    const persisted = await dependencies.persist({
      gameId,
      actionId,
      commandType: `bot_${plan.command.type}`,
      expectedStateVersion: loaded.stateVersion,
      commandPayload: {
        source: "automatic_controller",
        actorSeat: plan.actorSeat,
        controller: plan.controller,
        strategyId: plan.strategyId,
        command: plan.command
      },
      newState: plan.nextState
    });
    if (!persisted.ok) {
      if (persisted.code === "STALE_STATE") {
        staleRaces += 1;
        continue;
      }
      return failureFromPersist(persisted);
    }
    if (!persisted.replayed)
      committedSteps += 1;
  }
  const final = await dependencies.load(gameId);
  if (!final.ok) {
    return final.stateVersion == null ? { ok: false, code: final.code } : { ok: false, code: final.code, currentStateVersion: final.stateVersion };
  }
  return {
    ok: true,
    stateVersion: final.stateVersion,
    steps: committedSteps,
    stopReason: staleRaces > 0 ? "STALE_RACE" : "STEP_BOUND"
  };
}

// supabase/functions/game-reconciler/index.ts
var uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
var MAX_GAMES_PER_INVOCATION = 4;
var CLAIM_LEASE_SECONDS = 60;
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}
function workerFailure(code, stateVersion) {
  const safe = code === "GAME_NOT_FOUND" || code === "GAME_STATE_NOT_INITIALIZED" || code === "ACTION_ID_CONFLICT" || code === "STALE_STATE" || code === "INVALID_REQUEST" || code === "INVALID_CANONICAL_STATE" || code === "FINALIZATION_REQUIRED" ? code : "SERVICE_UNAVAILABLE";
  return stateVersion == null ? { ok: false, code: safe } : { ok: false, code: safe, stateVersion };
}
function workerPersistFailure(code, currentStateVersion) {
  const safe = code === "GAME_NOT_FOUND" || code === "GAME_STATE_NOT_INITIALIZED" || code === "ACTION_ID_CONFLICT" || code === "STALE_STATE" || code === "INVALID_REQUEST" || code === "INVALID_CANONICAL_STATE" || code === "FINALIZATION_REQUIRED" ? code : "SERVICE_UNAVAILABLE";
  return currentStateVersion == null ? { ok: false, code: safe } : { ok: false, code: safe, currentStateVersion };
}
function dependenciesForClaim(admin, claimToken) {
  return {
    async load(gameId) {
      const { data, error } = await admin.rpc("load_game_state_for_reconciliation_internal", {
        p_game_id: gameId,
        p_claim_token: claimToken
      });
      if (error || !data || typeof data !== "object") {
        return { ok: false, code: "SERVICE_UNAVAILABLE" };
      }
      const result = data;
      if (result.ok !== true) {
        return workerFailure(result.code, typeof result.stateVersion === "number" ? result.stateVersion : undefined);
      }
      if (typeof result.gameId !== "string" || typeof result.stateVersion !== "number" || !result.canonicalState || typeof result.canonicalState !== "object") {
        return { ok: false, code: "INVALID_CANONICAL_STATE" };
      }
      return {
        ok: true,
        gameId: result.gameId,
        stateVersion: result.stateVersion,
        canonicalState: result.canonicalState
      };
    },
    async persist(input) {
      const requestFingerprint = await fingerprintJson({
        gameId: input.gameId,
        commandType: input.commandType,
        expectedStateVersion: input.expectedStateVersion,
        payload: input.commandPayload
      });
      const { data, error } = await admin.rpc("persist_game_state_for_reconciliation_internal", {
        p_game_id: input.gameId,
        p_claim_token: claimToken,
        p_action_id: input.actionId,
        p_command_type: input.commandType,
        p_expected_state_version: input.expectedStateVersion,
        p_request_fingerprint: requestFingerprint,
        p_new_state: input.newState
      });
      if (error || !data || typeof data !== "object") {
        return { ok: false, code: "SERVICE_UNAVAILABLE" };
      }
      const result = data;
      if (result.ok !== true) {
        return workerPersistFailure(result.code, typeof result.currentStateVersion === "number" ? result.currentStateVersion : undefined);
      }
      if (typeof result.gameId !== "string" || typeof result.stateVersion !== "number" || result.lifecycle !== "starting" && result.lifecycle !== "active" && result.lifecycle !== "complete") {
        return { ok: false, code: "SERVICE_UNAVAILABLE" };
      }
      return {
        ok: true,
        gameId: result.gameId,
        stateVersion: result.stateVersion,
        lifecycle: result.lifecycle,
        replayed: result.replayed === true
      };
    },
    async finalize(input) {
      const requestFingerprint = await fingerprintJson({
        gameId: input.gameId,
        commandType: "finalize_game",
        expectedStateVersion: input.expectedStateVersion,
        totals: input.newState.score.cumulativeTotals,
        placements: input.newState.score.finalPlacements
      });
      const { data, error } = await admin.rpc("finalize_game_for_reconciliation_internal", {
        p_game_id: input.gameId,
        p_claim_token: claimToken,
        p_action_id: input.actionId,
        p_expected_state_version: input.expectedStateVersion,
        p_request_fingerprint: requestFingerprint,
        p_new_state: input.newState
      });
      if (error || !data || typeof data !== "object") {
        return { ok: false, code: "SERVICE_UNAVAILABLE" };
      }
      const result = data;
      if (result.ok !== true) {
        return workerPersistFailure(result.code, typeof result.currentStateVersion === "number" ? result.currentStateVersion : undefined);
      }
      if (typeof result.gameId !== "string" || typeof result.stateVersion !== "number" || result.lifecycle !== "complete") {
        return { ok: false, code: "SERVICE_UNAVAILABLE" };
      }
      return {
        ok: true,
        gameId: result.gameId,
        stateVersion: result.stateVersion,
        lifecycle: "complete",
        replayed: result.replayed === true
      };
    },
    actionId: stableInternalActionId,
    randomUnits: deterministicRandomUnitsFromSeed,
    now: () => new Date().toISOString()
  };
}
async function releaseClaim(admin, claim) {
  await admin.rpc("release_game_reconciliation_claim_internal", {
    p_game_id: claim.gameId,
    p_claim_token: claim.claimToken
  });
}
Deno.serve(async (req) => {
  if (req.method !== "POST")
    return json({ ok: false, code: "INVALID_REQUEST" }, 405);
  const admin = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const body = await req.json();
    const invocationToken = typeof body?.invocationToken === "string" ? body.invocationToken : "";
    if (!uuidPattern.test(invocationToken)) {
      return json({ ok: false, code: "NOT_AUTHORIZED" }, 401);
    }
    const { data: consumed, error: consumeError } = await admin.rpc("consume_game_reconciler_invocation_internal", { p_token: invocationToken });
    if (consumeError || consumed !== true) {
      return json({ ok: false, code: "NOT_AUTHORIZED" }, 401);
    }
    const { data: claimedData, error: claimError } = await admin.rpc("claim_due_games_for_reconciliation_internal", { p_limit: MAX_GAMES_PER_INVOCATION, p_lease_seconds: CLAIM_LEASE_SECONDS });
    if (claimError || !Array.isArray(claimedData)) {
      return json({ ok: false, code: "SERVICE_UNAVAILABLE" }, 503);
    }
    const claims = claimedData.filter((value) => value && typeof value === "object" && typeof value.gameId === "string" && typeof value.claimToken === "string" && typeof value.stateVersion === "number" && typeof value.claimUntil === "string" && uuidPattern.test(value.gameId) && uuidPattern.test(value.claimToken));
    const results = [];
    for (const claim of claims) {
      try {
        const result = await advanceGameUntilBlockedWithDependencies(claim.gameId, MAX_SYNCHRONOUS_BOT_STEPS, dependenciesForClaim(admin, claim.claimToken));
        results.push(result.ok ? {
          gameId: claim.gameId,
          ok: true,
          stateVersion: result.stateVersion,
          steps: result.steps,
          stopReason: result.stopReason
        } : {
          gameId: claim.gameId,
          ok: false,
          code: result.code,
          currentStateVersion: result.currentStateVersion
        });
      } catch {
        results.push({ gameId: claim.gameId, ok: false, code: "SERVICE_UNAVAILABLE" });
      } finally {
        await releaseClaim(admin, claim);
      }
    }
    return json({ ok: true, claimed: claims.length, results });
  } catch {
    return json({ ok: false, code: "INVALID_REQUEST" }, 400);
  }
});
