-- Preserve structured signup names and allow organization admins to edit member profiles.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, signup_metadata)
  VALUES (
    new.id,
    new.email,
    COALESCE(
      NULLIF(TRIM(COALESCE(new.raw_user_meta_data->>'full_name', '')), ''),
      NULLIF(TRIM(CONCAT_WS(' ', new.raw_user_meta_data->>'first_name', new.raw_user_meta_data->>'last_name')), ''),
      new.email
    ),
    jsonb_strip_nulls(jsonb_build_object(
      'first_name', new.raw_user_meta_data->>'first_name',
      'last_name', new.raw_user_meta_data->>'last_name',
      'full_name', new.raw_user_meta_data->>'full_name'
    ))
  );
  RETURN new;
END;
$function$;

DROP POLICY IF EXISTS "Organization admins can update member profiles" ON public.profiles;

CREATE POLICY "Organization admins can update member profiles"
  ON public.profiles
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_members admin_member
      JOIN public.organization_members target_member
        ON target_member.organization_id = admin_member.organization_id
      WHERE admin_member.user_id = auth.uid()
        AND admin_member.role = 'admin'
        AND admin_member.is_active = true
        AND target_member.user_id = profiles.id
        AND target_member.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.organization_members admin_member
      JOIN public.organization_members target_member
        ON target_member.organization_id = admin_member.organization_id
      WHERE admin_member.user_id = auth.uid()
        AND admin_member.role = 'admin'
        AND admin_member.is_active = true
        AND target_member.user_id = profiles.id
        AND target_member.is_active = true
    )
  );
