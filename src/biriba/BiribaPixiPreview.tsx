import type { BiribaDealtPreview } from "./localDeal";
import type { BiribaGameView } from "@/services/biribaFunctions";
import {biribaMeldBonus,biribaCardPoints,biribaTeamOf} from "./rules";
import { useEffect, useRef } from "react";
import { Application, Assets, Container, Graphics, Sprite, Text } from "pixi.js";
import { NORMAL_DEAL_TRAVEL_MS, NORMAL_DEAL_HANDOFF_TRAVEL_MS } from "@/components/table/presentationTiming";
import { dealtCardPose, dealProgress } from "@/components/table/dealtCardMotion";

/**
 * BIRIBA visual proof of concept. Matches the approved red/blue team-zone
 * screenshot, reuses the table styling and real card assets. No online moves
 * or score authority live in this renderer; future multiplayer updates pass
 * sanitized viewer-specific snapshots only.
 */
export const BIRIBA_DEAL_BEAT_MS = 110;

export function BiribaPixiPreview({deal,game,redTeam=0,revealComplete=false,onDealComplete}:{deal?:BiribaDealtPreview|undefined;game?:BiribaGameView|undefined;redTeam?:number;revealComplete?:boolean|undefined;onDealComplete?:((key:string)=>void)|undefined}) {
  const mount = useRef<HTMLDivElement>(null);
  const lastDealtRound=useRef<string|null>(null);
  useEffect(() => {
    const parent = mount.current;
    if (!parent) return;
    let disposed = false;
    let app: Application | undefined;
    const dealTimers:Array<ReturnType<typeof setTimeout>>=[];
    const schedule=(callback:()=>void,delay:number)=>{dealTimers.push(setTimeout(callback,delay));};
    const dealKey=game?`${game.roundNumber}:${game.seat}`:null;
    const dealEntrance=dealKey!==null&&lastDealtRound.current!==dealKey;
    if(dealEntrance)lastDealtRound.current=dealKey;
    void (async () => {
      const pixi = new Application();
      await pixi.init({ resizeTo: parent, backgroundAlpha: 0, antialias: true, resolution: Math.min(devicePixelRatio || 1, 2), autoDensity: true });
      if (disposed) { pixi.destroy(true); return; }
      app = pixi;
      parent.appendChild(pixi.canvas);
      const stage = new Container();
      pixi.stage.addChild(stage);
      const w = 1280, h = 720;
      // Translate the unused letterbox gutter into table coordinates so remote
      // card backs sit at the real viewport edges, not inset from the table.
      const contentScale=Math.min(parent.clientWidth/w,parent.clientHeight/h);
      const gutter=Math.max(0,(parent.clientWidth-w*contentScale)/(2*contentScale));
      const leftEdge=-gutter+4;
      const rightEdge=w+gutter-38;
      // Scale consistently to landscape dimensions; preserve exact zone proportions.
      const resize = () => { const scale = Math.min(parent.clientWidth/w,parent.clientHeight/h); stage.scale.set(scale); stage.position.set((parent.clientWidth-w*scale)/2,(parent.clientHeight-h*scale)/2); };
      resize();
      const observer = new ResizeObserver(resize);
      observer.observe(parent);
      const box = (x:number,y:number,width:number,height:number,color:number,alpha=1,stroke?:number) => {
        const g = new Graphics().roundRect(x,y,width,height,16).fill({color,alpha});
        if(stroke!==undefined)g.roundRect(x,y,width,height,16).stroke({color:stroke,width:3});
        stage.addChild(g); return g;
      };
      const text = (str:string,x:number,y:number,size=18,color="#ffffff") => {
        const t = new Text({text:str,style:{fontFamily:"Arial, sans-serif",fontSize:size,fill:color,fontWeight:"bold",align:"center"}});
        t.anchor.set(.5); t.position.set(x,y); stage.addChild(t); return t;
      };
      // Two colored framed meld regions, faithful to the approved reference.
      box(130,115,492,195,0x331b1b,.46,0xf34e5b);
      box(658,115,492,195,0x122a52,.46,0x3897ef);
      box(155,86,215,44,0x9d2838);
      box(910,86,215,44,0x17589c);
      text("ΚΟΚΚΙΝΗ ΟΜΑΔΑ",262,107,18);
      text("ΜΠΛΕ ΟΜΑΔΑ",1017,107,18);
      const currentScore=(team:number)=>game?(game.teamScores[team]??0)+(game.roundScored?0:game.melds.filter(m=>biribaTeamOf(m.ownerSeat,game.seats)===team).reduce((sum,m)=>sum+biribaMeldBonus(m,game.trump)+m.cards.reduce((n,p)=>n+biribaCardPoints(p.card),0),0)):0;
      box(525,86,96,44,0x9d2838); text(String(currentScore(redTeam)),573,108,26);
      box(662,86,96,44,0x17589c); text(String(currentScore(1-redTeam)),710,108,26);
      const suitIcon:Record<string,string>={spades:"♠",hearts:"♥",diamonds:"♦",clubs:"♣"};
      const fileRank=(rank:string)=>({A:"ace",K:"king",Q:"queen",J:"jack"} as Record<string,string>)[rank]||rank;
      type Face={rank:string;suit:string};
      const face=(rank:string,suit:string):Face=>({rank,suit});
      const addCard=async(c:Face|null,x:number,y:number,scale=1,delay=0,from?:[number,number])=>{
        const path=c?(c.rank==="JOKER"?"/cards/optimized-png/faces/joker_red.png":`/cards/optimized-png/faces/${c.suit}_${fileRank(c.rank)}.png`):"/cards/optimized-png/backs/blue_back.png";
        try{
          const texture=await Assets.load(path);
          if(disposed)return;
          const sprite=new Sprite(texture);sprite.width=58*scale;sprite.height=85*scale;sprite.position.set(from?.[0]??x,from?.[1]??(y+12));
          sprite.alpha=from?1:0;stage.addChild(sprite);
          let progress=0;const animate=(ticker:{deltaMS:number})=>{
            progress+=ticker.deltaMS/(from?NORMAL_DEAL_TRAVEL_MS:180);
            const t=Math.min(1,progress),eased=1-Math.pow(1-t,3);
            sprite.x=from?from[0]+(x-from[0])*eased:x;
            sprite.y=from?from[1]+(y-from[1])*eased:y+12*(1-eased);
            sprite.alpha=from?1:eased;
            if(t===1)pixi.ticker.remove(animate);
          };
          if(delay)await new Promise(r=>setTimeout(r,delay));
          if(!disposed)pixi.ticker.add(animate);
        }catch{
          if(disposed)return;
          box(x,y,58*scale,85*scale,c?0xfafafa:0x234c91,1,c?0xe6e6e6:0xc4a35a);
          if(c)text(c.rank+suitIcon[c.suit],x+24*scale,y+24*scale,18*scale,c.suit==="hearts"||c.suit==="diamonds"?"#c92b2b":"#1c1c1c");
        }
      };
      const set=(cards:Face[],x:number,y:number)=>cards.forEach((c,i)=>void addCard(c,x+i*42,y,0.86,i*25));
      if(game){
        const visual=(card:{joker?:boolean;rank?:number;suit?:string}):Face=>
          card.joker?face("JOKER","joker"):face(({1:"A",11:"J",12:"Q",13:"K"} as Record<number,string>)[card.rank??0]??String(card.rank??""),card.suit??"spades");
        const onTeam=(team:number)=>game.melds.filter(m=>biribaTeamOf(m.ownerSeat,game.seats)===team);
        for(const [zone,team] of [[0,redTeam],[1,1-redTeam]] as [number,number][]){
          const melds=onTeam(team);
          melds.forEach((meld,i)=>{
            const x=zone===0?155:683;
            const y=154+Math.floor(i/3)*66;
            const offset=(i%3)*148;
            meld.cards.forEach((p,index)=>void addCard(visual(p.card),x+offset+index*17,y,.58,index*13));
          });
        }
      }else{
        set([face("7","hearts"),face("8","hearts"),face("9","hearts")],155,155);
        set([face("J","spades"),face("Q","spades"),face("K","spades")],310,155);
        set([face("4","clubs"),face("5","clubs"),face("6","clubs")],460,155);
        set([face("A","spades"),face("2","spades"),face("3","spades")],683,155);
        set([face("9","hearts"),face("10","hearts"),face("J","hearts")],840,155);
        set([face("7","clubs"),face("8","clubs"),face("9","clubs")],998,155);
      }
      box(338,384,605,157,0x071f1b,.35);
      const piles:[string,Face|null,number][]=[
        ["ΚΛΕΙΣΤΗ ΤΡΑΠΟΥΛΑ",null,360],
        ["ΠΕΤΑΜΕΝΑ",deal?.discard[0] ? (deal.discard[0].joker ? face("JOKER","joker") : face(({1:"A",11:"J",12:"Q",13:"K"} as Record<number,string>)[deal.discard[0].rank]??String(deal.discard[0].rank),deal.discard[0].suit)):face("Q","hearts"),522],
        ["ΜΠΙΡΙΜΠΑΚΙ 1",null,674],
        ["ΜΠΙΡΙΜΠΑΚΙ 2",null,828],
      ];
      piles.forEach(([label,c,x])=>{void addCard(c,x,397,1.15);text(label,x+32,522,13);});
      box(1090,510,135,44,0x252923,.94,0xc3a24f);text(`ΑΤΟΥ ${deal?(deal.trump?suitIcon[deal.trump]:"—"):"♣"}`,1158,531,21);

      // Use Joker's card flight easing and spatial pile presentation. Eleven
      // backs converge into each player's full-size stack; no 44 tiny cards.
      const BACK_W=74, BACK_H=106, BEAT_MS=BIRIBA_DEAL_BEAT_MS;
      const rear=(x:number,y:number,count:number,vertical=false)=>{
        for(let i=0;i<count;i++)void addCard(null,x+(vertical?0:i*2),y+(vertical?i*2:0),BACK_W/58);
      };
      const topSeat=game?.seats===2?1:2;
      const target=(delta:number):{x:number;y:number;angle:number}=>{
        if(delta===0)return {x:562,y:605,angle:0};
        if(delta===topSeat)return {x:578,y:-55,angle:0};
        if(delta===1)return {x:leftEdge-39,y:258,angle:90};
        return {x:rightEdge-31,y:258,angle:-90};
      };
      if(game&&dealEntrance&&dealKey){
        const order=game.seats===4?[0,1,2,3]:[0,1];
        const flightCount=11*order.length;
        const allCards: Array<{sprite:Sprite;delta:number;end:{x:number;y:number;angle:number}}> = [];
        const texture=await Assets.load("/cards/optimized-png/backs/blue_back.png");
        if(disposed)return;
        const entranceLayer=new Container();
        stage.addChild(entranceLayer);
        for(let i=0;i<11;i++)for(const delta of order){
          const end=target(delta);
          const sprite=new Sprite(texture);
          sprite.width=BACK_W;
          sprite.height=BACK_H;
          sprite.position.set(390,402);
          sprite.alpha=0;
          entranceLayer.addChild(sprite);
          allCards.push({sprite,delta,end});
          const destination={x:end.x+i*2,y:end.y+i*2};
          const from={x:390,y:402};
          schedule(()=>{
            if(disposed)return;
            let elapsed=0;
            sprite.alpha=1;
            const tick=(ticker:{deltaMS:number})=>{
              elapsed+=ticker.deltaMS;
              const p=dealProgress(Math.min(1,elapsed/NORMAL_DEAL_TRAVEL_MS));
              const pose=dealtCardPose(from,destination,0,end.angle,p);
              sprite.position.set(pose.point.x,pose.point.y);
              sprite.rotation=pose.rotation*Math.PI/180;
              sprite.width=BACK_W*pose.scale;
              sprite.height=BACK_H*pose.scale;
              if(elapsed>=NORMAL_DEAL_TRAVEL_MS)pixi.ticker.remove(tick);
            };
            pixi.ticker.add(tick);
          },(i*order.length+delta)*BEAT_MS);
        }
        const flightEnd=(flightCount-1)*BEAT_MS+NORMAL_DEAL_TRAVEL_MS;
        schedule(()=>{
          if(disposed)return;
          const original=allCards.map(({sprite})=>({x:sprite.x,y:sprite.y}));
          let elapsed=0;
          const handoff=(ticker:{deltaMS:number})=>{
            elapsed+=ticker.deltaMS;
            const t=Math.min(1,elapsed/NORMAL_DEAL_HANDOFF_TRAVEL_MS);
            allCards.forEach(({sprite,delta},index)=>{
              const start=original[index]!;
              const exit=delta===0?{x:start.x,y:780}:delta===topSeat?{x:start.x,y:-150}:delta===1?{x:leftEdge-180,y:start.y}:{x:rightEdge+180,y:start.y};
              sprite.position.set(start.x+(exit.x-start.x)*t,start.y+(exit.y-start.y)*t);
              sprite.alpha=t<.65?1:(1-t)/.35;
            });
            if(t>=1){
              pixi.ticker.remove(handoff);
              entranceLayer.destroy({children:true});
            }
          };
          pixi.ticker.add(handoff);
        },flightEnd+90);
        schedule(()=>{if(!disposed)onDealComplete?.(dealKey);},flightEnd+NORMAL_DEAL_HANDOFF_TRAVEL_MS+100);
      }else{
        rear(578,-55,game?game.handCounts[(game.seat+topSeat)%game.seats]??0:11);
        if(!game||game.seats===4){
          rear(leftEdge-39,258,game?game.handCounts[(game.seat+1)%game.seats]??0:11,true);
          rear(rightEdge-31,258,game?game.handCounts[(game.seat+3)%game.seats]??0:11,true);
        }
      }
      (pixi as Application & {__biribaObserver?:ResizeObserver}).__biribaObserver=observer;
    })();
    return ()=>{disposed=true;for(const timer of dealTimers)clearTimeout(timer);if(app){(app as Application & {__biribaObserver?:ResizeObserver}).__biribaObserver?.disconnect();app.destroy(true,{children:true});}};
  },[deal,game,redTeam,revealComplete,onDealComplete]);
  return <div ref={mount} className="absolute inset-0" role="img" aria-label="Προεπισκόπηση τραπεζιού Μπιρίμπας με κόκκινη και μπλε ομάδα, κατεβασμένες σειρές, κλειστή τράπουλα, πεταμένα και ανοιχτά φύλλα στο κάτω μέρος"/>;
}
