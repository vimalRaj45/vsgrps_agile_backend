require('dotenv').config();
const pool = require('./db');
const { checkPermission, AVAILABLE_PERMISSIONS, ROLES } = require('./middleware/authorize');

async function testRBAC() {
  console.log('--- Starting RBAC Tests ---');
  let client = await pool.connect();
  let companyId = null;

  try {
    // 1. Setup Test Company
    const companyRes = await client.query('INSERT INTO companies (name) VALUES ($1) RETURNING id', ['RBAC Test Company']);
    companyId = companyRes.rows[0].id;
    console.log(`✅ Created test company (ID: ${companyId})`);

    // 2. Test Standard Roles (Hardcoded)
    console.log('\n--- Testing Standard Roles ---');
    
    // Admin should have project:create
    let hasPerm = await checkPermission(companyId, ROLES.ADMIN, 'project:create');
    console.log(`Admin project:create (expected: true): ${hasPerm ? '✅ true' : '❌ false'}`);

    // Developer should NOT have project:create
    hasPerm = await checkPermission(companyId, ROLES.DEVELOPER, 'project:create');
    console.log(`Developer project:create (expected: false): ${!hasPerm ? '✅ false' : '❌ true'}`);

    // Developer should have task:update
    hasPerm = await checkPermission(companyId, ROLES.DEVELOPER, 'task:update');
    console.log(`Developer task:update (expected: true): ${hasPerm ? '✅ true' : '❌ false'}`);

    // Stakeholder should have project:view (because it has '*')
    hasPerm = await checkPermission(companyId, ROLES.STAKEHOLDER, 'project:view');
    console.log(`Stakeholder project:view (expected: true): ${hasPerm ? '✅ true' : '❌ false'}`);

    // 3. Test Custom Role Creation
    console.log('\n--- Testing Custom Role Creation ---');
    
    // Create Custom Role "Project Manager"
    const customRoleRes = await client.query(
      'INSERT INTO custom_roles (company_id, name, description) VALUES ($1, $2, $3) RETURNING id',
      [companyId, 'Project Manager', 'Manages projects but not system settings']
    );
    const roleId = customRoleRes.rows[0].id;
    console.log(`✅ Created custom role "Project Manager" (ID: ${roleId})`);

    // Assign Permissions to Custom Role
    const permsToAssign = ['project:create', 'project:update', 'task:create'];
    for (const perm of permsToAssign) {
      await client.query(
        'INSERT INTO role_permissions (role_id, permission_key) VALUES ($1, $2)',
        [roleId, perm]
      );
    }
    console.log(`✅ Assigned permissions ${permsToAssign.join(', ')} to "Project Manager"`);

    // 4. Test Custom Role Permissions
    console.log('\n--- Testing Custom Role Permissions ---');
    
    // Project Manager should have project:create
    hasPerm = await checkPermission(companyId, 'Project Manager', 'project:create');
    console.log(`Project Manager project:create (expected: true): ${hasPerm ? '✅ true' : '❌ false'}`);

    // Project Manager should have task:create
    hasPerm = await checkPermission(companyId, 'Project Manager', 'task:create');
    console.log(`Project Manager task:create (expected: true): ${hasPerm ? '✅ true' : '❌ false'}`);

    // Project Manager should NOT have system:backup
    hasPerm = await checkPermission(companyId, 'Project Manager', 'system:backup');
    console.log(`Project Manager system:backup (expected: false): ${!hasPerm ? '✅ false' : '❌ true'}`);

    // Project Manager should have project:view (due to '*')
    hasPerm = await checkPermission(companyId, 'Project Manager', 'project:view');
    console.log(`Project Manager project:view (expected: true): ${hasPerm ? '✅ true' : '❌ false'}`);

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

testRBAC();
