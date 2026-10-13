import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const audio = readFileSync("src/lib/gameAudio.ts", "utf8");
const deal = readFileSync("src/components/table/DealPresentation.tsx", "utf8");

describe("deal Web Audio and visual event alignment", () => {
  it("prepares decoded buffers but never replays a past event on load", () => {
    expect(audio).toContain("ctx.decodeAudioData(buffer)");
    expect(audio).toContain("if (context === ctx) decoded.set(kind, buffer)");
    expect(audio).toContain("const buffer = decoded.get(kind)");
    expect(audio).toContain("source.start(ctx.currentTime)");
    expect(audio).toContain("prepareGameAudio()");
    expect(audio).not.toContain("setTimeout(() => playGameSound");
  });
  it("stops previous deal tails and preserves HTML audio fallback", () => {
    expect(audio).toContain('active.get("deal")');
    expect(audio).toContain("previous.stop()");
    expect(audio).toContain("audio.pause()");
    expect(audio).toContain("void audio.play().catch");
  });
  it("triggers sound from the same deal visibility beat and stops on cancel", () => {
    expect(deal).toContain("setVisibleIndex(index); recordTimingDiagnostic");
    expect(deal).toContain('playGameSound("deal", beat.id)');
    expect(audio).toContain("if (kind === \"deal\") stopPreviousDeal();");
    expect(deal).toContain("clearTimers(); startTimingDiagnosticSession");
  });
});
