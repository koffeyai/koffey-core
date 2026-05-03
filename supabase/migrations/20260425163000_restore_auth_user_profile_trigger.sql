-- Ensure auth signups create public profiles on fresh deployments.

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Repair users created while the trigger was missing.
INSERT INTO public.profiles (id, email, full_name, signup_metadata)
SELECT
  users.id,
  users.email,
  COALESCE(
    NULLIF(TRIM(COALESCE(users.raw_user_meta_data->>'full_name', '')), ''),
    NULLIF(TRIM(CONCAT_WS(' ', users.raw_user_meta_data->>'first_name', users.raw_user_meta_data->>'last_name')), ''),
    users.email
  ),
  jsonb_strip_nulls(jsonb_build_object(
    'first_name', users.raw_user_meta_data->>'first_name',
    'last_name', users.raw_user_meta_data->>'last_name',
    'full_name', users.raw_user_meta_data->>'full_name'
  ))
FROM auth.users AS users
WHERE NOT EXISTS (
  SELECT 1
  FROM public.profiles AS profiles
  WHERE profiles.id = users.id
);
