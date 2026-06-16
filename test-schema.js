const pool = require('./db');

(async () => {
  try {
    const res = await pool.query("SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'meetings'");
    console.log(res.rows);
    process.exit(0);
  } catch (e) {
    console.error("FAILED:", e);
  }
})();
