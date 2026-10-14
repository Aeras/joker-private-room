# Biriba bot decision model

The bot chooses from its own hand and public melds/discards. It does not inspect the opponents' or partner's hidden cards, the stock order, or the packets. Every selected move still passes through the authoritative `biribaAction` validator.

## Rule boundary

Greek Biriba has many variants ([Pagat rules](https://www.pagat.com/rummy/biriba.html)). This application uses the rules in `supabase/functions/biriba-commands/rules.ts` and `engine.ts`: runs only, at most one wildcard per run, team-owned melds, a meld required to pick up discards, a seven-card biriba before taking a packet, and two biribas including a clean one plus a played packet before closing. Published advice about equal-rank sets or a single-biriba close does not apply here.

## Decision sequence

1. **Draw phase:** enumerate legal runs and extensions using the bot's hand plus the public discard pile. Pick up the pile only when a pile card can be melded immediately and the estimated value exceeds the cost of taking the entire pile. Otherwise draw from stock. The decision never examines the stock's card identity.
2. **Meld phase:** enumerate clean and one-wildcard runs, including Ace above King, and legal extensions to own or partner melds. Value actual card points, biriba bonuses, trump-suit bonuses, packet access, and a possible close. Penalize spending a wildcard in a short run or dirtying a clean biriba.
3. **Hand safety:** retain a discard card. When closing is not yet legal, retain a further card so that discarding does not strand the player with an illegal empty hand. Emptying the hand is allowed when a newly made biriba immediately grants a packet.
4. **Discard phase:** protect wildcards, connected same-suit cards, and cards that extend team melds. Avoid throwing a public endpoint of an opponent meld when a safer discard exists. Isolated high-point cards are more expendable.

These are deterministic, bounded heuristics rather than a claim of optimal play. The source of the strategic priorities is the [Pagat Biriba guide](https://www.pagat.com/rummy/biriba.html), especially its partnership, packet, discard-pile, and clean-biriba sections. The application-specific legality and scoring always take precedence.

The regression suite covers pickups, high Ace, clean biriba selection, partner extension, packet collection, hidden-information isolation, safe discard, and seeded bot-only rounds for two and four players. Live human-versus-bot quality still needs player testing and could guide later tuning.
