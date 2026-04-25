const pool = require('./db');

async function fixUniqueConstraint() {
  const client = await pool.connect();
  try {
    console.log('--- MIGRATION: Fixing Unique Constraint on users table ---');
    
    // 1. Check if the constraint exists
    const checkRes = await client.query(`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'users' AND constraint_name = 'users_email_key'
    `);

    if (checkRes.rows.length > 0) {
      console.log('Dropping old unique constraint: users_email_key');
      await client.query('ALTER TABLE users DROP CONSTRAINT users_email_key');
    } else {
      console.log('Constraint users_email_key not found or already dropped.');
    }

    // 2. Add the new composite unique constraint (email + company_id)
    // First check if it already exists to avoid errors on reruns
    const checkNewRes = await client.query(`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'users' AND constraint_name = 'users_email_company_unique'
    `);

    if (checkNewRes.rows.length === 0) {
      console.log('Adding new composite unique constraint: users_email_company_unique (email, company_id)');
      await client.query('ALTER TABLE users ADD CONSTRAINT users_email_company_unique UNIQUE (email, company_id)');
    } else {
      console.log('Composite constraint users_email_company_unique already exists.');
    }

    console.log('--- Migration completed successfully ---');
  } catch (err) {
    console.error('Migration failed:', err.message);
  } finally {
    client.release();
    process.exit();
  }
}

fixUniqueConstraint();
