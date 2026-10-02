# JOKER Private Room

Create a new responsive web application called JOKER.




This is a private online multiplayer card game for a very small group of adult friends. It is a recreational private project, not a commercial service.




The purpose of this first Lovable generation is to create a clean, functional, visually polished project foundation that we will immediately synchronize with GitHub and continue developing directly from the repository.




IMPORTANT:




Do not attempt to finish the complete multiplayer game in this first generation.




Do not overengineer.




Do not invent missing game rules.




Create the application structure, functional screens, buttons, navigation, reusable components, demo state and clean architecture needed for continued development.




Final player avatars, bot avatars, playing-card artwork and final decorative table artwork will be supplied separately after GitHub synchronization.







1. CORE PRODUCT




JOKER is a four-seat trick-taking card game.




A game always contains exactly four seats.




Possible configurations:




1 human + 3 bots

2 humans + 2 bots

3 humans + 1 bot

4 humans




When the host eventually starts a game, empty seats will automatically become bots.




For this initial build, create the UI and state architecture for this behavior.




Do not build sophisticated bot strategy yet.







2. INITIAL ENTRY SCREEN




Create an elegant opening screen with the title:




JOKER




Subtitle:




Ιδιωτικό παιχνίδι




Provide two primary buttons:




Δημιουργία παιχνιδιού




Συμμετοχή σε παιχνίδι




Also provide a small Settings icon.




The buttons must work in the local/demo experience and navigate to the appropriate screens.




Do not create public registration.




Do not create email/password signup.




Do not create Google/social login.







3. FUTURE PLAYER ACCESS MODEL




The final application will use an external Supabase project.




There will be only a small predefined list of human players.




Each human player will eventually have:




unique internal player ID

predefined display name

personal PIN

custom avatar

permissions/role where appropriate




The primary player/host will be allowed to create games.




Other predefined players will be able to join private rooms.




PIN verification must eventually happen securely server-side.




NEVER hardcode real PINs or secrets in frontend code.




For this initial Lovable build, create only the UI/data abstraction necessary for this future flow.




Use demo identities only.







4. CREATE GAME SCREEN




When the user presses:




Δημιουργία παιχνιδιού




open a polished Create Game screen.




Include:




Επιλογή παιχνιδιού




Use selectable cards or radio controls for three rulesets:




Popular — Our Rules




Description:




Η βασική έκδοση που παίζουμε συνήθως.




Classic Joker




Description:




Κλασική παραλλαγή Joker.




Panagiotis Special 😈




Description:




Ειδική χιουμοριστική παραλλαγή.




Do not implement undocumented differences between the rulesets yet.




Use a clean configurable ruleset architecture.







5. BOT SETTINGS




Under game selection show:




Συμπεριφορά Bots




Checkbox:




☐ Τα bots μιλάνε




When this checkbox is OFF, bots should not produce conversational reactions.




When enabled, reveal another checkbox:




☐ Επιτρέπεται ακατάλληλο λεξιλόγιο 🔞




The second option must not be selectable while bot speech is disabled.




These settings affect bot personality/reactions only.




They must NEVER affect bot playing strength or game rules.







6. CREATE ROOM BUTTON




At the bottom provide a prominent button:




Δημιουργία δωματίου




For the initial demo, this button should create a local mock room and navigate to the lobby.




Generate a demo room code such as:




J7K4




Display:




Κωδικός δωματίου




Provide functional buttons:




Αντιγραφή κωδικού




Αντιγραφή συνδέσμου




Use browser clipboard functionality where available.




The final implementation will later use Supabase-generated room/session data.




Keep mock room generation isolated.







7. JOIN GAME SCREEN




When the user presses:




Συμμετοχή σε παιχνίδι




show:




Κωδικός δωματίου




input field.




Then:




Όνομα παίκτη




For demo purposes use predefined mock player identities.




Also include:




PIN




and a button:




Είσοδος στο παιχνίδι




Do not implement real authentication yet.




Clearly isolate mock validation from production authentication architecture.







8. LOBBY




Create a four-seat lobby.




Show four player positions.




Each seat can visually be:




human player

empty

bot




Example:




Νίκος
Host




Μιχάλης
Συνδεδεμένος




Κενή θέση




Κενή θέση




Use simple placeholder avatars.




DO NOT generate final avatar artwork.




Provide:




Πρόσκληση φίλων




Αντιγραφή συνδέσμου




and a large host-only:




ΕΝΑΡΞΗ ΠΑΙΧΝΙΔΙΟΥ




button.




For the demo:




When Start Game is pressed, automatically convert empty seats into demo bots and navigate to the game table.







9. IMPORTANT VISUAL ASSET RULE




DO NOT create or finalize:




human player avatar artwork

bot avatar artwork

final playing-card illustrations

final card-back artwork

final Joker artwork

final decorative table artwork




Use clean temporary placeholders.




All final visual assets will be supplied separately after GitHub synchronization.




Build components so visual assets can be replaced easily without restructuring the application.




Do not tightly couple game logic to images.







10. VISUAL DIRECTION




Although final artwork will be supplied later, establish the correct UI direction.




The game should feel like an elegant private card room.




Use:




dark green felt-inspired playing surface

dark polished wood-inspired surrounding surfaces

subtle warm ambience

restrained gold accents

dark premium panels

clear elegant typography

tasteful depth and shadows




Avoid:




generic SaaS dashboard design

excessive gradients

neon gaming style

slot-machine/casino visual clichés

childish styling

clutter




The final experience should feel:




premium + warm + elegant + humorous







11. GAME TABLE




Create a functional responsive four-player table.




Positions:




local player: bottom

player 2: left

player 3: top

player 4: right




Each seat component must support:




placeholder avatar

player name

bot/human state

current total score

current declaration/bid

tricks currently taken

connection state

dealer indicator

active-turn indicator




Other players' cards must appear face-down.




The local player's cards appear face-up at the bottom.




Use placeholder card visuals only.




Create a central area where played cards can appear.







12. PLAYER HAND INTERACTION




For the demo game table:




Display a sample local hand.




Cards should be individually clickable/tappable.




When selected:




raise the selected card slightly

visually highlight it




Provide a button:




Παίξε φύλλο




For demo purposes, clicking the button may move the selected card to the central trick area.




Do not pretend this is final rules validation.




Keep demo interaction logic separate from future game engine logic.







13. TURN TIMER




Create a visible turn timer.




Default display:




00:30




The architecture should support a 30-second turn duration.




For the demo, a simple countdown is acceptable.




Do not implement punitive timeout game rules yet.







14. TEMPORARY TABLE MESSAGES




Every game mode will support lightweight temporary messages.




This is NOT a traditional persistent chat.




Add a button/icon:




💬 Συνομιλία




When pressed, open a compact panel/modal.




Allow selection of:




Player 2

Player 3

Player 4

Όλοι




Use the actual current player/bot display names dynamically.




Provide a short message input.




Provide:




Αποστολή




When sent, display the message in a speech bubble for approximately 5 seconds.




Then automatically remove it.




Do not create:




conversation history

persistent chat panel

message archive

database message history




Architect this feature so it can later use ephemeral Supabase Realtime events.




If the recipient is a bot, the future implementation may generate contextual predefined responses.




Do not add an LLM dependency.







15. SCOREBOARD BUTTON




Add a clearly accessible scoreboard icon/button on the game table.




Button label/tooltip:




Σκορ




When pressed, open a large polished overlay/modal titled:




Συνολικά σκορ




The modal must display four player columns using their current names.




The scoreboard must be designed to support the entire 24-deal game.







16. GAME PHASES




Represent the game structure in typed configuration/data.




The game consists of four phases.




Γύρα 1




Deals:




1
2
3
4
5
6
7
8 cards




Γύρα 2




Four deals of:




9
9
9
9 cards




Γύρα 3




Deals:




8
7
6
5
4
3
2
1 cards




Γύρα 4




Four deals of:




9
9
9
9 cards




Total:




24 deals.




Do not scatter these values throughout components.




Create a single typed game configuration.







17. SCOREBOARD DESIGN




The Συνολικά σκορ modal should visually separate:




Γύρα 1




Γύρα 2




Γύρα 3




Γύρα 4




For every deal display:




deal number

cards dealt

score for player 1

score for player 2

score for player 3

score for player 4




Allow special rows for future:




bonus

penalty

premia




At the bottom prominently display:




ΣΥΝΟΛΟ




with all four current totals.




Negative values such as:




−200




should be immediately visually distinguishable.




The scoreboard must remain usable on mobile.




Horizontal scrolling inside the scoreboard is acceptable only if necessary and should be smooth and intentional.







18. CONFIRMED BASIC SCORING




Create an isolated, typed and testable scoring foundation for these confirmed rules.




If the player's declaration is fulfilled exactly:




Declared 0 / took 0:




50 points




Declared 1 / took 1:




100 points




Declared 2 / took 2:




150 points




Declared 3 / took 3:




200 points




Declared 4 / took 4:




250 points




Continue +50 for each additional exact declaration.




General normal exact formula:




50 + (50 × tricks declared)







19. ALL-TRICKS SPECIAL SCORING




If a player declares ALL tricks available in the current deal and successfully takes ALL of them:




score:




100 × number of tricks




Examples:




2 cards:
declared 2, took 2 = 200




5 cards:
declared 5, took 5 = 500




9 cards:
declared 9, took 9 = 900




This special case overrides the normal exact-declaration formula.







20. MISSED DECLARATION




If the player fails to match the declaration but takes at least one trick:




score:




10 × actual tricks taken




Examples:




declared 3, took 4:




40




declared 3, took 2:




20




declared 0, took 2:




20







21. ZERO-TRICK PENALTY




If a player declares one or more tricks but ultimately takes zero:




score:




−200




This penalty is always fixed at −200.




Example:




declared 3, took 0:




−200




Do not create variable −200/−500/etc. penalties.







22. IMPORTANT SCORING LIMITATION




Do NOT invent or implement the final phase/premia bonus rules yet.




Popular — Our Rules and Classic Joker will eventually differ in their phase bonus behavior.




Create interfaces/types/extension points for future ruleset-specific bonus calculation.




Do not guess the missing rules.







23. DECK MODEL




Create a typed deck model for the final Joker deck.




Start conceptually from ranks:




6, 7, 8, 9, 10, J, Q, K, A




in four suits.




Remove:




6♠
6♣




Keep:




6♥
6♦




Add:




2 Jokers




Final playable deck:




34 standard cards + 2 Jokers = 36 cards




Do not implement undocumented special Joker behavior yet.







24. BOT ARCHITECTURE




Prepare clean architecture for strong future bots.




Separate:




game rules

legal move calculation

game state

bot strategy

bot personality

bot reactions/messages

UI




The future bots should eventually play Joker strongly.




They may use information legitimately available to a human player:




cards already played

declarations

tricks taken

remaining required tricks

trump

observed suit voids

Joker usage

known public game history




Bots must NEVER use hidden cards belonging to opponents when making decisions.




The final goal is:




strong but fair bots




For this initial Lovable build, placeholder/demo bot behavior is sufficient.




Do not build random bot behavior deeply into the architecture.







25. RESPONSIVE DESIGN




Mobile use is extremely important.




Support:




desktop

tablet

landscape phone

portrait phone




Requirements:




cards must remain readable

cards must have comfortable touch targets

controls must not cover the player's hand

avatars/player states must remain visible

dialogs must fit small screens

scoreboard must remain usable

no accidental page-level horizontal scrolling

no tiny desktop interface simply scaled down

no awkward internal browser scrollbars around the game table




Prioritize touch interaction.







26. PROJECT ARCHITECTURE




Use clean maintainable TypeScript.




Keep domain logic outside visual components.




Create clear separation for:




domain models

deck

game configuration

game state

scoring

rulesets

bot strategy

bot personality

room/lobby

multiplayer/realtime adapter

ephemeral messaging

UI components




Avoid a giant monolithic Game component.




Avoid duplicated rules.




Avoid tightly coupling components to demo data.







27. EXTERNAL SUPABASE READINESS




We will connect our own external Supabase project after this initial generation.




Prepare the architecture for future Supabase support for:




predefined players

player identity

secure PIN verification

rooms

room membership

game sessions

authoritative game state

realtime updates

reconnect/session recovery




The final multiplayer architecture should treat server/backend state as authoritative.




Clients must eventually NOT be trusted to:




shuffle/deal cards

determine legal moves

determine trick winner

calculate authoritative score

modify another player's state




Do not create fake security by putting sensitive logic in frontend-only code.




For this initial generation, use isolated local mock/demo adapters.







28. DEMO MODE




The first generated project must be visually and functionally explorable without Supabase.




Create isolated demo/mock data that allows us to test:




opening screen

Create Game

game-mode selection

bot settings

room creation

lobby

automatic demo bot filling

Start Game

four-player table

card selection

demo card play

30-second timer

temporary message

scoreboard opening/closing

responsive behavior




Mock/demo state must be easy to remove later.







29. FINAL VISUAL ASSETS WILL COME LATER




This requirement is critical.




Do NOT spend effort generating final:




human caricature avatars

bot caricature avatars

card-face illustrations

Joker illustration

card-back illustration

decorative table artwork




Use clearly replaceable placeholders.




We already have a separate visual direction and will provide these assets ourselves after GitHub synchronization.




Build reusable components that accept asset URLs/imports so replacing placeholders is straightforward.







30. INITIAL UI LANGUAGE




Use Greek for the initial interface.




Examples:




JOKER




Ιδιωτικό παιχνίδι




Δημιουργία παιχνιδιού




Συμμετοχή σε παιχνίδι




Επιλογή παιχνιδιού




Συμπεριφορά Bots




Τα bots μιλάνε




Επιτρέπεται ακατάλληλο λεξιλόγιο




Δημιουργία δωματίου




Πρόσκληση φίλων




ΕΝΑΡΞΗ ΠΑΙΧΝΙΔΙΟΥ




Συνομιλία




Σκορ




Συνολικά σκορ




Γύρα




ΣΥΝΟΛΟ




Keep text organization clean enough for future localization, but do not create an unnecessarily complex internationalization system now.







31. DO NOT ADD




Do NOT add:




payments

subscriptions

public signup

email verification

social login

public matchmaking

public player profiles

friends system

social feeds

marketing analytics

advertisements

unnecessary admin dashboards

persistent chat history

LLM APIs

unnecessary AI services

final artwork

speculative Joker rules







32. FIRST BUILD GOAL




This first Lovable build should give us:




functional opening screen

functional buttons/navigation

Create Game flow

Join Game flow

three selectable game modes

configurable bot speech options

room/lobby UI

functional demo Start Game flow

responsive four-seat game table

reusable placeholder card components

replaceable avatar components

basic demo card interaction

turn timer

temporary message UI

complete scoreboard overlay foundation

typed 24-deal game structure

isolated confirmed scoring foundation

typed 36-card deck model

clean ruleset extension architecture

bot strategy extension architecture

external Supabase-ready data abstraction

isolated demo/mock state

polished responsive UI

clean GitHub-ready TypeScript codebase




The application must be a solid engineering foundation, NOT a throwaway visual prototype.




Before implementing, reason about the domain/component architecture.




Do not invent missing requirements.




Where a future feature is not yet fully specified, create a clean extension point rather than guessing its behavior.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/d6b2cfed-871d-4539-b39e-cce6d3eba7c1).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
