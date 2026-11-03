# Migrations

`schema.sql` already contains every table. Migrations exist only for **purely additive** changes a module cannot avoid
(`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN`, `CREATE INDEX IF NOT EXISTS`). Never edit `schema.sql`
and never modify a migration after it has been applied to any shared DB — add a new file instead.

## Naming

`NN_<module>.sql`, applied in numeric (natural) order and recorded by filename in `schema_migrations`:

| Module | NN | Example |
|---|---|---|
| listings | 10 | `10_listings.sql` |
| wanted | 11 | `11_wanted.sql` |
| chat | 12 | `12_chat.sql` |
| verify | 13 | `13_verify.sql` |
| map | 14 | `14_map.sql` |
| shuttle | 15 | `15_shuttle.sql` |
| market | 16 | `16_market.sql` |
| buddy | 17 | `17_buddy.sql` |
| billing | 18 | `18_billing.sql` |
| admin | 19 | `19_admin.sql` |

A module that needs a second file uses a suffix letter: `10b_listings.sql`. Scaffold-owned migrations (if ever) use `00`–`09`.

## Runner

`server/src/db/index.ts#applyMigrations()` runs on every boot after `schema.sql`: each un-applied file runs inside a
transaction and is inserted into `schema_migrations(name)`. `ALTER TABLE ADD COLUMN` is not idempotent in SQLite, so a
file is never re-run; guard with `columnExists()` only in TypeScript-side code, not in SQL.
