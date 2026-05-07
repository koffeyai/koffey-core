CREATE OR REPLACE FUNCTION public.touch_chat_session_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.chat_sessions
  SET updated_at = now(),
      is_active = true
  WHERE id = NEW.session_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_chat_session_on_message ON public.chat_messages;
CREATE TRIGGER touch_chat_session_on_message
AFTER INSERT ON public.chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.touch_chat_session_on_message();
