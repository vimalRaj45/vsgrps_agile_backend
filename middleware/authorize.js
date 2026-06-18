const pool = require('../db');

const ROLES = {
  ADMIN: 'Admin',
  PRODUCT_OWNER: 'Product Owner',
  SCRUM_MASTER: 'Scrum Master',
  DEVELOPER: 'Developer',
  STAKEHOLDER: 'Stakeholder'
};

const AVAILABLE_PERMISSIONS = [
  'dashboard:view', 'dashboard:create', 'dashboard:update', 'dashboard:delete',
  'project:view', 'project:create', 'project:update', 'project:delete',
  'task:view', 'task:create', 'task:update', 'task:delete', 'task:complete',
  'meeting:view', 'meeting:create', 'meeting:update', 'meeting:delete',
  'file:view', 'file:create', 'file:update', 'file:delete',
  'report:view', 'report:create', 'report:update', 'report:delete',
  'user:view', 'user:create', 'user:update', 'user:delete', 'user:invite',
  'audit:view', 'audit:create', 'audit:update', 'audit:delete',
  'role:view', 'role:create', 'role:update', 'role:delete', 'role:manage',
  'settings:view', 'settings:create', 'settings:update', 'settings:delete', 'settings:manage',
  'system:view', 'system:create', 'system:update', 'system:delete', 'system:broadcast', 'system:backup',
  'link:view', 'link:create', 'link:update', 'link:delete'
];

const checkPermission = async (companyId, role, permission) => {
  try {
    const trimmedRole = role ? role.trim().toLowerCase() : '';
    
    // Admin always has full access
    if (trimmedRole === 'admin') {
      return true;
    }

    // Check database for role permissions
    const { rows } = await pool.query(`
      SELECT rp.permission_key 
      FROM custom_roles cr
      JOIN role_permissions rp ON cr.id = rp.role_id
      WHERE cr.company_id = $1 AND LOWER(cr.name) = $2
    `, [companyId, trimmedRole]);

    const userPermissions = rows.map(r => r.permission_key);
    
    for (const userPerm of userPermissions) {
      if (userPerm === '*' || userPerm === permission) {
        return true;
      }
      if (userPerm.endsWith(':*')) {
        const prefix = userPerm.slice(0, -1); // e.g. 'project:'
        if (permission.startsWith(prefix)) {
          return true;
        }
      }
    }

    return false;
  } catch (err) {
    console.error('Permission check error:', err);
    return false;
  }
};

const authorize = (permission) => {
  return async (req, reply) => {
    const { userRole, companyId } = req.user;
    console.log(`[AUTH] Checking "${permission}" for role "${userRole}" (Company: ${companyId})`);
    
    if (!userRole) return reply.code(401).send({ error: 'Unauthorized' });
    
    const hasPermission = await checkPermission(companyId, userRole, permission);
    console.log(`[AUTH] Result for "${permission}": ${hasPermission}`);
    
    if (!hasPermission) {
      return reply.code(403).send({ error: 'Forbidden: Insufficient permissions' });
    }
  };
};

module.exports = { ROLES, authorize, checkPermission, AVAILABLE_PERMISSIONS };
