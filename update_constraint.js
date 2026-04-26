const pool = require('./db');

async function updateConstraint() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Drop old constraint
    await client.query('ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check');
    
    // Add new constraint with more values
    await client.query("ALTER TABLE projects ADD CONSTRAINT projects_status_check CHECK (status IN ('Active', 'Planned', 'Inactive', 'On Hold', 'Completed'))");
    
    await client.query('COMMIT');
    console.log('Successfully updated projects_status_check constraint');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed to update constraint:', err);
  } finally {
    client.release();
    process.exit(0);
  }
}

updateConstraint();
