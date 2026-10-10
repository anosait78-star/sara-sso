-- =====================================================================
-- Phase 8 · production readiness (Supabase Cloud).
-- The local stack ships pg_net preinstalled; a cloud project must enable it explicitly for
-- app.kick_push_dispatch (pg_cron -> dispatch-notification). Vault secret push_dispatch_url is
-- set per environment (see DEPLOYMENT.md), never in a migration.
-- =====================================================================
create extension if not exists pg_net;
