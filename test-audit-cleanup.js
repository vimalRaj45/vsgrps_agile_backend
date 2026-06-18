require('dotenv').config();
const pool = require('./db');

async function testAuditCleanup() {
  console.log('--- Starting Audit Log Auto-Cleanup Tests ---');
  const client = await pool.connect();
  let companyId = null;
  let userId = null;

  try {
    // 1. Setup Test Company
    const companyRes = await client.query('INSERT INTO companies (name) VALUES ($1) RETURNING id', ['Audit Test Company']);
    companyId = companyRes.rows[0].id;
    console.log(`✅ Created test company (ID: ${companyId})`);

    // 2. Setup Test User
    const userRes = await client.query(
      'INSERT INTO users (company_id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [companyId, 'Audit Tester', 'tester@audit.com', 'hash', 'Developer']
    );
    userId = userRes.rows[0].id;
    console.log(`✅ Created test user (ID: ${userId})`);

    // 3. Clear existing logs for this company (if any)
    await client.query('DELETE FROM audit_log WHERE company_id = $1', [companyId]);

    // 4. Insert Test Logs manually with different timestamps
    console.log('\nInserting logs with different timestamps...');
    
    // Log 1: Current (Today)
    await client.query(
      `INSERT INTO audit_log (company_id, user_id, entity_type, entity_id, action, created_at) 
       VALUES ($1, $2, 'test', 1, 'today_action', NOW())`,
      [companyId, userId]
    );
    console.log('✅ Inserted log 1 (today)');

    // Log 2: 3 days ago (Should be kept)
    await client.query(
      `INSERT INTO audit_log (company_id, user_id, entity_type, entity_id, action, created_at) 
       VALUES ($1, $2, 'test', 2, '3_days_ago_action', NOW() - INTERVAL '3 days')`,
      [companyId, userId]
    );
    console.log('✅ Inserted log 2 (3 days ago)');

    // Log 3: 6 days ago (Should be automatically deleted)
    await client.query(
      `INSERT INTO audit_log (company_id, user_id, entity_type, entity_id, action, created_at) 
       VALUES ($1, $2, 'test', 3, '6_days_ago_action', NOW() - INTERVAL '6 days')`,
      [companyId, userId]
    );
    console.log('✅ Inserted log 3 (6 days ago)');

    // 5. Trigger the wrapped pool.query by inserting a new log (which triggers the auto-cleanup logic)
    console.log('\nTriggering a new insertion to run the database auto-cleanup hook...');
    await pool.query(
      `INSERT INTO audit_log (company_id, user_id, entity_type, entity_id, action) 
       VALUES ($1, $2, 'test', 4, 'trigger_cleanup_action')`,
      [companyId, userId]
    );

    // Wait a brief moment for the asynchronous background deletion to complete
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 6. Query the logs for this company
    const { rows } = await client.query('SELECT action, created_at FROM audit_log WHERE company_id = $1 ORDER BY created_at DESC', [companyId]);

    console.log('\n--- Verify Log Contents ---');
    console.log(`Total logs found (expected: 3): ${rows.length}`);
    
    rows.forEach(row => {
      console.log(`- Action: ${row.action}, Created At: ${row.created_at}`);
    });

    const hasToday = rows.some(r => r.action === 'today_action');
    const hasThreeDays = rows.some(r => r.action === '3_days_ago_action');
    const hasSixDays = rows.some(r => r.action === '6_days_ago_action');
    const hasTrigger = rows.some(r => r.action === 'trigger_cleanup_action');

    console.log(`\nToday's log exists (expected: true): ${hasToday ? '✅ true' : '❌ false'}`);
    console.log(`Trigger log exists (expected: true): ${hasTrigger ? '✅ true' : '❌ false'}`);
    console.log(`3-day old log exists (expected: true): ${hasThreeDays ? '✅ true' : '❌ false'}`);
    console.log(`6-day old log exists (expected: false): ${!hasSixDays ? '✅ false' : '❌ true'}`);

    if (hasToday && hasTrigger && hasThreeDays && !hasSixDays) {
      console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! Cleanup logic works perfectly!');
    } else {
      console.error('\n❌ SOME TESTS FAILED! Check the logic.');
    }

  } catch (err) {
    console.error('❌ Error during tests:', err);
  } finally {
    // Cleanup
    console.log('\n--- Cleaning Up ---');
    if (companyId) {
      await client.query('DELETE FROM companies WHERE id = $1', [companyId]);
      console.log(`✅ Deleted test company (ID: ${companyId}) and cascaded related rows`);
    }
    client.release();
    pool.end();
    console.log('--- Tests Complete ---');
  }
}

testAuditCleanup();
