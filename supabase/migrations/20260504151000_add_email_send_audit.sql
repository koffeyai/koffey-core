-- Audit log for outbound scheduling emails.

CREATE TABLE IF NOT EXISTS public.email_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'blocked')),
  provider TEXT,
  provider_message_id TEXT,
  error_message TEXT,
  trace_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_sends_org_created_at
  ON public.email_sends (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_sends_user_created_at
  ON public.email_sends (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_sends_contact_id
  ON public.email_sends (contact_id);

ALTER TABLE public.email_sends ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.email_sends FROM anon, authenticated;
GRANT ALL ON TABLE public.email_sends TO service_role;
