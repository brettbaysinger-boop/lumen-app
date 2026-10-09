-- Account-synced Raialume appearance preferences.
-- One row per authenticated user.

CREATE TABLE public.user_appearance_preferences (
  user_id uuid PRIMARY KEY
    REFERENCES auth.users(id) ON DELETE CASCADE,

  scheme_id text NOT NULL DEFAULT 'gold-dark',

  appearance jsonb NOT NULL DEFAULT '{}'::jsonb,

  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT appearance_is_object
    CHECK (jsonb_typeof(appearance) = 'object'),

  CONSTRAINT scheme_id_length
    CHECK (char_length(scheme_id) BETWEEN 1 AND 64)
);

ALTER TABLE public.user_appearance_preferences
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_appearance_select_own
  ON public.user_appearance_preferences
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY user_appearance_insert_own
  ON public.user_appearance_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY user_appearance_update_own
  ON public.user_appearance_preferences
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.touch_user_appearance_preferences()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_appearance_preferences_updated_at
BEFORE UPDATE ON public.user_appearance_preferences
FOR EACH ROW
EXECUTE FUNCTION public.touch_user_appearance_preferences();

GRANT SELECT, INSERT, UPDATE
  ON public.user_appearance_preferences
  TO authenticated;

COMMENT ON TABLE public.user_appearance_preferences IS
  'Per-user Raialume theme and appearance settings, synchronized across devices.';
