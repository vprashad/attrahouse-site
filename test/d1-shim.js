// A small stand-in for Cloudflare D1, on Node's built-in SQLite, so the stock rules can be
// tested without a Cloudflare account. It mirrors the parts of D1's API that stock.js uses.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

class Stmt {
  constructor(db, sql, params = []) { this.db = db; this.sql = sql; this.params = params; }
  bind(...p) { return new Stmt(this.db, this.sql, p); }
  _run() { const r = this.db.prepare(this.sql).run(...this.params); return { success: true, meta: { changes: Number(r.changes) } }; }
  async run() { return this._run(); }
  async all() { return { results: this.db.prepare(this.sql).all(...this.params) }; }
  async first() { return this.db.prepare(this.sql).get(...this.params) ?? null; }
}

export function makeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(readFileSync(new URL('../migrations/0001_stock.sql', import.meta.url), 'utf8'));
  return {
    raw: db,
    prepare: (sql) => new Stmt(db, sql),
    // D1 runs a batch as one transaction: if any statement fails, none of them apply.
    async batch(stmts) {
      db.exec('BEGIN');
      try { const out = stmts.map((s) => s._run()); db.exec('COMMIT'); return out; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}
