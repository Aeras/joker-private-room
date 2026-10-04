import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261004180527_jk002_zero_client_scheduler.sql"),
  "utf8",
);

describe("JK-002 zero-client scheduler", () => {
  it("is fail-closed and environment-neutral by default", () => {
    expect(migration).toContain("enabled boolean not null default false");
    expect(migration).toContain("values (true, false, null)");
    expect(migration).not.toContain("wubrgnzbvtrzbvvqalfw");
    expect(migration).not.toContain("service_role_key");
  });

  it("issues a one-time invocation token for every dispatch", () => {
    expect(migration).toContain("public.issue_game_reconciler_invocation_internal()");
    expect(migration).toContain("jsonb_build_object('invocationToken', v_token::text)");
    expect(migration).toContain("net.http_post(");
  });

  it("restricts scheduler configuration and dispatch from browser roles", () => {
    expect(migration).toContain("revoke all on private.game_reconciler_scheduler_config from public, anon, authenticated");
    expect(migration).toContain("revoke all on function private.dispatch_game_reconciler_internal() from public, anon, authenticated");
  });

  it("uses one bounded recurring wake cadence and the dedicated reconciler endpoint", () => {
    expect(migration).toContain("'jk002-game-reconciler'");
    expect(migration).toContain("'10 seconds'");
    expect(migration).toContain("/functions/v1/game-reconciler");
    expect(migration).toContain("timeout_milliseconds := 5000");
  });

  it("does not contain gameplay, scoring or bot decisions", () => {
    expect(migration).not.toContain("scoreDeal");
    expect(migration).not.toContain("play_card");
    expect(migration).not.toContain("choose_trump");
    expect(migration).not.toContain("temporary_bot");
  });
});
