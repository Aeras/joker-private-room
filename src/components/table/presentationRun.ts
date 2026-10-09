/** Invalidates already-queued callbacks too: clearTimeout alone cannot do that.
 * One instance belongs to one mounted presentation owner, never canonical state.
 */
export class PresentationRun {
  private generation = 0;
  invalidate() {
    this.generation++;
  }
  guard<Args extends unknown[]>(callback: (...args: Args) => void): (...args: Args) => void {
    const token = this.generation;
    return (...args) => {
      if (token === this.generation) callback(...args);
    };
  }
}

/** Cancellation remains effective even if the browser already queued the timer. */
export function presentationTimeout(callback: () => void, delay: number) {
  const run = new PresentationRun();
  const timer = window.setTimeout(run.guard(callback), delay);
  return () => {
    run.invalidate();
    window.clearTimeout(timer);
  };
}
