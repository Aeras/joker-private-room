/**
 * Identity abstraction. Production: predefined players in the backend,
 * PIN verified server-side. NEVER put real PINs or session tokens in frontend code.
 */
import type { PublicPlayer } from "@/domain/players";

export type AuthFailureCode =
  | "INVALID_CREDENTIALS"
  | "PIN_COOLDOWN_ACTIVE"
  | "SECOND_ACTIVE_CONNECTION"
  | "SESSION_EXPIRED"
  | "SERVICE_UNAVAILABLE";

export type PinVerificationResult =
  | { ok: true; player: PublicPlayer }
  | { ok: false; code: AuthFailureCode; retryAfterSeconds?: number };

export interface IdentityService {
  listPlayers(): Promise<PublicPlayer[]>;
  verifyPin(playerId: string, pin: string): Promise<PinVerificationResult>;
}
