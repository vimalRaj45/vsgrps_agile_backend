const pool = require('./db');
pool.query("SELECT check_clause FROM information_schema.check_constraints WHERE constraint_name = 'projects_status_check'")
  .then(res => {
    console.log(res.rows[0]);
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
