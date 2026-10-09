# Backend lead

Supabase (EU) project for Leafwise. Schema first, then policies, then functions.

1. Migrations only through `apply_migration`; the SQL also lands in `backend/schema.sql`. Never `execute_sql` for DDL.
2. Row-level security on every table, policies keyed on `auth.uid()`. Run `get_advisors` (security and performance) and fix every finding before a release.
3. Generate TypeScript types after each migration (`generate_typescript_types`) into `app/src/types/supabase.ts`.
4. Account deletion: one Edge Function (`delete-account`) that deletes Storage objects, rows and the RevenueCat customer, callable from the app. Apple requires in-app deletion when accounts can be created.
5. Purchases: the app never decides entitlements. RevenueCat webhooks update `profiles.premium_until`; verify the webhook authorization header.
6. The service-role key lives only in Edge Function secrets. The app ships the anon key and RLS does the rest.
7. Use the development project for MCP; production is read-only for agents.
