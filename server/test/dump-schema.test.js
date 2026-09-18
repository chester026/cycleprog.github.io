const { buildCreateTable, topoSort, makeIndexIdempotent, buildForeignKeyStatement } = require('../scripts/dump-schema');

describe('scripts/dump-schema.js pure helpers', () => {
  describe('buildCreateTable', () => {
    it('emits an IF NOT EXISTS CREATE TABLE with columns, PK, unique and check constraints', () => {
      const sql = buildCreateTable({
        name: 'goals',
        columns: [
          { name: 'id', dataType: 'integer', notNull: true, default: "nextval('goals_id_seq'::regclass)" },
          { name: 'user_id', dataType: 'integer', notNull: true, default: null },
          { name: 'status', dataType: 'text', notNull: false, default: "'active'::text" },
        ],
        primaryKey: ['id'],
        uniques: [{ name: 'goals_user_id_key', columns: ['user_id'] }],
        checks: [{ name: 'goals_status_check', definition: "CHECK (status IN ('active','done'))" }],
      });

      expect(sql).toContain('CREATE TABLE IF NOT EXISTS "goals" (');
      expect(sql).toContain('"id" integer NOT NULL DEFAULT nextval');
      expect(sql).toContain('"user_id" integer NOT NULL');
      expect(sql).toContain('"status" text DEFAULT');
      expect(sql).toContain('PRIMARY KEY ("id")');
      expect(sql).toContain('CONSTRAINT "goals_user_id_key" UNIQUE ("user_id")');
      expect(sql).toContain('CONSTRAINT "goals_status_check" CHECK');
      expect(sql.trim().endsWith(');')).toBe(true);
    });

    it('handles a table with no PK/uniques/checks', () => {
      const sql = buildCreateTable({
        name: 'plain',
        columns: [{ name: 'note', dataType: 'text', notNull: false, default: null }],
        primaryKey: null,
        uniques: [],
        checks: [],
      });
      expect(sql).toBe('CREATE TABLE IF NOT EXISTS "plain" (\n  "note" text\n);');
    });
  });

  describe('topoSort', () => {
    it('orders FK targets before the tables that reference them', () => {
      const tables = ['coach_messages', 'coach_conversations', 'users'];
      const fks = [
        { table: 'coach_messages', refTable: 'coach_conversations' },
        { table: 'coach_conversations', refTable: 'users' },
      ];
      const order = topoSort(tables, fks);
      expect(order.indexOf('users')).toBeLessThan(order.indexOf('coach_conversations'));
      expect(order.indexOf('coach_conversations')).toBeLessThan(order.indexOf('coach_messages'));
    });

    it('falls back to alphabetical order for tables with no FK relationship', () => {
      const order = topoSort(['zebra', 'apple', 'mango'], []);
      expect(order).toEqual(['apple', 'mango', 'zebra']);
    });

    it('does not lose or duplicate tables when a genuine FK cycle exists', () => {
      const tables = ['a', 'b'];
      const fks = [
        { table: 'a', refTable: 'b' },
        { table: 'b', refTable: 'a' },
      ];
      const order = topoSort(tables, fks);
      expect(order.sort()).toEqual(['a', 'b']);
    });

    it('ignores a self-referencing FK', () => {
      const order = topoSort(['calendar_events'], [{ table: 'calendar_events', refTable: 'calendar_events' }]);
      expect(order).toEqual(['calendar_events']);
    });
  });

  describe('makeIndexIdempotent', () => {
    it('adds IF NOT EXISTS to a plain CREATE INDEX', () => {
      expect(makeIndexIdempotent('CREATE INDEX idx_foo ON bar (baz)')).toBe(
        'CREATE INDEX IF NOT EXISTS idx_foo ON bar (baz)'
      );
    });

    it('adds IF NOT EXISTS to a CREATE UNIQUE INDEX', () => {
      expect(makeIndexIdempotent('CREATE UNIQUE INDEX idx_foo ON bar (baz)')).toBe(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_foo ON bar (baz)'
      );
    });

    it('is a no-op when IF NOT EXISTS is already present', () => {
      const sql = 'CREATE INDEX IF NOT EXISTS idx_foo ON bar (baz)';
      expect(makeIndexIdempotent(sql)).toBe(sql);
    });
  });

  describe('buildForeignKeyStatement', () => {
    it('wraps the FK in a pg_constraint existence guard keyed by constraint name', () => {
      const sql = buildForeignKeyStatement('calendar_events', 'calendar_events_goal_id_fkey', 'FOREIGN KEY (goal_id) REFERENCES meta_goals(id) ON DELETE SET NULL');
      expect(sql).toContain("SELECT 1 FROM pg_constraint WHERE conname = 'calendar_events_goal_id_fkey'");
      expect(sql).toContain('ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_goal_id_fkey" FOREIGN KEY (goal_id) REFERENCES meta_goals(id) ON DELETE SET NULL;');
      expect(sql).toContain('DO $$');
    });
  });
});
