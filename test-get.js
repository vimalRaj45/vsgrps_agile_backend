const pool = require('./db');
(async () => {
  try {
    const { rows } = await pool.query('SELECT m.*, p.name as project_name FROM meetings m LEFT JOIN projects p ON m.project_id = p.id WHERE m.company_id = $1', ['a9f27e2d-1508-4d6b-b044-bb51a36fdcce']);
    console.log("SUCCESS");
    process.exit(0);
  } catch (err) {
    console.error("ERROR:", err);
    process.exit(1);
  }
})();
