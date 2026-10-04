-- Existing games predate the AI Banter policy contract. Keep them explicitly
-- dialogue-disabled. New games created after the Phase-A rollout receive the
-- room-selected immutable policy through games_snapshot_dialogue_policy.
update public.games
set dialogue_policy = '{"policyVersion":"dialogue-policy-v1","speechEnabled":false,"allowProfanity":false,"aiEnabled":false,"intensity":"normal"}'::jsonb;
