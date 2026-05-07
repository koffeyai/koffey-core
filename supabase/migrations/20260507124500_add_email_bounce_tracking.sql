-- Track asynchronous delivery failures after an email was accepted by the provider.

ALTER TABLE public.email_sends
  DROP CONSTRAINT IF EXISTS email_sends_status_check;

ALTER TABLE public.email_sends
  ADD CONSTRAINT email_sends_status_check
  CHECK (status IN ('pending', 'sent', 'failed', 'blocked', 'bounced'));

CREATE INDEX IF NOT EXISTS idx_email_sends_recipient_status
  ON public.email_sends (organization_id, user_id, recipient_email, status, created_at DESC);
