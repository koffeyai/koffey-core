ALTER TABLE public.chat_sessions
  ADD COLUMN IF NOT EXISTS pending_schedule_meeting JSONB,
  ADD COLUMN IF NOT EXISTS pending_schedule_meeting_at TIMESTAMPTZ;

ALTER TABLE public.messaging_sessions
  ADD COLUMN IF NOT EXISTS pending_schedule_meeting JSONB,
  ADD COLUMN IF NOT EXISTS pending_schedule_meeting_at TIMESTAMPTZ;

COMMENT ON COLUMN public.chat_sessions.pending_schedule_meeting IS 'Stores pending scheduling payload while awaiting user confirmation';
COMMENT ON COLUMN public.chat_sessions.pending_schedule_meeting_at IS 'Timestamp when pending scheduling confirmation was requested';
COMMENT ON COLUMN public.messaging_sessions.pending_schedule_meeting IS 'Stores pending scheduling payload while awaiting user confirmation';
COMMENT ON COLUMN public.messaging_sessions.pending_schedule_meeting_at IS 'Timestamp when pending scheduling confirmation was requested';
