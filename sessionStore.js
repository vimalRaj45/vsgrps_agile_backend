const pool = require('./db');

class PostgresStore {
  constructor() {
    this.tableCreated = false;
    // Fix 10: Cleanup expired sessions every 6 hours
    setInterval(() => this.cleanup(), 6 * 60 * 60 * 1000);
  }

  async cleanup() {
    try {
      await this.ensureTable();
      await pool.query('DELETE FROM sessions WHERE expires < NOW()');
      console.log('🧹 Expired sessions cleaned up');
    } catch (err) {
      console.error('Session cleanup error:', err);
    }
  }

  async ensureTable() {
    if (this.tableCreated) return;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        expires TIMESTAMPTZ NOT NULL
      )
    `);
    this.tableCreated = true;
  }

  async get(sessionId, cb) {
    try {
      await this.ensureTable();
      const { rows } = await pool.query('SELECT data FROM sessions WHERE id = $1 AND expires > NOW()', [sessionId]);
      if (rows.length === 0) return cb(null, null);
      cb(null, rows[0].data);
    } catch (err) {
      cb(err);
    }
  }

  async set(sessionId, session, cb) {
    try {
      await this.ensureTable();
      const expires = session.cookie.expires || new Date(Date.now() + 86400000); // Default 1 day
      await pool.query(
        'INSERT INTO sessions (id, data, expires) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET data = $2, expires = $3',
        [sessionId, session, expires]
      );
      cb();
    } catch (err) {
      cb(err);
    }
  }

  async destroy(sessionId, cb) {
    try {
      await this.ensureTable();
      await pool.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
      cb();
    } catch (err) {
      cb(err);
    }
  }
}

module.exports = new PostgresStore();

