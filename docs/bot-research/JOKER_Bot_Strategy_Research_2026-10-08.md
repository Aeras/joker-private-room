# JOKER — Εκτενής έρευνα στρατηγικής και προδιαγραφή ισχυρών bot

**Έκδοση:** Ερευνητικό έγγραφο 1.0 · **Ημερομηνία:** 8 Οκτωβρίου 2026  
**Έργο:** JOKER, `Aeras/joker-private-room`  
**Κατάσταση:** Έρευνα / πρόταση σχεδιασμού. **Δεν έγιναν αλλαγές στον κώδικα, στους κανόνες, στη βάση, στα bot ή στο deployment.**

> **Κρίσιμος διαχωρισμός:** (ΠΗΓΗ) = καταγεγραμμένο σε δημοσιευμένη πηγή· (ΕΡΜΗΝΕΙΑ) = δικό μας τεχνικό συμπέρασμα· (ΠΡΟΤΑΣΗ) = προτεινόμενη συμπεριφορά του JOKER, όχι υπάρχων κανόνας ή ήδη υλοποιημένο χαρακτηριστικό. Οι διαδικτυακές πηγές αφορούν *διαφορετικές εκδοχές* του Joker και συγγενών παιχνιδιών. Το canonical ruleset του δικού μας παιχνιδιού υπερισχύει απολύτως.

## 1. Εκτελεστικό συμπέρασμα

Η ουσιαστική βελτίωση δεν είναι να αυξήσουμε απλώς τον αριθμό των Monte Carlo simulations. Χρειάζεται αλλαγή **αντικειμενικού σκοπού**: από «πάρε τόσες μπάζες όσες δήλωσες» σε «πάρε υψηλή αναμενόμενη τελική κατάταξη, υπολογίζοντας τη δική σου δήλωση, τις δηλώσεις και τις βαθμολογίες των αντιπάλων, τα διαθέσιμα φύλλα, την υπόλοιπη διάρκεια και τον κίνδυνο». Στο παραδοσιακό Joker η ακριβής δήλωση παραμένει εξαιρετικά σημαντική· δεν επιτρέπεται το bot να τη θυσιάζει μηχανικά μόνο για να ενοχλήσει κάποιον.

Η ειδική γεωργιανή πηγή **rogor.ge** παρέχει απευθείας στρατηγικές για αυτό ακριβώς το παιχνίδι: καταμέτρηση των ισχυρών φύλλων, προσαρμογή της δήλωσης σε κινδύνους, χρήση Joker ώστε να *μην* πάρεις ανεπιθύμητη μπάζα, προσπάθεια να αφήσεις αντίπαλο χωρίς μπάζα και επιλογή ανοίγματος με βάση μήκος χρώματος/ατού. Αυτή είναι η υψηλότερης χρησιμότητας πηγή τακτικών για το project. Ο οδηγός του **Pagat** τεκμηριώνει πλήρως τη διάκριση High/Low Joker και τον κρίσιμο κίνδυνο όταν High Joker ανοίγει ζητώντας μη ατού: παίκτης χωρίς το ζητούμενο χρώμα μπορεί, υπό αυτό το ruleset, να κόψει με ατού. [S1][S2]

Τα συγγενή παιχνίδια **Oh Hell!** επιβεβαιώνουν γενικές αρχές ακριβούς δήλωσης, «χάνω σκόπιμα μια μπάζα» και σωστής διαχείρισης ατού, αλλά **ΔΕΝ** πρέπει να μεταφέρουμε τους δικούς τους κανόνες σκοραρίσματος, Joker ή lead restriction στο JOKER. [S3][S4]

**Σύσταση υλοποίησης:** πρώτα ακριβές μοντέλο κανόνων και simulator/benchmarks, μετά scoring-aware policy και probabilistic belief state, στη συνέχεια Joker semantics + multi-trick planning και τέλος προαιρετικό information-set search. Πριν προχωρήσουμε, πρέπει να μετρήσουμε γιατί εμφανίζονται συχνά τα παρατηρημένα αποτελέσματα ανθρώπου +1400 έναντι bot -300/-400/-200: αποτυχίες δήλωσης, κακές εναλλακτικές κινήσεις, κακός προσδιορισμός νόμιμων Joker options, αποκλίσεις σε κανόνες, ή συνδυασμός.

## 2. Πηγές: τι πράγματι βρέθηκε

### 2.1 Άμεσα σχετικές γεωργιανές πηγές

**[S1] rogor.ge — «როგორ ვითამაშოთ ჯოკერი კარგად» («Πώς να παίζεις καλά Joker»), 11/7/2024.**

- (ΠΗΓΗ) Η καταμέτρηση φύλλων είναι κεντρική· αρκεί συχνά να παρακολουθείς τουλάχιστον Α, Κ, Q, χωρίς να αποστηθίζεις αναγκαστικά όλο το ιστορικό.
- (ΠΗΓΗ) Παράδειγμα: έχεις δηλώσει 3, έχεις ήδη πάρει 3 και κρατάς Joker. Αν δεν προγραμματίσεις ποιος θα κερδίσει το υπόλοιπο, διακινδυνεύεις να καταστρέψεις την ακριβή σου δήλωση. Η πηγή συνδέει ρητά αυτό το δίλημμα με το premia.
- (ΠΗΓΗ) Συμβουλή «ασφάλισης» δήλωσης: ο παίκτης που υπολογίζει 4 πιθανές μπάζες ίσως δηλώσει 3 επειδή ένας αντίπαλος μπορεί να του κόψει πιθανή μπάζα με Joker. **Δεν είναι καθολικός μαθηματικός κανόνας**: πρέπει να ελεγχθεί υπό το scoring του JOKER.
- (ΠΗΓΗ) Για να προκαλέσεις το «ხიშტი» / hist αντιπάλου, υπάρχει τακτική ανοίγματος με υψηλό φύλλο, με συγκεκριμένη ανάλυση του τι εντυπώσεις δημιουργεί στους άλλους.
- (ΠΗΓΗ) Αξία έχει η επιλογή χρώματος ανοίγματος βάσει μήκους στο χέρι, κίνδυνου ατού και ευκαιριών μελλοντικού ruff.
- (ΠΗΓΗ) Η πηγή περιλαμβάνει και **συμβουλές για παιχνίδι σε ζευγάρια**, τις οποίες **απορρίπτουμε** για το δικό μας 4-player free-for-all: θα ήταν αθέμιτη ή λανθασμένη μεταφορά.

**[S5] forum.ge — «ჯოკერი: სტრატეგიები და ხრიკები» («Joker: στρατηγικές και τεχνάσματα»).** Η δημόσια καταχώριση επιβεβαιώνει θέματα συζήτησης: τι μετρούν οι παίκτες, πώς θυμούνται φύλλα, πώς παρασύρουν αντίπαλο και επικοινωνία σε ζευγάρια. Ωστόσο **δεν ανακτήθηκε αξιόπιστα ολόκληρη η συζήτηση ή οι απαντήσεις**· επομένως δεν αποδίδουμε σε συμμετέχοντες συγκεκριμένες ατάκες/στρατηγικές που δεν είδαμε. Οι προτάσεις για συνεργασία ζευγαριών δεν εφαρμόζονται στο FFA.

### 2.2 Canonical εξωτερικός οδηγός της γεωργιανής μορφής

**[S2] Pagat — Joker (Georgia), οδηγός με συνεισφορά Alexander Tvaladze.**

- (ΠΗΓΗ) 36 φύλλα: 34 συνηθισμένα + δύο Joker αντί για μαύρα εξάρια, 4 ανεξάρτητοι παίκτες, 24 μοιρασιές σε φάσεις 1→8, τέσσερα 9άρια, 8→1, τέσσερα 9άρια.
- (ΠΗΓΗ) Οι δηλώσεις είναι ακριβής αριθμός μπάζων. Σε αυτή την παραλλαγή ο τελευταίος δηλώνων δεν μπορεί να κάνει το άθροισμα των δηλώσεων ίσο με τις διαθέσιμες μπάζες.
- (ΠΗΓΗ) Υποχρέωση follow suit· αν αδυνατείς, ατού· εάν ούτε ατού υπάρχει, οποιοδήποτε φύλλο· Joker επιτρέπεται ως εξαίρεση.
- (ΠΗΓΗ) Joker μπορεί να δηλωθεί High ή Low. Όταν ανοίγει τη μπάζα, επιλέγεται και ζητούμενο χρώμα.
- (ΠΗΓΗ) **High Joker που ανοίγει ζητώντας μη ατού δεν είναι ασφαλές 100%**: αντίπαλος χωρίς το χρώμα μπορεί να χρησιμοποιήσει ατού και να το νικήσει. Δεύτερο High Joker αργότερα στο ίδιο trick επίσης μπορεί να κερδίσει.
- (ΠΗΓΗ) Low Joker συνήθως χάνει, αλλά υπάρχουν καταστάσεις στις οποίες μπορεί να κερδίσει αναγκαστικά.
- (ΠΗΓΗ) Υπάρχουν σημαντικές παραλλαγές στο scoring, στις ποινές hist, premia, επιλογή trump στα 9άρια και στον κανόνα ατού έναντι High Joker. Καμία εξωτερική παραλλαγή δεν πρέπει να υπερισχύει των confirmed rules του project.

**Ασυμβατότητα σκορ:** Το Pagat περιγράφει άλλο σύστημα exact/failed bidding από το custom popular scoring του JOKER. ΑΠΑΓΟΡΕΥΕΤΑΙ να αντιγράψουμε αριθμητικούς συντελεστές σκοραρίσματος. Το bot πρέπει να χρησιμοποιεί τον **υφιστάμενο authoritative `scoreDeal`/rules engine του αντίστοιχου mode**.

**[S6] Josh's Games / εφαρμογή Joker (Georgia).** Επιβεβαιώνει παρόμοιο ιστορικό κανόνων και την ύπαρξη AI opponents, αλλά η δημόσια σελίδα **δεν αποκαλύπτει τον κώδικα/αλγόριθμο των bots**. Δεν ισχυριζόμαστε ότι γνωρίζουμε τη στρατηγική τους.

**[S7] mygame.ge/joker** εμφανίζει έκδοση με **38 κάρτες / παιχνίδι σε ζευγάρια**, με άλλες Joker semantics. **Δεν είναι η δική μας έκδοση**. Κρατείται ως τεκμήριο ότι ο ίδιος τίτλος αναφέρεται σε ουσιωδώς διαφορετικά παιχνίδια.

### 2.3 Συγγενή exact-bid trick-taking games

**[S3] Pagat — Oh Hell!**: το forced non-equal bid total, η διαχείριση του ακριβούς bid, τα short/long hands και η δυναμική underbid/overbid είναι χρήσιμα ως *εμπνεύσεις*. Πρέπει να διατηρήσουμε χωριστά τη νομοτέλεια ότι δεν υπάρχουν Joker με ίδιους κανόνες και το διαφορετικό scoring.

**[S4] OhHell.app — Strategy Guide (2026)**: συστήνει ρεαλιστική εκτίμηση πιθανών νικηφόρων φύλλων, αποφυγή ανεπιθύμητης επιπλέον μπάζας, διαχείριση ατού, φύλαξη «escape card», και πρόβλεψη του under/over-bid table. Οι εμπειρικοί ισχυρισμοί επιτυχίας αποτελούν στατιστικά της δικής τους εφαρμογής, **όχι απόδειξη για το JOKER**.

**[S8] PlayBoardGames — Oh Hell rules/strategy**: εξηγεί «lose high» (πέτα το μεγαλύτερο φύλλο που οπωσδήποτε χάνει) και εκμετάλλευση αντιπάλου που είναι αναγκασμένος να πάρει. Να χρησιμοποιηθεί σαν heuristic υποψήφια κίνηση, όχι σαν υποχρεωτικός κανόνας.

### 2.4 Σχετική ερευνητική βιβλιογραφία AI

**[S9] Rebstock et al. (2019), Policy Based Inference in Trick-Taking Card Games.** Οι κινήσεις αντιπάλων παρέχουν ενδείξεις για το πιθανό κρυφό τους χέρι. Opponent-model-based inference βελτιώνει δειγματοληψία πιθανών χεριών. Η έρευνα είναι στο Skat, όχι στο Georgian Joker.

**[S10] Li, Zanuttini, Ventos (AAAI 2024), Opponent-Model Search in Games with Incomplete Information.** Τεκμηριώνει την αξία μοντέλων συμπεριφοράς αντιπάλων και robust decisions υπό ατελή πληροφορία.

**[S11] Cowling/Ward/Powley (2012), Ensemble Determinization MCTS.** Sampling κρυφών καταστάσεων + simulation είναι χρήσιμο αλλά η determinization έχει τυπικά προβλήματα όταν υποθέτει ότι ο μελλοντικός εαυτός γνωρίζει ποια κρυφή κατάσταση είναι αληθινή.

**[S12] Powley/Cowling/Whitehouse (2017), Memory Bounded MCTS.** Η αποδοτική μνήμη και bounded search έχουν σημασία για διαδραστικές/κινητές εφαρμογές. Δεν απαιτείται τεράστια μνήμη για αξιοπρεπές search.

**[S13] Demirdöver (2026), DTCard.** Offline training για Hearts/Whist/Spades είναι μια πιθανή μακροπρόθεσμη κατεύθυνση, όχι λογικό πρώτο βήμα για μικρό ιδιωτικό project χωρίς dataset και baseline.

## 3. Ακριβείς ιδιαιτερότητες του δικού μας JOKER

**Γνωστοί, ήδη συμφωνημένοι κανόνες από τις συζητήσεις του project** (πρέπει να επαληθευθούν έναντι του *τρέχοντος* canonical main προτού γραφτεί κώδικας):

- 4 θέσεις, 36 φύλλα (34 + 2 Joker), τα μαύρα 6 απουσιάζουν.
- 24 μοιρασιές, τέσσερις φάσεις 1→8 / 9×4 / 8→1 / 9×4.
- High Joker lead με αίτημα **μεγαλύτερου μη ατού χρώματος** ΔΕΝ μετατρέπεται αυτομάτως σε ατού. Οι άλλοι ακολουθούν το ζητούμενο χρώμα αν μπορούν· χωρίς αυτό υπάρχει πιθανή υποχρέωση ατού. Εξετάζουμε πάντα τον canonical resolver.
- Έχουν συμφωνηθεί 4 modes: classic, popular, Caucasus variant, prank. **Η στρατηγική αλλάζει αναλόγως mode, όχι το rules engine.** Η prank mode έχει επιπρόσθετες ειδικές αλληλεπιδράσεις και δεν πρέπει να καθορίζει το benchmark της αγωνιστικής δικαιοσύνης.
- Custom popular: PASS+0=+50· ακριβής θετική δήλωση βαθμολογείται σύμφωνα με το confirmed custom contract· over/under και zero-trick penalty διαφέρουν από Pagat. Υπάρχει bonus ανά τετράδα εννιαριών υπό ειδικές συνθήκες και διορθώσεις score. Οι αριθμητικοί κανόνες **δεν επαναγράφονται** σε AI evaluator.
- Το προσωρινό takeover bot αποσυνδεδεμένου πραγματικού παίκτη πρέπει, σύμφωνα με νέα συμφωνία, να παίρνει τυχαίο Tier 1/2/3 κάθε φορά που αναλαμβάνει με σταθερό tier για τη συγκεκριμένη ανάληψη. **Αυτό είναι χωριστή Αλλαγή #1 και δεν έχει υλοποιηθεί από την παρούσα μελέτη.**

**Απαραίτητο contract audit πριν την υλοποίηση:** legal cards, Joker decision modes / forced largest, trick winner, trump chooser των 9αριών, bid restrictions, all-mode scoring, premia chronology, τελευταίες μπάζες, tie placements, 30-second human timeout, bot runtime budget. Μην θεωρηθεί ότι οι εξωτερικές πηγές αποδεικνύουν συγκεκριμένο branch του source.

## 4. Γιατί η σημερινή συμπεριφορά μπορεί να είναι αδύναμη — υποθέσεις προς επαλήθευση

Από τον προηγούμενο read-only code review της συνομιλίας: bot tiers `strong-basic-v1`, `memory-inference-v1`, `probability-simulation-v1`. Στο τελευταίο review αναφέρθηκε διαφορά στον αριθμό simulations κατά τις δηλώσεις και περιορισμένο lookahead στην επιλογή φύλλου. **Δεν επανεπαληθεύτηκε εδώ τρέχον GitHub HEAD ούτε εκτελέστηκαν benchmarks· άρα οι παρακάτω διαγνώσεις είναι υποθέσεις, όχι εργαστηριακό εύρημα.**

1. **Λάθος utility function:** υπερβολικά μεγάλη βαρύτητα στη δική μου μπάζα και μικρή/μηδενική στο τελικό outcome.
2. **Πρόωρο κάψιμο Joker:** ευρετική «χρειάζομαι μπάζα → παίξε το δυνατότερο», χωρίς opportunity cost/κίνδυνο trump/άλλον Joker.
3. **Μοντελοποίηση αντιπάλων:** δεν προϋπολογίζονται οι δηλώσεις, τα επικίνδυνα αναγκαστικά overshoots, οι βαθμολογικές απειλές.
4. **Weak bidding calibration:** παίρνει ακριβά ρίσκα σε μικρή πιθανότητα exact, ειδικά στα 9άρια.
5. **Simulation mismatch:** simulated opponents συμπεριφέρονται «τυχαία» αντί σαν παίκτες με δηλώσεις και προσωπικούς στόχους.
6. **Παράλειψη adaptive tactics:** όταν ήδη έχει αποτύχει η δήλωση, πρέπει να αλλάζει policy αλλά όχι να αυτοκαταστρέφεται.
7. **Απουσία telemetry:** χωρίς μετρήσεις ανά mode/deal/tier δεν γνωρίζουμε εάν τα μεγάλα αρνητικά σκορ είναι bug, κακή στρατηγική ή συνέπεια ακραίας παραλλαγής.

## 5. Προτεινόμενος αλγόριθμος: πολλαπλά επίπεδα λήψης αποφάσεων

### 5.1 Layer A — Authority / legality (απαράβατο)

Ο server δίνει μόνο `PlayerView` του bot: δικό του hand, δημόσιο ιστορικό, δηλώσεις, περασμένες μπάζες, τρέχον trick, τρέχον trump, ranking/deal state. **Ποτέ** αντίπαλα hidden hands ή undealt deck, ακόμη κι αν ο server τα έχει. Το game engine παράγει όλες τις `legalActions`, και η στρατηγική κατατάσσει ΜΟΝΟ αυτές. Το score προέρχεται αποκλειστικά από τον authoritative scorer.

### 5.2 Layer B — Ακριβής μνήμη και συμπερασμός

Για κάθε κάρτα: `own`, `public_played`, `public_exposed` (όπου νόμιμα γνωστή), `unknown`. Για κάθε παίκτη/χρώμα: confirmed void, πιθανότητα μήκους χρώματος, πιθανότητα να έχει κάθε ατού/Joker. Το «confirmed void» πρέπει να βασίζεται στις **ακριβείς** υποχρεώσεις/εξαιρέσεις Joker και όχι απλώς στην οπτική διαφορά χρώματος.

**Sampling belief state:** αναθέτει τα άγνωστα φύλλα στις κρυφές θέσεις των άλλων μόνο με τρόπο συμβατό με (α) αριθμό φύλλων ανά παίκτη, (β) βεβαιωμένα void constraints, (γ) ήδη δημόσιες κάρτες και (δ) τυχόν επιβεβαιωμένο public trump indicator. *Προαιρετικά* βαρύνει κάθε δείγμα σύμφωνα με bids και ιστορικές επιλογές του παίκτη. Οι πιθανότητες δεν πρέπει να χαρακτηρίζονται «βεβαιότητες» αν είναι απλώς inference.

Ειδικά στις μοιρασιές 1–8, υπάρχουν αμοίραστα φύλλα: το belief sampler **δεν πρέπει** να μοιράσει υποχρεωτικά όλα τα άγνωστα στους τρεις αντιπάλους· το υπόλοιπο μπαίνει στο `undealt_pool` ως κρυφό και απρόσιτο.

### 5.3 Layer C — Επιλογή δήλωσης

Για κάθε νόμιμο `bid b` προσομοιώνει many plausible distributions + opponent policies και μετρά **ολόκληρη κατανομή μπάζων**, όχι μόνο μέσο όρο. Προτιμά το bid που μεγιστοποιεί την προσδοκώμενη πραγματική χρησιμότητα, μαζί με πιθανότητα exact, κίνδυνο hist, premia και τελικό rank.

`ValueBid(b) ≈ E[Δmy_score | b] + λ_stage·E[rank_gain | b] − ρ·tail_risk(b)`

Το `λ_stage` μεγαλώνει όσο πλησιάζει το τέλος / υπάρχει μεγάλη βαθμολογική ανάγκη. Δεν εφαρμόζεται άκαμπτα το γεωργιανό «δήλωνε ένα λιγότερο»: εξετάζεται εναντίον της πραγματικής κατανομής. Υπολογίζεται η legal restriction του τελευταίου δηλούντος στο συγκεκριμένο mode.

Η επιλογή ατού στις ειδικές εννιάρες πρέπει να εξετάζει **αναμενόμενο total trick distribution / score** για κάθε επιτρεπόμενο trump ή no-trump, όχι μόνο «έχω περισσότερα φύλλα αυτού του χρώματος».

### 5.4 Layer D — Joker policy: ξεχωριστός planner

Για κάθε υποψήφιο Joker legal action, αξιολόγησε συνδυασμούς:

- High ή Low;
- Αν lead: ποιο επιτρεπόμενο requested suit;
- Αν ειδική semantic επιλογή: largest/smallest ή άλλο επιτρεπόμενο action όπως προβλέπει το engine;
- Πόσοι παίζουν μετά το bot σε **αυτή** τη μπάζα;
- Πόσο πιθανό είναι να μην έχουν το requested suit;
- Πόσο πιθανό είναι να έχουν αναγκαστικά ατού;
- Πιθανότητα να έχει και να παίξει δεύτερο High Joker μεταγενέστερος παίκτης;
- Αξία διατήρησης Joker για *επόμενες* μπάζες;
- Ποιος κερδίζει τελικά την τρέχουσα μπάζα και πώς αυτό αλλάζει όλα τα bids;

**Συγκεκριμένο υπολογιστικό παράδειγμα:** trump ♥, bot ανοίγει High Joker ζητώντας ♠. Αν παίκτης χωρίς ♠ αναγκαστεί να παίξει ♥ και η canonical παραλλαγή του το επιτρέπει, μπορεί να κερδίσει το ♥. Επομένως υπολόγισε `P(Joker wins | requested ♠, known history, seat order, trump ♥)` και σύγκρινέ το με High Joker→♥, Low Joker→... και συμβατικά φύλλα. Το «έχω δύο Joker» δεν σημαίνει ότι πρέπει να ξοδέψω τον έναν αμέσως.

**Έλεγχος διαφορετικών cases:** Joker lead early/late · opponent Joker already played · trump depleted · known void · multi-suit forced high semantics · bot exact achieved · opponent on hist threat · currently losing bid · last trick. Το planner πρέπει να δοκιμάζει το **canonical winner function** σε όλες τις αναθέσεις φύλλων, όχι να εισάγει δική του ερμηνεία.

### 5.5 Layer E — Επιλογή χαρτιού με προοπτική πολλών μπάζων

Σε κάθε νόμιμο action `a`, αντί «πάρε το δυνατότερο φύλλο τώρα», κάνε:

1. Δημιούργησε belief-consistent hypothetical hands.
2. Παίξε την τρέχουσα μπάζα με opponents που ενεργούν σύμφωνα με *τις δικές τους* δηλώσεις/σκορ.
3. Συμπλήρωσε τις υπόλοιπες μπάζες με bounded rollout ή IS-MCTS.
4. Υπολόγισε *πραγματικό* score του deal για όλους, premia impact όπου εφαρμόζεται, και επίδραση στη θέση.
5. Συγκέντρωσε expected value, exact-bid likelihood, worst-case, win-probability estimate.
6. Επίλεξε το καλύτερο action εντός χρόνου.

Η επιλογή **μπορεί** να είναι να χάσεις, να πάρεις, να στερήσεις ή να παραχωρήσεις μπάζα. Το bot που έχει ήδη κάνει overshoot μπορεί να συνεχίσει να «κλέβει» μπάζες από πρωτοπόρο αν αυτό έχει θετικό expected effect, αλλά δεν είναι αυτόματος κανόνας.

### 5.6 Layer F — Score-aware ανταγωνιστική χρησιμότητα

Κάθε bot παίζει ανεξάρτητα ως ανταγωνιστής. Δεν σχηματίζει μυστική συμμαχία και δεν στοχοποιεί άνθρωπο *λόγω ιδιότητας human*. Η απόφαση βασίζεται στην πραγματική βαθμολογική απειλή.

Προτεινόμενη σταδιακή utility:

`U(a) = α·E[own_current_deal_score] + β·E[future_rank_value] + γ·P(finish_first) − δ·downside_risk`.

Η τιμή `P(finish_first)` δεν είναι αξιοπρεπές να αναφέρεται ως ακριβής χωρίς calibration. Για κοντινό χρονικό ορίζοντα μπορεί να προσεγγιστεί με rollouts σε υπόλοιπες μοιρασιές, για πρώιμο παιχνίδι με smooth rank-aware proxy. Τα βάρη είναι **hyperparameters που θα συντονιστούν με benchmarks**, όχι αυθαίρετα hardcoded «χτύπα πρώτον».

**Παράδειγμα**: αρχηγός 1.200, bot 900, bot 800, άλλος 400. Ο leader χρειάζεται μία ακόμα μπάζα για exact +300. Το bot μπορεί να χάσει το δικό του exact +100 για να του στερήσει το +300 **μόνον αν** το αναμενόμενο κέρδος στην τελική του θέση δικαιολογεί το δικό του κόστος. Αν το bot είναι ήδη πολύ πίσω στο τελευταίο deal, ίσως πρέπει να παίξει πιο επιθετικά· αν υπάρχει μεγάλο υπόλοιπο παιχνιδιού, πρέπει να προστατεύει συχνότερα το δικό του σκορ.

**Hist/−200:** προτίμησε να στερήσεις *όλες* τις μπάζες από αντίπαλο με θετικό bid μόνον αν είναι πιθανό/νόμιμο και δεν αυξάνει υπερβολικά δικό σου σκορ ή ανοίγει ευκαιρία σε άλλο επικίνδυνο αντίπαλο. Δεν αρκεί «στόχευσε τον πρώτο».

**Premia:** η στρατηγική πρέπει να προβλέπει πόσες exact δηλώσεις μένουν σε κάθε φάση, ποιοι μπορούν πραγματικά να το πάρουν και πώς η χαμένη μία δήλωση αλλάζει τη σύγκριση. Μην αναπαράγεις μόνος σου τον τύπο προσαρμογής· πάρε αποτέλεσμα από τον canonical scorer.

### 5.7 Layer G — Opponent policy και μη προβλέψιμο παιχνίδι

Οι αντίπαλοι σε simulation δεν είναι τυχαία bots: χαρακτηρίζονται από δημόσιες κινήσεις, επιθετικότητα bid, ανοχή κινδύνου, επίγνωση σκορ. Μην χρησιμοποιείς ιδιωτικά labels των ανθρώπων ούτε τις κρυφές πραγματικές κάρτες. Εάν οι ενδείξεις είναι λίγες, γύρισε σε ουδέτερο baseline. Χρησιμοποίησε seeded stochastic sampling ώστε το bot να μην γίνεται απολύτως μηχανικό αλλά οι δοκιμές να αναπαράγονται.

**Search pitfall:** «κοιτάζω 100 υποθετικά πλήρη χέρια και για κάθε ένα ξέρω όλα τα χέρια» δημιουργεί *strategy fusion*: προτείνει πράξεις που υποθέτουν αθέμιτη πληροφορία στο μέλλον. Προτίμησε information-set-level decision, conservative aggregation, ή IS-MCTS / observation-based alternatives. [S9][S11]

## 6. Tier 1 / Tier 2 / Tier 3 — έξυπνοι, αλλά σαφώς διακριτοί

| Δυνατότητα | Tier 1: Competent | Tier 2: Tactical | Tier 3: Expert |
|---|---|---|---|
| Legal move + Joker semantics | πλήρης ορθότητα | πλήρης | πλήρης |
| Παρακολούθηση παιγμένων | βασικές ισχυρές | πλήρης public history | πλήρης + posterior beliefs |
| Δήλωση | calibrated heuristic + μικρό sampling | rollout distribution | advanced score-aware evaluation |
| Ατού | risk-aware candidate scoring | simulation | strategic simulation/search |
| Joker High/Low/suit | όχι τυφλό κάψιμο | probabilistic candidate evaluation | lookahead/ISMCTS |
| Αντίπαλοι | bid-aware βασικά | score/opponent-aware | rank-aware + opponent models |
| «Έχασα ήδη τη δήλωση» | tactical target switch | evaluate disruption cost | multi-deal/rank tradeoff |
| Search | πολύ μικρό | μεσαίο, bounded | περισσότερο, bounded |
| Φυσικότητα | απλή διακύμανση σε ισοδύναμα actions | περισσότερο | ανάλογη αβεβαιότητα |

**Όλα τα tiers πρέπει να παίζουν νόμιμα και βασικά ορθολογικά.** Το Tier 1 δεν πρέπει να είναι σκόπιμα αυτοκαταστροφικό. Διαφορά επιπέδου σημαίνει βαθύτερη εκτίμηση, όχι απουσία στοιχειώδους στρατηγικής.

**Time budget:** αρχικά μέτρα p50/p95/p99 bot decision times στο production-like περιβάλλον. Θέσε όριο runtime, fallback σε legal heuristic, ειδικά σε 9-card deals. Αποτρέψτε blocking progression/παγωμένα τραπέζια από βαρύ search.

## 7. Παραδείγματα που ΠΡΕΠΕΙ να περνά η μηχανή

**J-01, early Joker:** Joker High lead ζητά μη ατού, παίκτης μετά γνωστός void και πιθανώς κρατά ατού → πρέπει να μετριέται risk, όχι «Joker=σίγουρη μπάζα».

**J-02, late Joker:** έχεις exact ήδη· κράτησε Joker ως Low όταν η υψηλή μορφή θα προκαλούσε overshoot, αν αυτό είναι νόμιμο/ασφαλέστερο.

**J-03, double Joker:** άλλος Joker ήδη σε trick. Μη θεωρείς ότι πρώτο high κερδίζει ανεξαρτήτως δεύτερου.

**J-04, opponent trump exhausted:** πολλά ατού ήδη παιγμένα + χαμηλό unseen trump probability· High Joker lead requested non-trump μπορεί να γίνει λογικά ασφαλής.

**B-01, bid vs trick distribution:** φύλλα με high cards που έχουν κίνδυνο να κοπούν → μην προσμετράς κάθε high ως guaranteed trick.

**B-02, pass/zero:** σώσε αναγκαίο χαμηλό «exit», μην αποβάλεις μηχανικά όλα τα χαμηλά φύλλα από νωρίς.

**S-01, leader disruption:** πρώτο σκορ 1.200, bot 900, κοντά σε τέλος· αντίπαλος απειλεί exact +300. Σύγκρινε δική σου απώλεια και πιθανό κέρδος θέσης.

**S-02, already failed bid:** bot bid 2 αλλά πήρε 3· υπολογίζει ποια αντίπαλη δήλωση μπορεί να χαλάσει, *χωρίς* να δίνει δωρεάν +300 σε άλλο αντίπαλο.

**S-03, −200 threat:** αντίπαλος με positive bid έχει 0 tricks, λίγες μπάζες μένουν· evaluate δυνατότητα να μη πάρει καμία.

**P-01, premia:** τρίτη/τέταρτη exact σε σειρά· υπάρχει tradeoff ανάμεσα σε δικό σου deal gain και αντίπαλο bonus/penalty, αξιολόγηση μέσω authoritative scores.

**R-01, 1-card deal:** πλήρης απαρίθμηση legal possibilities με υποχρεωτική dealer restriction, δοκιμή exact optimality.

**R-02, 9-card deal:** performance budget, trump choice, no-trump cases, hard unknown-card counts.

**R-03, no-trump:** ποτέ μη μεταχειρίζεσαι non-trump joker lead σαν ατού και μην εφαρμόζεις trump heuristics όταν δεν υπάρχει ατού.

**R-04, safe information:** άλλαξε κρυφά χέρια των αντιπάλων με ίδιο public observation· η bot απόφαση δεν πρέπει να εξαρτάται από την πραγματική κρυφή ανάθεση.

**R-05, timeout/reclaim:** κάθε νέα ανάληψη από προσωρινό bot παίρνει νέο uniform Tier 1/2/3, μένει σταθερό ανά session και τερματίζεται με επιστροφή του ανθρώπου (ξεχωριστή συμφωνημένη αλλαγή).

## 8. Πώς να μετρήσουμε αν όντως έγιναν ισχυρότερα

### 8.1 Baseline και τουλάχιστον 4 ανεξάρτητες κατηγορίες test

1. **Rule correctness:** Joker winner/semantics, follow suit, mode scoring, bid constraints, premia, hidden information, 24-deal state machine.
2. **Tactical unit tests:** όλες οι J/B/S/P/R προαναφερθείσες θέσεις, περιλαμβάνοντας cases όπου επιθυμητό output είναι *πιθανότητα/απόφαση εξαρτώμενη από context* και όχι hardcoded μία κάρτα.
3. **Self-play tournaments:** χιλιάδες seeded παρτίδες με seat/dealer rotation, διαφορετικά modes, σύγκριση old vs new tiers, random/heuristic baselines και mixed human-like opponent agents.
4. **Performance/concurrency:** p50/p95/p99 χρόνο ανά action, CPU, μνήμη, timeout, autonomous multiplayer 4 bots, workers, reacquisition human seat.

### 8.2 Μετρικές που πραγματικά μας ενδιαφέρουν

- Win rate σε ισορροπημένα seats (με confidence intervals), mean/median final score, bottom-quartile final score, ποσοστό games με αρνητικό τελικό σκορ.
- Exact bid rate ανά μέγεθος hand (1–9), ανά trump/no-trump, ανά tier, ανά mode.
- Zero positive-bid / hist rate, mean penalty magnitude, joker wasted rate (ορισμός με counterfactuals), forced overshoot rate.
- Συχνότητα που σκόπιμη παρέμβαση χαλάει αντίπαλο bid **με καθαρό expected benefit**.
- Ακρίβεια εκτίμησης `P(win trick)` και `P(exact bid)` (calibration curve/Brier score).
- Ποσοστό παράνομων/απορριφθεισών κινήσεων **μηδέν**· data leakage **μηδέν**.
- Latency and reliability under bot-heavy live multiplayer.

**Σημαντικό:** Ένα bot μπορεί να πάρει αρνητικό σκορ ακόμη και όταν παίζει σωστά εφόσον το συγκεκριμένο mode έχει σοβαρές ποινές. Κριτήριο είναι **statistical comparison**, όχι «ποτέ αρνητικό» ούτε υπόσχεση εγγυημένης νίκης.

### 8.3 Πειραματικός σχεδιασμός

Χρησιμοποίησε **matched seeds** και rotated seats: ίδια αρχική τυχαιότητα για παλιά/νέα πολιτική όπου επιτρέπεται, ώστε να μειωθεί variance· διαφορετικά independent seeds για confidence intervals. Χωριστά results για 1 human + 3 bot, 2 humans + 2 bot, 4 bot. Απέκλεισε prank/deal manipulation από τις κύριες αξιολογήσεις αγωνιστικής δεξιότητας και αναφέρσου χωριστά σε αυτό το mode.

Απαγορεύεται selective reporting («βρήκαμε 10 παιχνίδια που κέρδισαν»). Διατήρησε αποτυχημένες και καταστροφικές περιπτώσεις και reproduce seeds. Πριν από deployment καταγράψτε acceptance targets βάσει μετρημένου baseline, όχι αυθαίρετο +40%.

## 9. Προτεινόμενες φάσεις υλοποίησης — χωρίς αλλαγές σήμερα

**Φάση 0 · Read-only baseline.** Επαλήθευση current main, τριών tiers, παραγόντων επιλογής Joker, bid/trump logic, canonical scoring ανά mode, ιστορικού δημόσιων καρτών, σημείων που εμφανίζεται το score state. Μέτρηση του ήδη υπάρχοντος win-rate και penalty profile.

**Φάση 1 · Instrumentation και oracle tests.** Seeded deterministic harness, legal action contract tests, scorer as oracle, data-leak guard, difficult scenarios. Καμία βελτίωση strategy δεν εγκρίνεται εάν αποτυγχάνουν οι rules tests.

**Φάση 2 · Rational baseline Tier 1.** Joker opportunity cost, no automatic stronger card, exact bid protection, bid-aware action scoring, basic scoreboard-aware competitor weights.

**Φάση 3 · Tier 2 public-memory + belief sampling.** Αναγνώριση void, public-history constraints, calibrated P(trump/second Joker), tactical disruption and expected deal score.

**Φάση 4 · Tier 3 search + rank-aware utility.** Multi-trick rollouts, opponent policy, controlled information-set search, tournament tuning. Να μη γίνει αλλαγή σε hidden-info/trick rules.

**Φάση 5 · Tournament / regression / rollout.** Paired simulations, game-mode partitions, load tests, reversible feature flag/version, μικρή παραγωγική δοκιμή. PR → CI → merge → publish → verify σύμφωνα με το project workflow και μόνο με ρητή έγκριση χρήστη.

**Παράλληλο ξεχωριστό feature:** τυχαίο takeover Tier 1/2/3 ανά νέα αποσύνδεση. Μικρή αλλαγή, αλλά state consistency και deterministic replay πρέπει να ελεγχθούν πριν την υλοποίηση.

## 10. Ανοικτές αποφάσεις — να εγκριθούν προτού κλειδώσει το design

1. **Πόσο ανταγωνιστικά;** Όλα τα bot ανεξάρτητοι παίκτες με στόχο δική τους τελική νίκη; (Συνιστάται ναι. Όχι συλλογική «τρία bot εναντίον ανθρώπου» πολιτική.)
2. **Risk appetite:** το Tier 3 μπορεί να παίρνει καθαρό calculated risk για 1η θέση, ακόμη κι αν μειώνει το average score; (Συνιστάται late-game adaptive.)
3. **Premia targeting:** αποκλειστικά score-aware όταν επηρεάζει τελική θέση, όχι automatic harassment.
4. **Per-mode weight tuning:** οι custom ποινές/bonus του popular και Caucasus mode απαιτούν διαφορετική συμπεριφορά μέσω του ίδιου scoring oracle.
5. **Performance ceiling:** οριστικοποίηση μετά πραγματικές μετρήσεις backend και bottleneck budget, όχι βάσει αυθαίρετου simulation count.
6. **Επικύρωση rules:** ιδιαίτερα 9άρια/trump choice, Joker lead modes και semantics, penalized all-tricks variants. Μόνο το canonical main είναι authoritative.

## 11. Πηγές — ακριβείς διευθύνσεις και χαρακτηρισμός

- **[S1]** rogor.ge, «როგორ ვითამაშოთ ჯოკერი კარგად», 11/7/2024 — **γεωργιανή ειδική στρατηγική, υψηλή συνάφεια:** https://www.rogor.ge/article/637-rogor-vitamashot-jokeri-kargad/
- **[S2]** Pagat, «Joker» — **υψηλής συνάφειας οδηγός κανόνων και παραλλαγών:** https://www.pagat.com/exact/joker.html
- **[S3]** Pagat, «Oh Hell!» — **συγγενές παιχνίδι, όχι ίδιο ruleset:** https://www.pagat.com/exact/ohhell.html
- **[S4]** OhHell.app, «Strategy» (2026) — **δευτερεύουσα στρατηγική αναλογία:** https://ohhell.app/strategy
- **[S5]** forum.ge, «ჯოკერი: სტრატეგიები და ხრიკები» — **περιορισμένη πρόσβαση, μόνο τίτλος/περίληψη:** https://forum.ge/?f=107&showtopic=34634630&st=0
- **[S6]** Josh's Games, «Joker» (2026) — **επιβεβαίωση δημοφιλούς digital variant, όχι γνωστός κώδικας AI:** https://www.joshsgames.com/joker/
- **[S7]** MyGame.ge, «Joker» — **διαφορετική, partner/38-card έκδοση:** https://mygame.ge/joker
- **[S8]** PlayBoardGames, «Oh Hell» — **tactical analogy:** https://playboardgames.org/how-to-play/oh-hell
- **[S9]** Rebstock et al., «Policy Based Inference in Trick-Taking Card Games» (2019) — https://arxiv.org/abs/1905.10911
- **[S10]** Li, Zanuttini, Ventos, «Opponent-Model Search in Games with Incomplete Information» (AAAI 2024) — https://ojs.aaai.org/index.php/AAAI/article/view/28844
- **[S11]** Cowling, Ward, Powley, «Ensemble Determinization in Monte Carlo Tree Search for the Imperfect Information Card Game Magic: The Gathering» (2012) — https://eprints.whiterose.ac.uk/id/eprint/75050/
- **[S12]** Powley, Cowling, Whitehouse, «Memory Bounded Monte Carlo Tree Search» (2017) — https://ojs.aaai.org/index.php/AIIDE/article/view/12932
- **[S13]** Demirdöver, «A Unified Sequence Modeling Framework for Imperfect-Information Trick-Taking Card Games» (2026) — https://open.metu.edu.tr/handle/11511/119482

## 12. Κλείσιμο

Το πιο σημαντικό εύρημα είναι ότι **οι παίκτες του γεωργιανού Joker δεν προσπαθούν μόνο να κερδίζουν μπάζες**: διαχειρίζονται την ακριβή δήλωση, θυμούνται ποια ισχυρά φύλλα έχουν φύγει, παίζουν High/Low Joker ανάλογα με τον κίνδυνο, μπορούν να επιτεθούν στη δήλωση αντιπάλου και λαμβάνουν υπόψη τον κίνδυνο premia/hist. Αυτές οι συμπεριφορές είναι ερευνητικά υποστηριζόμενες ως κατευθύνσεις. Η συγκεκριμένη συνάρτηση χρησιμότητας, ο sampler, οι tiers και τα benchmarks είναι **σχεδιαστικές προτάσεις** που απαιτούν επιβεβαίωση από τον πραγματικό κώδικα και αποτελέσματα δοκιμών.

**Η παρούσα εργασία δεν αποδεικνύει ότι ο τρέχων αλγόριθμος έχει διορθωθεί, ούτε ότι οποιαδήποτε νέα πολιτική έχει καλύτερο win-rate. Δεν έγιναν αλλαγές ούτε δοκιμές gameplay.**