/** Compact result screen shared by mobile landscape and desktop Biriba matches. */
export function BiribaFinishedScreen({
  winningColor,
  winnerNames,
  redScore,
  blueScore,
  error,
  busy,
  isHost,
  onHome,
  onNewGame,
}: {
  winningColor: string | null;
  winnerNames: string[];
  redScore: number;
  blueScore: number;
  error: string;
  busy: boolean;
  isHost: boolean;
  onHome: () => void;
  onNewGame: () => void;
}) {
  return (
    <main className="biriba-finish-screen text-white">
      <section className="biriba-finish-panel" aria-label="Τέλος παιχνιδιού">
        <span className="biriba-finish-trophy" aria-hidden="true">🏆</span>
        <h1 className="biriba-finish-heading">Τέλος παιχνιδιού</h1>
        <p className="biriba-finish-winner">
          {winningColor === null ? "Ισοπαλία" : `Νικήτρια: ${winningColor} ΟΜΑΔΑ`}
        </p>
        {winnerNames.length > 0 && (
          <div className="biriba-finish-players">
            <p className="biriba-finish-players-caption">Παίκτες της νικήτριας ομάδας</p>
            <p className="biriba-finish-players-names">{winnerNames.join(" · ")}</p>
          </div>
        )}
        <p className="biriba-finish-scores">
          Κόκκινη: {redScore.toLocaleString("el-GR")} · Μπλε: {blueScore.toLocaleString("el-GR")}
        </p>
        {error && <p className="biriba-finish-error" role="alert">{error}</p>}
        <div className={isHost ? "biriba-finish-buttons" : "biriba-finish-buttons biriba-finish-buttons--single"}>
          <button type="button" disabled={busy} onClick={onHome} className="biriba-finish-home">
            Αρχική
          </button>
          {isHost && (
            <button type="button" disabled={busy} onClick={onNewGame} className="biriba-finish-new">
              Νέο παιχνίδι
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
