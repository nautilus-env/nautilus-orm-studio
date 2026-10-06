# Nautilus Studio

Nautilus Studio is a small Next.js admin surface for [nautilus](https://github.com/y0gm4/nautilus).

It provides:

- schema browsing
- table data inspection and editing
- a raw SQL query console

This package is not meant to be installed directly by end users. It is intended to be installed and wired up by the `nautilus-orm` module inside a Nautilus workspace.

> **Warning:** Nautilus Studio provides direct, unauthenticated access to your database. It should **never** be hosted on a publicly accessible URL due to severe security risks. It is designed for local development use only.

## Local development

This app expects access to:

- a `schema.nautilus` file in the workspace root, or `NAUTILUS_SCHEMA_PATH`
- the `nautilus` CLI binary available locally
- any database environment variables required by your schema

Run the app with:

```bash
npm install
npm run dev
```

Open `http://localhost:3000` to use the studio.

## Large demo

With Node.js 22.13+ (or 24+) and the local Nautilus CLI, run:

```bash
npm run demo
```

This creates an isolated SQLite database in `generated/demo` with **64 tables,
124 foreign keys and 186,600 records**, then starts Studio on port 3001.
The data includes nullable fields, booleans, numbers, JSON, dates and Unicode text.
The generated database and schema are ignored by Git.

- [Schema diagram](http://localhost:3001): zoom and pan across all tables and relations;
  use the minimap to navigate and the fit-view control to return to the overview.
- [Orders with 1,000 rows per page](http://localhost:3001/tables/orders?page_size=1000):
  scroll, resize columns, sort, filter and edit a dataset of 50,000 orders.
- [SQL console](http://localhost:3001/query): try the aggregate query below.

```sql
SELECT status, COUNT(*) AS orders, ROUND(SUM(amount), 2) AS total
FROM orders
GROUP BY status
ORDER BY orders DESC;
```

Stop the server with Ctrl+C. Subsequent runs preserve your demo edits.
To restore the demo data, stop the demo server and run `npm run demo -- --reset`.
Use `npm run demo:seed` to create only the database and schema.
