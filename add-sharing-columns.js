const pool = require('./db');

async function migrate() {
  try {
    console.log('--- Adding Sharing Columns ---');
    
    // Add columns to files
    await pool.query('ALTER TABLE files ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT FALSE');
    await pool.query('ALTER TABLE files ADD COLUMN IF NOT EXISTS shared_with UUID[]');
    
    // Add columns to links
    await pool.query('ALTER TABLE links ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT FALSE');
    await pool.query('ALTER TABLE links ADD COLUMN IF NOT EXISTS shared_with UUID[]');
    
    console.log('✅ Columns added successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    process.exit();
  }
}

migrate();
