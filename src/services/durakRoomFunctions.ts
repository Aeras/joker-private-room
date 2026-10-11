import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_PUBLISHABLE_KEY } from "@/integrations/external-supabase/client";

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), variant: z.enum(["podkidnoy", "perevodnoy"]), capacity: z.number().int().min(2).max(6) }),
  z.object({ action: z.literal("list") }),
  z.object({ action: z.literal("bot_add"),code:z.string().regex(/^[A-Za-z0-9]{6}$/) }),
  z.object({ action: z.literal("bot_remove"),code:z.string().regex(/^[A-Za-z0-9]{6}$/),seat:z.number().int().min(0).max(5) }),
  z.object({ action: z.literal("start"),code:z.string().regex(/^[A-Za-z0-9]{6}$/) }),
  z.object({ action: z.literal("end_game"),code:z.string().regex(/^[A-Za-z0-9]{6}$/) }),
  z.object({ action: z.literal("get_game"),code:z.string().regex(/^[A-Za-z0-9]{6}$/) }),
  z.object({ action: z.literal("move"),code:z.string().regex(/^[A-Za-z0-9]{6}$/),move:z.discriminatedUnion("type",[
    z.object({type:z.literal("attack"),card:z.object({suit:z.enum(["clubs","diamonds","hearts","spades"]),rank:z.number().int().min(6).max(14)})}),
    z.object({type:z.literal("defend"),pair:z.number().int().min(0),card:z.object({suit:z.enum(["clubs","diamonds","hearts","spades"]),rank:z.number().int().min(6).max(14)})}),
    z.object({type:z.literal("transfer"),card:z.object({suit:z.enum(["clubs","diamonds","hearts","spades"]),rank:z.number().int().min(6).max(14)})}),
    z.object({type:z.literal("take")}),z.object({type:z.literal("pass")}),z.object({type:z.literal("finish")})]) }),
  z.object({ action: z.literal("membership") }),
  z.object({ action: z.literal("join"), code: z.string().regex(/^[A-Za-z0-9]{6}$/) }),
  z.object({ action: z.literal("get"), code: z.string().regex(/^[A-Za-z0-9]{6}$/) }),
  z.object({ action: z.literal("leave"), code: z.string().regex(/^[A-Za-z0-9]{6}$/) }),
]);

export type DurakSeatView = { index: number; occupant: "human" | "bot" | "empty"; name: string | null };
export type DurakRoomView = { code: string; variant: "podkidnoy" | "perevodnoy"; capacity: number; lifecycle: string; version: number; hostPlayerId: string; seats: DurakSeatView[] };
export type DurakWaitingRoom = { code: string; variant: "podkidnoy" | "perevodnoy"; capacity: number; hostName: string; occupied: number };
export type DurakGameView = {variant:"podkidnoy"|"perevodnoy";trump:"clubs"|"diamonds"|"hearts"|"spades";trumpCard:import("@/durak/rules").DurakCard;stock:number;discardCount:number;round:number;attacker:number;defender:number;pairs:Array<{attack:import("@/durak/rules").DurakCard;defense?:import("@/durak/rules").DurakCard}>;taking:boolean;ended:boolean;fool:number|null;handSizes:number[];myHand:import("@/durak/rules").DurakCard[];legalMoves:import("@/durak/engine").DurakMove[];seat:number;revision:number};
export type DurakRoomResponse = { ok: true; room: DurakRoomView } | { ok: true; rooms: DurakWaitingRoom[] } | { ok: true; cancelled: boolean } | { ok: true; membership: { code:string; lifecycle:string } | null } | {ok:true;started:boolean} | {ok:true;updated:boolean} | {ok:true;game:DurakGameView} | { ok: false; code: string };

export const durakRoomCommand = createServerFn({ method: "POST" })
  .validator(requestSchema)
  .handler(async ({ data }): Promise<DurakRoomResponse> => {
    const sessionToken = getCookie("__Host-joker_session");
    if (!sessionToken) return { ok: false, code: "NOT_AUTHENTICATED" };
    try {
      const response = await fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/durak-commands`, {
        method: "POST",
        headers: { apikey: EXTERNAL_SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, sessionToken }),
      });
      const result = await response.json() as DurakRoomResponse;
      if (result && typeof result === "object" && typeof result.ok === "boolean") return result;
    } catch {
      // Server-only transport errors are returned without disclosing details.
    }
    return { ok: false, code: "SERVICE_UNAVAILABLE" };
  });