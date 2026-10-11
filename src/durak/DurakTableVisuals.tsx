import { PlayingCard } from "@/components/joker/PlayingCard";
import { assets } from "@/assets/registry";
import type { Card, Rank } from "@/domain/cards";
import type { DurakCard } from "./rules";

/** DURAK presentation adapter only. The two games never share a rules engine or deck. */
const rankNames: Record<number, Rank> = {6:"6",7:"7",8:"8",9:"9",10:"10",11:"J",12:"Q",13:"K",14:"A"};

export function cardForArtwork(card: DurakCard): Card {
  const rank = rankNames[card.rank];
  if (!rank) throw new Error("Invalid DURAK card rank");
  return {kind:"standard",id:`durak-${card.suit}-${card.rank}`,suit:card.suit,rank};
}

export function DurakCardFace({card,onClick,selected,className}: {
  card:DurakCard;onClick?:(()=>void)|undefined;selected?:boolean;className?:string;
}) {
  return <PlayingCard card={cardForArtwork(card)} onClick={onClick} {...(selected===undefined?{}:{selected})} {...(className===undefined?{}:{className})}/>;
}

export function DurakCardBack({className}: {className?:string}) {
  return <PlayingCard faceDown {...(className===undefined?{}:{className})}/>;
}

export function DurakStock({trump,remaining}: {trump:DurakCard;remaining:number}) {
  if (remaining===0) return <div className="text-xs text-foreground/75">Τράπουλα άδεια</div>;
  return <div aria-label={`Τράπουλα: ${remaining} φύλλα, κόζι ${trump.suit}`}
    className="relative h-24 w-28 shrink-0 sm:h-32 sm:w-36">
    <div className="absolute left-0 top-3 rotate-90 [--card-w:3.5rem] sm:[--card-w:4rem]">
      <DurakCardFace card={trump}/>
    </div>
    <div className="absolute left-9 top-0 [--card-w:3.5rem] sm:left-12 sm:[--card-w:4rem]">
      <DurakCardBack/>
    </div>
    <span className="absolute bottom-0 right-0 rounded bg-black/75 px-1.5 py-0.5 text-xs text-white">{remaining}</span>
  </div>;
}

export function DurakTableSurface({children}: {children:React.ReactNode}) {
  return <div className="relative isolate flex h-full min-h-0 flex-col overflow-hidden rounded-[2.5rem] border-[6px] border-[#79552b] bg-[#14543b] shadow-[inset_0_0_70px_#062c20,0_15px_40px_#0008] sm:border-[10px]">
    <img src={assets.tableArt} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover opacity-55"/>
    {children}
  </div>;
}
