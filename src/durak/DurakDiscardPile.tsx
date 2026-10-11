import { DurakCardBack } from "./DurakTableVisuals";

/** Visible, persistent discard mound. All cards are shown face down, never as a tidy stack. */
export function DurakDiscardPile({count}: {count:number}) {
  const visible=Math.min(count,20);
  return <div className="durak-discard-pile" data-durak-discard-pile aria-label={`Απορριμμένα φύλλα: ${count}`}>
    <div className="durak-discard-mound" aria-hidden="true">
      {Array.from({length:visible},(_,i)=>{
        const x=((i*37)%29)-14, y=((i*19)%23)-11,angle=((i*47)%67)-33;
        return <span key={i} className="durak-discard-layer"
          style={{"--discard-x":`${x}px`,"--discard-y":`${y}px`,"--discard-rotation":`${angle}deg`,"--discard-layer":i} as import("react").CSSProperties}>
          <DurakCardBack/>
        </span>;
      })}
    </div>
    <span className="durak-discard-count">{count} εκτός παιχνιδιού</span>
  </div>;
}
