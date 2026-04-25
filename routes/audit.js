const pool = require('../db');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');

async function auditRoutes(fastify, options) {
  fastify.addHook('preHandler', authenticate);

  // GET /audit
  fastify.get('/', { preHandler: [authorize('audit:view')] }, async (req, reply) => {
    const { entity_type, entity_id } = req.query;
    let query = 'SELECT a.*, u.name as user_name FROM audit_log a LEFT JOIN users u ON a.user_id = u.id WHERE a.company_id = $1';
    const params = [req.session.companyId];

    if (entity_type) {
      params.push(entity_type);
      query += ` AND a.entity_type = $${params.length}`;
    }
    if (entity_id) {
      params.push(entity_id);
      query += ` AND a.entity_id = $${params.length}`;
    }

    query += ' ORDER BY a.created_at DESC LIMIT 100';
    const { rows } = await pool.query(query, params);
    return rows;
  });
}

module.exports = auditRoutes;
