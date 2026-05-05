-- Durable pending state for deal update confirmations.

ALTER TABLE public.chat_sessions
  ADD COLUMN IF NOT EXISTS pending_deal_update JSONB,
  ADD COLUMN IF NOT EXISTS pending_deal_update_at TIMESTAMPTZ;

ALTER TABLE public.messaging_sessions
  ADD COLUMN IF NOT EXISTS pending_deal_update JSONB,
  ADD COLUMN IF NOT EXISTS pending_deal_update_at TIMESTAMPTZ;

COMMENT ON COLUMN public.chat_sessions.pending_deal_update IS 'Stores pending deal update payload while awaiting user confirmation';
COMMENT ON COLUMN public.chat_sessions.pending_deal_update_at IS 'Timestamp when pending deal update confirmation was requested';
COMMENT ON COLUMN public.messaging_sessions.pending_deal_update IS 'Stores pending deal update payload while awaiting user confirmation';
COMMENT ON COLUMN public.messaging_sessions.pending_deal_update_at IS 'Timestamp when pending deal update confirmation was requested';
