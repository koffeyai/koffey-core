ALTER TABLE public.chat_sessions
  ADD COLUMN IF NOT EXISTS pending_sequence_action JSONB,
  ADD COLUMN IF NOT EXISTS pending_sequence_action_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pending_draft_email JSONB,
  ADD COLUMN IF NOT EXISTS pending_draft_email_at TIMESTAMPTZ;

ALTER TABLE public.messaging_sessions
  ADD COLUMN IF NOT EXISTS pending_sequence_action JSONB,
  ADD COLUMN IF NOT EXISTS pending_sequence_action_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pending_draft_email JSONB,
  ADD COLUMN IF NOT EXISTS pending_draft_email_at TIMESTAMPTZ;

COMMENT ON COLUMN public.chat_sessions.pending_sequence_action IS 'Stores pending sequence workflow payload while awaiting user clarification or confirmation';
COMMENT ON COLUMN public.chat_sessions.pending_sequence_action_at IS 'Timestamp when pending sequence workflow was stored';
COMMENT ON COLUMN public.chat_sessions.pending_draft_email IS 'Stores pending draft email workflow payload while awaiting missing recipient details';
COMMENT ON COLUMN public.chat_sessions.pending_draft_email_at IS 'Timestamp when pending draft email workflow was stored';
COMMENT ON COLUMN public.messaging_sessions.pending_sequence_action IS 'Stores pending sequence workflow payload while awaiting user clarification or confirmation';
COMMENT ON COLUMN public.messaging_sessions.pending_sequence_action_at IS 'Timestamp when pending sequence workflow was stored';
COMMENT ON COLUMN public.messaging_sessions.pending_draft_email IS 'Stores pending draft email workflow payload while awaiting missing recipient details';
COMMENT ON COLUMN public.messaging_sessions.pending_draft_email_at IS 'Timestamp when pending draft email workflow was stored';
