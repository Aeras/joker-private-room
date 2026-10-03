import { t } from "@/i18n/el";
import type { PinVerificationResult } from "@/services/identity";

type Failure = Extract<PinVerificationResult, { ok: false }>;

export function authFailureMessage(result: Failure) {
  switch (result.code) {
    case "PIN_COOLDOWN_ACTIVE":
      return t.pinCooldown.replace("{seconds}", String(Math.max(1, result.retryAfterSeconds ?? 1)));
    case "SECOND_ACTIVE_CONNECTION":
      return t.secondActiveConnection;
    case "SERVICE_UNAVAILABLE":
      return t.authUnavailable;
    default:
      return t.invalidPin;
  }
}
