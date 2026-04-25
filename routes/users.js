const pool = require('../db');
const { authorize } = require('../middleware/authorize');
const authenticate = require('../middleware/authenticate');

async function userRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);

  // List all users in the same company
  fastify.get('/', { preHandler: [authorize('user:view')] }, async (req, reply) => {
    const { companyId } = req.session;
    const result = await pool.query(
      'SELECT id, name, email, role, avatar_url, is_verified, invite_accepted, created_at FROM users WHERE company_id = $1 ORDER BY created_at DESC',
      [companyId]
    );
    return result.rows;
  });

  // Update user
  fastify.patch('/:id', { preHandler: [authorize('audit:view')] }, async (req, reply) => {
    const { id } = req.params;
    const { name, email, role } = req.body;
    const { companyId } = req.session;

    // Check if user belongs to the same company
    const check = await pool.query('SELECT company_id FROM users WHERE id = $1', [id]);
    if (check.rows.length === 0 || check.rows[0].company_id !== companyId) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const result = await pool.query(
      'UPDATE users SET name = COALESCE($1, name), email = COALESCE($2, email), role = COALESCE($3, role) WHERE id = $4 RETURNING *',
      [name, email, role, id]
    );

    // Log the action
    await pool.query(
      'INSERT INTO audit_log (company_id, user_id, entity_type, entity_id, action, changes) VALUES ($1, $2, $3, $4, $5, $6)',
      [companyId, req.session.userId, 'user', id, 'updated', JSON.stringify(req.body)]
    );

    return result.rows[0];
  });

  // Delete user
  fastify.delete('/:id', { preHandler: [authorize('audit:view')] }, async (req, reply) => {
    const { id } = req.params;
    const { companyId, userId } = req.session;

    if (id === userId) {
      return reply.code(400).send({ error: 'Cannot delete yourself' });
    }

    // Check if user belongs to the same company
    const check = await pool.query('SELECT company_id FROM users WHERE id = $1', [id]);
    if (check.rows.length === 0 || check.rows[0].company_id !== companyId) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    await pool.query('DELETE FROM users WHERE id = $1', [id]);

    // Log the action
    await pool.query(
      'INSERT INTO audit_log (company_id, user_id, entity_type, entity_id, action) VALUES ($1, $2, $3, $4, $5)',
      [companyId, userId, 'user', id, 'deleted']
    );

    return { success: true };
  });
}

module.exports = userRoutes;
