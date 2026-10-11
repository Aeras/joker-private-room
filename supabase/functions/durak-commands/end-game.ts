/** Trusted server-only cancellation. The host predicate is part of the atomic DELETE. */
type Result = { data: unknown; error: unknown };
type DeleteQuery = {
  eq: (column: string, value: string) => DeleteQuery;
  select: (columns: string) => PromiseLike<Result>;
};
type EndGameClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<Result>;
  from: (table: string) => { delete: () => DeleteQuery };
};
export async function endDurakGame(admin: EndGameClient, sessionToken: string, code: string) {
  const { data: players, error: authError } = await admin.rpc("validate_player_session_internal", {
    p_session_token: sessionToken,
  });
  if (authError) return { ok: false, code: "SERVICE_UNAVAILABLE" } as const;
  const id = Array.isArray(players) && typeof players[0]?.id === "string" ? players[0].id : null;
  if (!id) return { ok: false, code: "NOT_AUTHENTICATED" } as const;
  const { data, error } = await admin
    .from("durak_rooms")
    .delete()
    .eq("code", code)
    .eq("host_player_id", id)
    .select("id");
  if (error) return { ok: false, code: "SERVICE_UNAVAILABLE" } as const;
  if (!Array.isArray(data) || data.length !== 1) return { ok: false, code: "HOST_ONLY" } as const;
  // Existing DURAK foreign keys cascade to seats and private match state only.
  return { ok: true, cancelled: true } as const;
}
