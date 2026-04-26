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
  'audit:view': [ROLES.ADMIN, ROLES.PRODUCT_OWNER, ROLES.SCRUM_MASTER, ROLES.DEVELOPER, ROLES.STAKEHOLDER]
};

const checkPermission = (role, permission) => {
  if (!permissions[permission]) return false;
  return permissions[permission].includes(role);
};

const authorize = (permission) => {
  return async (req, reply) => {
    const { userRole } = req.session;
    if (!userRole) return reply.code(401).send({ error: 'Unauthorized' });
    
    if (!checkPermission(userRole, permission)) {
      return reply.code(403).send({ error: 'Forbidden: Insufficient permissions' });
    }
  };
};

module.exports = { ROLES, authorize, checkPermission };
