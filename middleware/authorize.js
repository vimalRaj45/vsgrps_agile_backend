const pool = require('../db');

const ROLES = {
  ADMIN: 'Admin',
  PRODUCT_OWNER: 'Product Owner',
  SCRUM_MASTER: 'Scrum Master',
  DEVELOPER: 'Developer',
  STAKEHOLDER: 'Stakeholder'
};

const permissions = {
  // Projects
  'project:create': [ROLES.ADMIN, ROLES.PRODUCT_OWNER],
  'project:update': [ROLES.ADMIN, ROLES.PRODUCT_OWNER],
  'project:delete': [ROLES.ADMIN, ROLES.PRODUCT_OWNER],
  'project:view': [ROLES.ADMIN, ROLES.PRODUCT_OWNER, ROLES.SCRUM_MASTER, ROLES.DEVELOPER, ROLES.STAKEHOLDER],

  // Tasks
  'task:create': [ROLES.ADMIN, ROLES.PRODUCT_OWNER, ROLES.SCRUM_MASTER],
  'task:update': [ROLES.ADMIN, ROLES.PRODUCT_OWNER, ROLES.SCRUM_MASTER, ROLES.DEVELOPER],
  'task:delete': [ROLES.ADMIN, ROLES.PRODUCT_OWNER],
  'task:view': [ROLES.ADMIN, ROLES.PRODUCT_OWNER, ROLES.SCRUM_MASTER, ROLES.DEVELOPER, ROLES.STAKEHOLDER],

  // Meetings
  'meeting:create': [ROLES.ADMIN, ROLES.PRODUCT_OWNER, ROLES.SCRUM_MASTER],
  'meeting:update': [ROLES.ADMIN, ROLES.PRODUCT_OWNER, ROLES.SCRUM_MASTER],
  'meeting:delete': [ROLES.ADMIN],
  'meeting:view': [ROLES.ADMIN, ROLES.PRODUCT_OWNER, ROLES.SCRUM_MASTER, ROLES.DEVELOPER, ROLES.STAKEHOLDER],

  // Admin Only
  'user:invite': [ROLES.ADMIN],
  'user:view': [ROLES.ADMIN, ROLES.PRODUCT_OWNER, ROLES.SCRUM_MASTER, ROLES.DEVELOPER, ROLES.STAKEHOLDER],
  'audit:view': [ROLES.ADMIN, ROLES.PRODUCT_OWNER, ROLES.SCRUM_MASTER, ROLES.DEVELOPER, ROLES.STAKEHOLDER],
  'role:manage': [ROLES.ADMIN]
};

const checkPermission = async (companyId, role, permission) => {
  try {
    const trimmedRole = role ? role.trim().toLowerCase() : '';
    // 1. Check database for custom role permissions (case-insensitive)
    const { rows } = await pool.query(`
      SELECT rp.permission_key 
      FROM custom_roles cr
      JOIN role_permissions rp ON cr.id = rp.role_id
      WHERE cr.company_id = $1 AND LOWER(cr.name) = $2 AND rp.permission_key = $3
    `, [companyId, trimmedRole, permission]);

    if (rows.length > 0) return true;

    // 2. Fallback to hardcoded system permissions (case-insensitive)
    if (permissions[permission]) {
      const allowedRoles = permissions[permission].map(r => r.toLowerCase());
      if (allowedRoles.includes(trimmedRole)) {
        return true;
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

module.exports = { ROLES, authorize, checkPermission, AVAILABLE_PERMISSIONS: Object.keys(permissions) };
