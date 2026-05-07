const pool = require('./db');

async function migrate() {
  try {
    console.log('Migrating database for Social Auth...');
    
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE,
      ADD COLUMN IF NOT EXISTS github_id TEXT UNIQUE,
      ALTER COLUMN password_hash DROP NOT NULL;
    `);
    
    console.log('✅ Migration successful: google_id and github_id columns added.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
}

migrate();
