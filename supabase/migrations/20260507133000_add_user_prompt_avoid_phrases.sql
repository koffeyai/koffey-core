alter table public.user_prompt_preferences
  add column if not exists avoid_phrases text[] default '{}'::text[];

comment on column public.user_prompt_preferences.avoid_phrases
  is 'Phrases the rep does not want the AI to use on their behalf';
