const pool = require('./db');

async function truncateAll() {
  const client = await pool.connect();
  try {
    console.log('--- Database Reset Initiated ---');
    await client.query('BEGIN');

    // List of tables to truncate in order of dependency if CASCADE is not used, 
    // but CASCADE is safer and easier.
    const tables = [
      'audit_log',
      'notifications',
      'meeting_notes',
      'meeting_attendees',
      'meetings',
      'task_comments',
      'task_label_assignments',
      'task_labels',
      'subtasks',
      'tasks',
      'project_members',
      'projects',
      'links',
      'files',
      'invites',
      'users',
      'companies',
      'sessions',
      'push_subscriptions'
    ];

    console.log(`Truncating ${tables.length} tables...`);
    
    // TRUNCATE with CASCADE to handle foreign key dependencies
    await client.query(`TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY CASCADE`);

    await client.query('COMMIT');
    console.log('✅ All data truncated successfully. Database is clean.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error truncating database:', err.message);
  } finally {
    client.release();
    process.exit();
  }
}

truncateAll();
