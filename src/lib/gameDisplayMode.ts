type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: "landscape") => Promise<void>;
  unlock?: () => void;
};

export type GameDisplayModeAttempt = {
  enteredFullscreen: boolean;
  lockedLandscape: boolean;
};

export async function enterGameDisplayMode(target?: HTMLElement): Promise<GameDisplayModeAttempt> {
  if (typeof document === "undefined" || typeof screen === "undefined") {
    return { enteredFullscreen: false, lockedLandscape: false };
  }

  const wasFullscreen = Boolean(document.fullscreenElement);
  let enteredFullscreen = false;
  let lockedLandscape = false;

  if (!wasFullscreen && (target?.requestFullscreen || document.documentElement.requestFullscreen)) {
    try {
      if (target?.requestFullscreen) await target.requestFullscreen();
      else await document.documentElement.requestFullscreen();
      enteredFullscreen = Boolean(document.fullscreenElement);
    } catch {
      enteredFullscreen = false;
    }
  }

  const orientation = screen.orientation as LockableOrientation;
  if (orientation?.lock) {
    try {
      await orientation.lock("landscape");
      lockedLandscape = true;
    } catch {
      lockedLandscape = false;
    }
  }

  return { enteredFullscreen, lockedLandscape };
}

export async function rollbackGameDisplayMode(attempt: GameDisplayModeAttempt): Promise<void> {
  if (typeof document === "undefined" || typeof screen === "undefined") return;

  if (attempt.lockedLandscape) {
    const orientation = screen.orientation as LockableOrientation;
    try {
      orientation?.unlock?.();
    } catch {
      // Best effort only.
    }
  }

  if (attempt.enteredFullscreen && document.fullscreenElement) {
    try {
      await document.exitFullscreen();
    } catch {
      // Best effort only.
    }
  }
}


/** Reapply the lock after fullscreen entry or app resume; unsupported browsers use the guard. */
export async function maintainGameLandscape(): Promise<boolean> {
  const orientation = typeof screen === "undefined" ? undefined : screen.orientation as LockableOrientation | undefined;
  if (!orientation?.lock) return false;
  try { await orientation.lock("landscape"); return true; } catch { return false; }
}
