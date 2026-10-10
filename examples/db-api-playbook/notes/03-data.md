# Data access

- **Schema and row-level security**: constraints in the database (NOT NULL, FK, CHECK); RLS when several tenants or users share tables, mandatory for generated APIs.
- **Migrations without downtime**: expand / contract. Add the new column or table, move readers and writers over, backfill, then drop the old one. pgroll automates it for Postgres with versioned views and rollback.
- **ORM or SQL?** An ORM for simple CRUD; a query builder or plain SQL where queries matter (reports, keyset pagination, bulk writes). Either way: parameters, never string concatenation.
- **Transactions**: one per request that writes, short, no network calls inside.
- **Connection pool**: Postgres has no built-in pooler. PgBouncer (1.26, September 2026), Supavisor, RDS Proxy; on serverless or edge runtimes an HTTP / WebSocket driver (e.g. Neon).
- **PostgreSQL 18** is the current major (September 2025); 19 is in beta, GA planned for late October 2026. PostgreSQL 14 reaches end of life on 12 November 2026.

Sources: [Row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) · [Parallel change](https://martinfowler.com/bliki/ParallelChange.html) · [pgroll](https://xata.io/blog/pgroll-expand-contract) · [PgBouncer changelog](https://www.pgbouncer.org/changelog.html) · [Supavisor](https://github.com/supabase/supavisor) · [RDS Proxy](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-proxy.html) · [Neon serverless driver](https://neon.com/docs/serverless/serverless-driver) · [Postgres versioning](https://www.postgresql.org/support/versioning/)
