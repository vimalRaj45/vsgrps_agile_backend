const pool = require('../db');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');

async function projectRoutes(fastify, options) {
  fastify.addHook('preHandler', authenticate);

  // GET /projects
  fastify.get('/', async (req, reply) => {
    const { archived = 'false' } = req.query;
    const { rows } = await pool.query(
      `SELECT p.*, 
       (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as total_tasks,
       (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND status = 'Done') as done_tasks
       FROM projects p 
       WHERE p.company_id = $1 AND p.archived = $2 
       ORDER BY p.pinned DESC, p.created_at DESC`,
      [req.session.companyId, archived === 'true']
    );
    return rows;
  });

  // GET /projects/:id
  fastify.get('/:id', async (req, reply) => {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT * FROM projects WHERE id = $1 AND company_id = $2', [id, req.session.companyId]);
    if (rows.length === 0) return reply.code(404).send({ error: 'Project not found' });
    return rows[0];
  });

  // Helper to calculate total organizational storage (Rows + Files)
  const getTotalStorage = async (companyId) => {
    try {
      const { rows } = await pool.query(`
        SELECT (
          COALESCE((SELECT SUM(pg_column_size(c)) FROM companies c WHERE id = $1), 0) +
          COALESCE((SELECT SUM(pg_column_size(u)) FROM users u WHERE company_id = $1), 0) +
          COALESCE((SELECT SUM(pg_column_size(i)) FROM invites i WHERE company_id = $1), 0) +
          COALESCE((SELECT SUM(pg_column_size(p)) FROM projects p WHERE company_id = $1), 0) +
          COALESCE((SELECT SUM(pg_column_size(pm)) FROM project_members pm WHERE project_id IN (SELECT id FROM projects WHERE company_id = $1)), 0) +
          COALESCE((SELECT SUM(pg_column_size(t)) FROM tasks t WHERE company_id = $1), 0) +
          COALESCE((SELECT SUM(pg_column_size(st)) FROM subtasks st WHERE task_id IN (SELECT id FROM tasks WHERE company_id = $1)), 0) +
          COALESCE((SELECT SUM(pg_column_size(tl)) FROM task_labels tl WHERE company_id = $1), 0) +
          COALESCE((SELECT SUM(pg_column_size(tla)) FROM task_label_assignments tla WHERE task_id IN (SELECT id FROM tasks WHERE company_id = $1)), 0) +
          COALESCE((SELECT SUM(pg_column_size(tc)) FROM task_comments tc WHERE task_id IN (SELECT id FROM tasks WHERE company_id = $1)), 0) +
          COALESCE((SELECT SUM(pg_column_size(m)) FROM meetings m WHERE company_id = $1), 0) +
          COALESCE((SELECT SUM(pg_column_size(ma)) FROM meeting_attendees ma WHERE meeting_id IN (SELECT id FROM meetings WHERE company_id = $1)), 0) +
          COALESCE((SELECT SUM(pg_column_size(mn)) FROM meeting_notes mn WHERE meeting_id IN (SELECT id FROM meetings WHERE company_id = $1)), 0) +
          COALESCE((SELECT SUM(pg_column_size(f)) FROM files f WHERE company_id = $1), 0) +
          COALESCE((SELECT SUM(pg_column_size(l)) FROM links l WHERE company_id = $1), 0) +
          COALESCE((SELECT SUM(pg_column_size(n)) FROM notifications n WHERE company_id = $1), 0) +
          COALESCE((SELECT SUM(pg_column_size(al)) FROM audit_log al WHERE company_id = $1), 0)
        ) as total_bytes
      `, [companyId]);
      return parseInt(rows[0].total_bytes || 0);
    } catch (err) {
      console.error('Storage calculation error:', err);
      return 0;
    }
  };

  // POST /projects
  fastify.post('/', { preHandler: [authorize('project:create')] }, async (req, reply) => {
    // Check Global storage quota (10MB)
    const LIMIT = 10 * 1024 * 1024;
    const currentTotal = await getTotalStorage(req.session.companyId);
    if (currentTotal > LIMIT) {
      return reply.code(400).send({ error: 'Organizational storage limit reached (20MB). Please contact VSGRPS to upgrade your limits.' });
    }

    const { name, description, cover_color, cover_icon } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO projects (company_id, name, description, cover_color, cover_icon, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [req.session.companyId, name, description, cover_color || '#1976d2', cover_icon || 'folder', req.session.userId]
    );
    
    // Audit log
    await pool.query(
      'INSERT INTO audit_log (company_id, user_id, entity_type, entity_id, action, changes) VALUES ($1, $2, $3, $4, $5, $6)',
      [req.session.companyId, req.session.userId, 'project', rows[0].id, 'created', JSON.stringify(rows[0])]
    );

    return rows[0];
  });

  // PATCH /projects/:id
  fastify.patch('/:id', { preHandler: [authorize('project:update')] }, async (req, reply) => {
    const { id } = req.params;
    const updates = req.body;
    const { companyId, userId } = req.session;

    if (!companyId) return reply.code(401).send({ error: 'Session expired' });

    const fields = Object.keys(updates);
    if (fields.length === 0) return reply.code(400).send({ error: 'No updates provided' });

    const setClause = fields.map((f, i) => `${f} = $${i + 3}`).join(', ');
    const values = [id, companyId, ...Object.values(updates)];

    try {
      const { rows } = await pool.query(
        `UPDATE projects SET ${setClause} WHERE id = $1 AND company_id = $2 RETURNING *`,
        values
      );

      if (rows.length === 0) return reply.code(404).send({ error: 'Project not found' });

      // Audit log
      await pool.query(
        'INSERT INTO audit_log (company_id, user_id, entity_type, entity_id, action, changes) VALUES ($1, $2, $3, $4, $5, $6)',
        [companyId, userId, 'project', id, 'updated', JSON.stringify(updates)]
      );

      return rows[0];
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Failed to update project: ' + err.message });
    }
  });

  // GET /projects/:id/members
  fastify.get('/:id/members', async (req, reply) => {
    try {
      const { id } = req.params;
      const { rows } = await pool.query(
        `SELECT u.id, u.name, u.email, u.role, u.avatar_url 
         FROM project_members pm 
         JOIN users u ON pm.user_id = u.id 
         WHERE pm.project_id = $1`,
        [id]
      );
      return rows;
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Failed to fetch project members' });
    }
  });

  // POST /projects/:id/members
  fastify.post('/:id/members', { preHandler: [authorize('project:update')] }, async (req, reply) => {
    try {
      const { id } = req.params;
      const { user_id } = req.body;

      if (!id || !user_id) {
        return reply.code(400).send({ error: 'Project ID and User ID are required' });
      }

      await pool.query('INSERT INTO project_members (project_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, user_id]);
      
      // Audit log
      await pool.query(
        'INSERT INTO audit_log (company_id, user_id, entity_type, entity_id, action, changes) VALUES ($1, $2, $3, $4, $5, $6)',
        [req.session.companyId, req.session.userId, 'project_member', id, 'added', JSON.stringify({ user_id })]
      );

      return { success: true };
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Failed to add project member' });
    }
  });

  // DELETE /projects/:id/members/:userId
  fastify.delete('/:id/members/:userId', { preHandler: [authorize('project:update')] }, async (req, reply) => {
    const { id, userId } = req.params;
    await pool.query('DELETE FROM project_members WHERE project_id = $1 AND user_id = $2', [id, userId]);

    // Audit log
    await pool.query(
      'INSERT INTO audit_log (company_id, user_id, entity_type, entity_id, action, changes) VALUES ($1, $2, $3, $4, $5, $6)',
      [req.session.companyId, req.session.userId, 'project_member', id, 'removed', JSON.stringify({ user_id: userId })]
    );

    return { success: true };
  });

  // DELETE /projects/:id
  fastify.delete('/:id', { preHandler: [authorize('project:delete')] }, async (req, reply) => {
    const { id } = req.params;
    const { companyId, userId } = req.session;

    const dbClient = await pool.connect();
    try {
      await dbClient.query('BEGIN');

      // 1. Get project details for audit log before deletion
      const projectRes = await dbClient.query('SELECT * FROM projects WHERE id = $1 AND company_id = $2', [id, companyId]);
      if (projectRes.rows.length === 0) {
        await dbClient.query('ROLLBACK');
        return reply.code(404).send({ error: 'Project not found' });
      }

      const project = projectRes.rows[0];

      // 2. Cascade delete related entities manually to avoid FK constraint violations
      // Delete task-related items
      await dbClient.query('DELETE FROM subtasks WHERE task_id IN (SELECT id FROM tasks WHERE project_id = $1)', [id]);
      await dbClient.query('DELETE FROM task_comments WHERE task_id IN (SELECT id FROM tasks WHERE project_id = $1)', [id]);
      await dbClient.query('DELETE FROM task_label_assignments WHERE task_id IN (SELECT id FROM tasks WHERE project_id = $1)', [id]);
      await dbClient.query('DELETE FROM tasks WHERE project_id = $1', [id]);

      // Delete meeting-related items
      await dbClient.query('DELETE FROM meeting_attendees WHERE meeting_id IN (SELECT id FROM meetings WHERE project_id = $1)', [id]);
      await dbClient.query('DELETE FROM meeting_notes WHERE meeting_id IN (SELECT id FROM meetings WHERE project_id = $1)', [id]);
      await dbClient.query('DELETE FROM meetings WHERE project_id = $1', [id]);

      // Delete project members and files
      await dbClient.query('DELETE FROM project_members WHERE project_id = $1', [id]);
      await dbClient.query('DELETE FROM files WHERE project_id = $1', [id]);

      // 3. Delete the project itself
      await dbClient.query('DELETE FROM projects WHERE id = $1 AND company_id = $2', [id, companyId]);

      // 4. Audit log
      await dbClient.query(
        'INSERT INTO audit_log (company_id, user_id, entity_type, entity_id, action, changes) VALUES ($1, $2, $3, $4, $5, $6)',
        [companyId, userId, 'project', id, 'deleted', JSON.stringify(project)]
      );

      await dbClient.query('COMMIT');
      return { success: true };
    } catch (err) {
      await dbClient.query('ROLLBACK');
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Failed to delete project due to a database error.' });
    } finally {
      dbClient.release();
    }
  });
}

module.exports = projectRoutes;
