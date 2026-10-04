#!/usr/bin/env python3
"""Assign the existing unowned companion to a chosen, registered local account."""
import subprocess


def sql_literal(value):
    return "'" + value.replace("'", "''") + "'"


def main():
    email = input('Email of the account that should own the existing Lumen: ').strip()
    if not email or '\x00' in email:
        raise SystemExit('Enter the email you registered in Lumen.')
    sql = "BEGIN;\nSELECT set_config('lumen.claim_email', " + sql_literal(email) + ", true);\n" + '''DO $claim$
DECLARE account_id uuid; account_name text; legacy_count integer;
BEGIN
  SELECT id, coalesce(nullif(raw_user_meta_data->>'display_name',''),'User')
    INTO account_id, account_name FROM auth.users WHERE lower(email)=lower(current_setting('lumen.claim_email'));
  IF account_id IS NULL THEN RAISE EXCEPTION 'Register this account first'; END IF;
  INSERT INTO public.profiles(id,display_name) VALUES (account_id,account_name) ON CONFLICT(id) DO NOTHING;
  UPDATE public.companions SET owner_user_id=account_id WHERE owner_user_id IS NULL;
  GET DIAGNOSTICS legacy_count=ROW_COUNT;
  UPDATE public.memories m SET
    reported_by_user_id=coalesce(m.reported_by_user_id,account_id),
    subject_user_id=CASE WHEN m.subject IN ('user','shared') THEN account_id ELSE NULL END
    FROM public.companions c WHERE m.companion_id=c.id AND c.owner_user_id=account_id;
  RAISE NOTICE 'Assigned % existing companion(s). No conversations or memories deleted.',legacy_count;
END $claim$;
COMMIT;'''
    subprocess.run(['docker','exec','-i','supabase_db_lumen-push','psql','-U','postgres','-d','postgres',
                    '-v','ON_ERROR_STOP=1'], input=sql, text=True, check=True)
    print('Sign out and sign in again to load the existing companion.')


if __name__ == '__main__':
    main()
