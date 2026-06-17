const STANDARD_ROLES = [
  {
    name: 'Product Owner',
    description: 'Manages projects, backlog, and product vision.',
    permissions: [
      'dashboard:view',
      'project:view', 'project:create', 'project:update', 'project:delete',
      'task:view', 'task:create', 'task:update', 'task:delete',
      'meeting:view', 'meeting:create', 'meeting:update',
      'file:view', 'file:create', 'file:update',
      'report:view',
      'user:view', 'user:invite',
      'audit:view'
    ]
  },
  {
    name: 'Scrum Master',
    description: 'Facilitates agile processes and removes impediments.',
    permissions: [
      'dashboard:view',
      'project:view',
      'task:view', 'task:create', 'task:update',
      'meeting:view', 'meeting:create', 'meeting:update',
      'file:view', 'file:create', 'file:update',
      'report:view',
      'user:view',
      'audit:view'
    ]
  },
  {
    name: 'Developer',
    description: 'Builds and completes tasks.',
    permissions: [
      'dashboard:view',
      'project:view',
      'task:view', 'task:update',
      'meeting:view',
      'file:view', 'file:create',
      'user:view'
    ]
  },
  {
    name: 'Stakeholder',
    description: 'Views progress and reports, but does not modify.',
    permissions: [
      'dashboard:view',
      'project:view',
      'task:view',
      'meeting:view',
      'file:view',
      'report:view',
      'user:view'
    ]
  }
];

async function seedStandardRoles(client, companyId) {
  for (const role of STANDARD_ROLES) {
    const roleRes = await client.query(
      'INSERT INTO custom_roles (company_id, name, description, is_system) VALUES ($1, $2, $3, true) RETURNING id',
      [companyId, role.name, role.description]
    );
    const roleId = roleRes.rows[0].id;

    for (const perm of role.permissions) {
      await client.query(
        'INSERT INTO role_permissions (role_id, permission_key) VALUES ($1, $2)',
        [roleId, perm]
      );
    }
  }
}

async function getUserPermissions(pool, companyId, roleName) {
  if (!roleName) return [];
  const trimmedRole = roleName.trim().toLowerCase();
  
  if (trimmedRole === 'admin') {
    const { AVAILABLE_PERMISSIONS } = require('../middleware/authorize');
    return AVAILABLE_PERMISSIONS;
  }

  const { rows } = await pool.query(`
    SELECT rp.permission_key 
    FROM custom_roles cr
    JOIN role_permissions rp ON cr.id = rp.role_id
    WHERE cr.company_id = $1 AND LOWER(cr.name) = $2
  `, [companyId, trimmedRole]);

  return rows.map(r => r.permission_key);
}

module.exports = {
  STANDARD_ROLES,
  seedStandardRoles,
  getUserPermissions
};
