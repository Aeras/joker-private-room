import { createFileRoute } from "@tanstack/react-router";
import { PlayerSessionGate } from "@/components/joker/PlayerSessionGate";
import { TableSurface } from "@/components/table/TableSurface";
import { BiribaPixiPreview } from "@/biriba/BiribaPixiPreview";

export const Route = createFileRoute("/biriba-preview")({
  head:()=>({meta:[{title:"ΜΠΙΡΙΜΠΑ — Προεπισκόπηση τραπεζιού PixiJS"}]}),
  component:()=> <PlayerSessionGate allowLogout={false}>
    {()=> <main className="relative h-[100dvh] w-full overflow-hidden bg-[#0b241b]">
      <TableSurface/>
      <BiribaPixiPreview/>
      <div className="absolute right-3 top-3 z-20 rounded-lg border border-amber-500/50 bg-black/80 px-3 py-2 text-xs text-white">
        Προεπισκόπηση σχεδίασης · Δεν είναι online παρτίδα
      </div>
      <a href="/" className="absolute left-3 top-3 z-20 rounded-lg border border-white/30 bg-black/75 px-3 py-2 text-sm text-white">
        ← Επιλογή παιχνιδιού
      </a>
    </main>}
  </PlayerSessionGate>,
});
