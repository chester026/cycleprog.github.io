#!/usr/bin/env node
// Prints an idempotent, `CREATE TABLE IF NOT EXISTS`-based schema-only dump
// of the `public` schema to stdout — a substitute for `pg_dump --schema-only`
// on machines that don't have the Postgres client tools installed (the
// owner's Mac, per docs/audit/00-AUDIT-AND-PLAN.md T-1.4). Connects with the
// exact same config the app pool and migrate.js use (db/pgConfig.js).
//
// Usage:
//   node scripts/dump-schema.js > migrations/1758000000000_baseline.sql
//
// Only ever SELECTs from pg_catalog/information_schema — never writes to the
// target database.
//
// The three "pure" helpers below (buildCreateTable, buildColumnDef,
// topoSort) take plain data in and return a SQL string / ordered array out —
// no DB access — so they're unit-testable with fixture metadata (see
// test/dump-schema.test.js) without a live Postgres connection.

const { Client } = require('pg');
const { buildPgConfig } = require('../db/pgConfig');

// --- pure formatting helpers -------------------------------------------------

// tableMeta: {
//   name: string,
//   columns: [{ name, dataType, notNull, default }],
//   primaryKey: string[] | null,
//   uniques: [{ name, columns: string[] }],
//   checks: [{ name, definition }],   // definition is the full `CHECK (...)` clause from pg_get_constraintdef
// }
function buildColumnDef(col) {
  let def = `  "${col.name}" ${col.dataType}`;
  if (col.notNull) def += ' NOT NULL';
  if (col.default != null) def += ` DEFAULT ${col.default}`;
  return def;
}

function buildCreateTable(tableMeta) {
  const lines = tableMeta.columns.map(buildColumnDef);

  if (tableMeta.primaryKey && tableMeta.primaryKey.length > 0) {
    const cols = tableMeta.primaryKey.map((c) => `"${c}"`).join(', ');
    lines.push(`  PRIMARY KEY (${cols})`);
  }

  for (const u of tableMeta.uniques || []) {
    const cols = u.columns.map((c) => `"${c}"`).join(', ');
    lines.push(`  CONSTRAINT "${u.name}" UNIQUE (${cols})`);
  }

  for (const c of tableMeta.checks || []) {
    lines.push(`  CONSTRAINT "${c.name}" ${c.definition}`);
  }

  return `CREATE TABLE IF NOT EXISTS "${tableMeta.name}" (\n${lines.join(',\n')}\n);`;
}

// Orders `tables` (array of table names) so that any table referenced by
// another table's foreign key comes before the table that references it —
// topological sort by FK edges, so the emitted CREATE TABLE statements never
// forward-reference a table that hasn't been created yet (note: this file
// still emits FKs themselves as separate ALTER TABLE ... ADD CONSTRAINT
// statements after every table exists, specifically so a genuine FK cycle,
// or a topo-sort tie, can never make the dump invalid — this ordering is
// purely to keep the output readable/deterministic).
// `fks`: [{ table, refTable }] — one entry per foreign-key constraint,
// `table` referencing `refTable`. Self-references (table === refTable) are
// ignored. Ties (and tables with no FK relationships at all) are broken
// alphabetically for a stable, reviewable diff between dumps.
function topoSort(tables, fks) {
  const remaining = new Set(tables);
  const dependsOn = new Map(); // table -> Set(tables it references)
  for (const t of tables) dependsOn.set(t, new Set());
  for (const { table, refTable } of fks || []) {
    if (table === refTable) continue;
    if (!dependsOn.has(table) || !remaining.has(refTable)) continue;
    dependsOn.get(table).add(refTable);
  }

  const sorted = [];
  const visiting = new Set();

  function visit(t) {
    if (sorted.includes(t) || !remaining.has(t)) return;
    if (visiting.has(t)) return; // cycle — break it, order doesn't matter for correctness (FKs added later)
    visiting.add(t);
    const deps = Array.from(dependsOn.get(t) || []).sort();
    for (const dep of deps) visit(dep);
    visiting.delete(t);
    if (!sorted.includes(t)) sorted.push(t);
  }

  for (const t of Array.from(remaining).sort()) visit(t);
  return sorted;
}

// Rewrites a `pg_indexes.indexdef` (e.g. `CREATE INDEX foo ON bar (...)` or
// `CREATE UNIQUE INDEX foo ON bar (...)`) to add `IF NOT EXISTS` right after
// `INDEX`, so re-running the dump against a database that already has the
// index is a no-op instead of an error.
function makeIndexIdempotent(indexdef) {
  return indexdef.replace(/\bCREATE (UNIQUE )?INDEX\b(?!\s+IF NOT EXISTS)/i, (m, unique) => `CREATE ${unique || ''}INDEX IF NOT EXISTS`);
}

// Wraps a `pg_get_constraintdef()` FOREIGN KEY definition in a guarded
// `DO $$ ... $$` block keyed by constraint name, so adding it twice (e.g. a
// second run of this migration, or running it against a DB where the FK was
// added some other way) is a no-op instead of a duplicate-constraint error —
// Postgres has no `ADD CONSTRAINT IF NOT EXISTS`.
function buildForeignKeyStatement(tableName, constraintName, definition) {
  return (
    `DO $$\nBEGIN\n` +
    `  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${constraintName}') THEN\n` +
    `    ALTER TABLE "${tableName}" ADD CONSTRAINT "${constraintName}" ${definition};\n` +
    `  END IF;\nEND $$;`
  );
}

// --- live-DB dump -------------------------------------------------------------

async function fetchTables(client) {
  const { rows } = await client.query(`
    SELECT c.relname AS name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> 'pgmigrations'
    ORDER BY c.relname
  `);
  return rows.map((r) => r.name);
}

async function fetchColumns(client, table) {
  const { rows } = await client.query(
    `
    SELECT
      a.attname AS name,
      format_type(a.atttypid, a.atttypmod) AS data_type,
      a.attnotnull AS not_null,
      pg_get_expr(ad.adbin, ad.adrelid) AS default_expr
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_attrdef ad ON ad.adrelid = c.oid AND ad.adnum = a.attnum
    WHERE n.nspname = 'public' AND c.relname = $1 AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY a.attnum
    `,
    [table]
  );
  return rows.map((r) => ({
    name: r.name,
    dataType: r.data_type,
    notNull: r.not_null,
    default: r.default_expr,
  }));
}

async function fetchConstraints(client, table) {
  const { rows } = await client.query(
    `
    SELECT conname AS name, contype, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid = (
      SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = $1
    )
    `,
    [table]
  );
  return rows;
}

async function fetchIndexes(client, table) {
  // Exclude indexes that already back a PK/UNIQUE constraint — those are
  // emitted as part of the CREATE TABLE / ADD CONSTRAINT statements instead,
  // to avoid emitting the same index twice under two different names.
  const { rows } = await client.query(
    `
    SELECT i.indexname, i.indexdef
    FROM pg_indexes i
    WHERE i.schemaname = 'public' AND i.tablename = $1
      AND NOT EXISTS (
        SELECT 1 FROM pg_constraint con
        WHERE con.conrelid = (
          SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname = $1
        )
        AND con.contype IN ('p', 'u')
        AND con.conname = i.indexname
      )
    ORDER BY i.indexname
    `,
    [table]
  );
  return rows;
}

async function fetchSequenceDefaults(client) {
  // Sequences referenced by a column's nextval(...) default (SERIAL/IDENTITY
  // columns) already come through column_default in fetchColumns, and
  // CREATE TABLE creates the backing sequence implicitly for a fresh table.
  // This only matters for a sequence that's referenced but NOT implicitly
  // created by any CREATE TABLE in this dump (e.g. one shared across
  // tables, or standalone) — detect those explicitly so the dump still
  // works if one shows up.
  const { rows } = await client.query(`
    SELECT c.relname AS name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'S' AND c.relname <> 'pgmigrations_id_seq'
    ORDER BY c.relname
  `);
  return rows.map((r) => r.name);
}

async function buildTableMeta(client, table) {
  const columns = await fetchColumns(client, table);
  const constraints = await fetchConstraints(client, table);

  const pk = constraints.find((c) => c.contype === 'p');
  let primaryKey = null;
  if (pk) {
    const match = pk.definition.match(/PRIMARY KEY \(([^)]+)\)/i);
    primaryKey = match ? match[1].split(',').map((s) => s.trim().replace(/"/g, '')) : null;
  }

  const uniques = constraints
    .filter((c) => c.contype === 'u')
    .map((c) => {
      const match = c.definition.match(/UNIQUE \(([^)]+)\)/i);
      return {
        name: c.name,
        columns: match ? match[1].split(',').map((s) => s.trim().replace(/"/g, '')) : [],
      };
    });

  const checks = constraints
    .filter((c) => c.contype === 'c')
    .map((c) => ({ name: c.name, definition: c.definition }));

  const foreignKeys = constraints
    .filter((c) => c.contype === 'f')
    .map((c) => {
      const refMatch = c.definition.match(/REFERENCES\s+"?([\w.]+)"?/i);
      return { name: c.name, definition: c.definition, refTable: refMatch ? refMatch[1] : null };
    });

  return { name: table, columns, primaryKey, uniques, checks, foreignKeys };
}

async function main() {
  const client = new Client(buildPgConfig());
  await client.connect();
  try {
    const host = (buildPgConfig().host || (client.connectionParameters && client.connectionParameters.host) || 'unknown-host');
    const tables = await fetchTables(client);
    // Sequential on purpose: a single pg.Client must not run queries concurrently.
    const metas = [];
    for (const t of tables) metas.push(await buildTableMeta(client, t));
    const metaByName = new Map(metas.map((m) => [m.name, m]));

    const fkEdges = [];
    for (const m of metas) {
      for (const fk of m.foreignKeys) {
        if (fk.refTable) fkEdges.push({ table: m.name, refTable: fk.refTable });
      }
    }

    const order = topoSort(tables, fkEdges);

    const out = [];
    out.push(`-- Schema-only dump of the "public" schema, generated by scripts/dump-schema.js`);
    out.push(`-- Generated at: ${new Date().toISOString()}`);
    out.push(`-- Source host: ${host}`);
    out.push(`-- Idempotent — every statement is IF NOT EXISTS / conditionally guarded, safe to`);
    out.push(`-- run against a database that already has some or all of this schema.`);
    out.push('');

    // Sequences not implicitly covered by a CREATE TABLE's own serial/identity column.
    const sequences = await fetchSequenceDefaults(client);
    for (const seq of sequences) {
      out.push(`CREATE SEQUENCE IF NOT EXISTS "${seq}";`);
    }
    if (sequences.length) out.push('');

    for (const name of order) {
      const meta = metaByName.get(name);
      out.push(buildCreateTable(meta));
      out.push('');
    }

    for (const name of order) {
      const meta = metaByName.get(name);
      const indexes = await fetchIndexes(client, name);
      for (const idx of indexes) {
        out.push(makeIndexIdempotent(idx.indexdef) + ';');
      }
      if (indexes.length) out.push('');
    }

    for (const name of order) {
      const meta = metaByName.get(name);
      for (const fk of meta.foreignKeys) {
        out.push(buildForeignKeyStatement(name, fk.name, fk.definition));
        out.push('');
      }
    }

    process.stdout.write(out.join('\n') + '\n');
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[dump-schema] failed:', err);
    process.exit(1);
  });
}

module.exports = {
  buildCreateTable,
  buildColumnDef,
  topoSort,
  makeIndexIdempotent,
  buildForeignKeyStatement,
};
