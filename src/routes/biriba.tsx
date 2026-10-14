import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PlayerSessionGate } from "@/components/joker/PlayerSessionGate";
import { ScreenShell } from "@/components/joker/ScreenShell";
import { TableSurface } from "@/components/table/TableSurface";
import { BiribaPixiPreview } from "@/biriba/BiribaPixiPreview";
import { createBiribaLocalDeal, type BiribaDealtPreview } from "@/biriba/localDeal";
import { BIRIBA_TARGETS, DEFAULT_BIRIBA_TARGET, type BiribaSeatCount, type BiribaTarget } from "@/biriba/rules";

export const Route = createFileRoute("/biriba")({
  head:()=>({meta:[{title:"ΜΠΙΡΙΜΠΑ — Παιχνίδι"}]}),
  component:BiribaHome,
});
function BiribaHome(){
 return <PlayerSessionGate allowLogout={false}>{()=> <BiribaContent/>}</PlayerSessionGate>;
}
function BiribaContent(){
 const [seats,setSeats]=useState<BiribaSeatCount>(4);
 const [target,setTarget]=useState<BiribaTarget>(DEFAULT_BIRIBA_TARGET);
 const [deal,setDeal]=useState<BiribaDealtPreview|null>(null);
 const [mode,setMode]=useState<"create"|"join">("create");
 if(deal)return <main className="relative h-[100dvh] w-full overflow-hidden bg-[#0b241b]">
  <TableSurface/>
  <BiribaPixiPreview deal={deal}/>
  <div className="absolute right-3 top-3 z-20 flex items-center gap-2 rounded-lg bg-black/80 p-2 text-xs text-white">
   <span>Δοκιμαστικό μοίρασμα · {seats} θέσεις · {target.toLocaleString("el-GR")} πόντοι</span>
   <button className="rounded border border-white/40 px-2 py-1" type="button" onClick={()=>setDeal(createBiribaLocalDeal(seats))}>Νέο μοίρασμα</button>
   <button className="rounded border border-white/40 px-2 py-1" type="button" onClick={()=>setDeal(null)}>Πίσω</button>
  </div>
 </main>;
 return <ScreenShell title="ΜΠΙΡΙΜΠΑ" variant="pregame" contentClassName="!overflow-y-auto !min-h-0 pb-8">
   <div className="mx-auto w-full max-w-xl space-y-4 rounded-xl border border-primary/30 bg-black/20 p-4">
    <div className="grid grid-cols-2 gap-2">
     <button type="button" aria-pressed={mode==="create"} className="rounded-lg border p-3 font-semibold" onClick={()=>setMode("create")}>Δημιουργία παιχνιδιού</button>
     <button type="button" aria-pressed={mode==="join"} className="rounded-lg border p-3 font-semibold" onClick={()=>setMode("join")}>Συμμετοχή</button>
    </div>
    {mode==="create"?<>
     <label className="block space-y-2">Αριθμός παικτών
      <select className="w-full rounded-lg border bg-secondary p-3" value={seats} onChange={e=>setSeats(Number(e.target.value) as BiribaSeatCount)}>
       <option value={2}>2 παίκτες</option><option value={4}>4 παίκτες</option>
      </select>
     </label>
     <label className="block space-y-2">Στόχος βαθμολογίας
      <select className="w-full rounded-lg border bg-secondary p-3" value={target} onChange={e=>setTarget(Number(e.target.value) as BiribaTarget)}>
       {BIRIBA_TARGETS.map(n=><option value={n} key={n}>{n.toLocaleString("el-GR")} πόντοι</option>)}
      </select>
     </label>
     <button type="button" className="w-full rounded-lg border border-primary bg-primary/20 px-4 py-3 font-bold"
      onClick={()=>setDeal(createBiribaLocalDeal(seats))}>Δοκιμαστική δημιουργία και μοίρασμα</button>
     <p className="text-xs text-muted-foreground">Η δοκιμαστική παρτίδα λειτουργεί μόνο σε αυτή τη συσκευή. Δεν δημιουργεί ακόμη κοινό online δωμάτιο.</p>
    </>:<div className="space-y-2">
      <h2 className="font-semibold">Διαθέσιμα δωμάτια Μπιρίμπας</h2>
      <p className="text-sm text-muted-foreground">Η online συμμετοχή θα ενεργοποιηθεί μόλις προστεθεί ο ανεξάρτητος server δωματίων Μπιρίμπας. Δεν εμφανίζονται δωμάτια των άλλων παιχνιδιών.</p>
    </div>}
    <a href="/" className="inline-block rounded-lg border px-3 py-2 text-sm">← Επιλογή παιχνιδιού</a>
   </div>
 </ScreenShell>;
}
