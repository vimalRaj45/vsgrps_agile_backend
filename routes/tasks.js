const pool = require('../db');
const authenticate = require('../middleware/authenticate');
const { authorize, ROLES } = require('../middleware/authorize');

async function taskRoutes(fastify, options) {
  fastify.addHook('preHandler', authenticate);

  // GET /tasks
  fastify.get('/', async (req, reply) => {
    const { status, priority, assigned_to, project_id } = req.query;
    let query = 'SELECT t.*, u.name as assignee_name, p.name as project_name FROM tasks t LEFT JOIN users u ON t.assigned_to = u.id LEFT JOIN projects p ON t.project_id = p.id WHERE t.company_id = $1';
    const params = [req.session.companyId];

    if (status) {
      params.push(status);
      query += ` AND t.status = $${params.length}`;
    }
    if (priority) {
      params.push(priority);
      query += ` AND t.priority = $${params.length}`;
    }
    if (assigned_to) {
      params.push(assigned_to);
      query += ` AND t.assigned_to = $${params.length}`;
    }
    if (project_id) {
      params.push(project_id);
      query += ` AND t.project_id = $${params.length}`;
    }

    query += ' ORDER BY t.created_at DESC';
    const { rows } = await pool.query(query, params);
    return rows;
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

  // POST /tasks
  fastify.post('/', { preHandler: [authorize('task:create')] }, async (req, reply) => {
    // Check Global storage quota (10MB)
    const LIMIT = 10 * 1024 * 1024;
    const currentTotal = await getTotalStorage(req.session.companyId);
    if (currentTotal > LIMIT) {
      return reply.code(400).send({ error: 'Organizational storage limit reached (20MB). Please contact VSGRPS to upgrade your limits.' });
    }

    const { project_id, title, description, status, priority, assigned_to, due_date } = req.body;
    const finalAssignedTo = assigned_to === '' ? null : assigned_to;
    const { rows } = await pool.query(
      'INSERT INTO tasks (company_id, project_id, title, description, status, priority, assigned_to, due_date, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
      [req.session.companyId, project_id, title, description, status || 'To Do', priority || 'Medium', finalAssignedTo, due_date, req.session.userId]
    );

    // Audit log
    await pool.query(
      'INSERT INTO audit_log (company_id, user_id, entity_type, entity_id, action, changes) VALUES ($1, $2, $3, $4, $5, $6)',
      [req.session.companyId, req.session.userId, 'task', rows[0].id, 'created', JSON.stringify(rows[0])]
    );

    // Notification if assigned
    if (assigned_to) {
      await pool.query(
        'INSERT INTO notifications (company_id, user_id, type, message, link) VALUES ($1, $2, $3, $4, $5)',
        [req.session.companyId, assigned_to, 'task_assigned', `You have been assigned: ${title}`, `/tasks?id=${rows[0].id}`]
      );
    }

    return rows[0];
  });

  // PATCH /tasks/:id
  fastify.patch('/:id', { preHandler: [authorize('task:update')] }, async (req, reply) => {
    const { id } = req.params;
    const updates = req.body;
    
    // Agile Master Enforcements:
    const isPrivileged = [ROLES.ADMIN, ROLES.PRODUCT_OWNER, ROLES.SCRUM_MASTER].includes(req.session.userRole);
    const coreFields = ['title', 'description', 'due_date', 'priority', 'project_id', 'assigned_to'];
    const attemptedCoreUpdate = Object.keys(updates).some(f => coreFields.includes(f));

    if (attemptedCoreUpdate && !isPrivileged) {
      return reply.code(403).send({ error: 'Only Administrators, Product Owners, or Scrum Masters can modify core task details.' });
    }

    // Workflow Restriction: Only Admins can mark tasks as 'Done'
    if (updates.status === 'Done' && req.session.userRole !== ROLES.ADMIN) {
      return reply.code(403).send({ error: 'Task completion (Done) must be verified by an Administrator.' });
    }

    // Verify assigned user for status updates
    if (!isPrivileged && updates.status) {
      const taskCheck = await pool.query('SELECT assigned_to FROM tasks WHERE id = $1', [id]);
      if (taskCheck.rows.length === 0 || taskCheck.rows[0].assigned_to !== req.session.userId) {
        return reply.code(403).send({ error: 'You can only update the status of tasks assigned to you.' });
      }
    }

    const fields = Object.keys(updates);
    if (fields.length === 0) return reply.code(400).send({ error: 'No updates provided' });

    // SQL Injection Protection: Whitelist field names
    const allowedFields = ['title', 'description', 'status', 'priority', 'assigned_to', 'due_date', 'project_id'];
    const forbiddenFields = fields.filter(f => !allowedFields.includes(f));
    
    if (forbiddenFields.length > 0) {
      return reply.code(400).send({ error: `Invalid update fields: ${forbiddenFields.join(', ')}` });
    }

    const setClause = fields.map((f, i) => `"${f}" = $${i + 2}`).join(', ');
    const values = [id, ...Object.values(updates)];

    const { rows } = await pool.query(
      `UPDATE tasks SET ${setClause}, updated_at = NOW() WHERE id = $1 AND company_id = $${fields.length + 2} RETURNING *`,
      [...values, req.session.companyId]
    );

    if (rows.length === 0) return reply.code(404).send({ error: 'Task not found' });

    // Audit log
    await pool.query(
      'INSERT INTO audit_log (company_id, user_id, entity_type, entity_id, action, changes) VALUES ($1, $2, $3, $4, $5, $6)',
      [req.session.companyId, req.session.userId, 'task', id, 'updated', JSON.stringify(updates)]
    );

    return rows[0];
  });

  // GET /tasks/:id/comments
  fastify.get('/:id/comments', async (req, reply) => {
    const { id } = req.params;
    const { rows } = await pool.query(
      'SELECT tc.*, u.name as user_name, u.avatar_url FROM task_comments tc JOIN users u ON tc.user_id = u.id WHERE tc.task_id = $1 ORDER BY tc.created_at ASC',
      [id]
    );
    return rows;
  });

  // POST /tasks/:id/comments
  fastify.post('/:id/comments', async (req, reply) => {
    const { id } = req.params;
    const { content } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO task_comments (task_id, user_id, content) VALUES ($1, $2, $3) RETURNING *',
      [id, req.session.userId, content]
    );

    // Audit log
    await pool.query(
      'INSERT INTO audit_log (company_id, user_id, entity_type, entity_id, action, changes) VALUES ($1, $2, $3, $4, $5, $6)',
      [req.session.companyId, req.session.userId, 'comment', rows[0].id, 'created', JSON.stringify({ task_id: id, content: content.substring(0, 50) })]
    );

    // Parse mentions (@username_with_underscores)
    const mentions = content.match(/@([\w_]+)/g);
    if (mentions) {
      const { sendPushNotification } = require('../utils/push');
      for (const m of mentions) {
        const username = m.substring(1);
        const userRes = await pool.query("SELECT id FROM users WHERE REPLACE(name, ' ', '_') = $1 AND company_id = $2", [username, req.session.companyId]);
        if (userRes.rows.length > 0) {
          const mentionedId = userRes.rows[0].id;
          await pool.query(
            'INSERT INTO notifications (company_id, user_id, type, message, link) VALUES ($1, $2, $3, $4, $5)',
            [req.session.companyId, mentionedId, 'mention', `${req.session.userRole} mentioned you in a comment.`, `/tasks?id=${id}`]
          );
          
          await sendPushNotification(mentionedId, {
            title: 'New Mention',
            body: `${req.session.userRole} mentioned you in a comment.`,
            icon: '/logo192.png',
            data: { url: `/tasks?id=${id}` }
          });
        }
      }
    }

    return rows[0];
  });

  // GET /tasks/:id/subtasks
  fastify.get('/:id/subtasks', async (req, reply) => {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT * FROM subtasks WHERE task_id = $1 ORDER BY created_at ASC', [id]);
    return rows;
  });

  // POST /tasks/:id/subtasks
  fastify.post('/:id/subtasks', async (req, reply) => {
    const { id } = req.params;
    const { title } = req.body;
    const { rows } = await pool.query('INSERT INTO subtasks (task_id, title) VALUES ($1, $2) RETURNING *', [id, title]);
    
    // Audit log
    await pool.query(
      'INSERT INTO audit_log (company_id, user_id, entity_type, entity_id, action, changes) VALUES ($1, $2, $3, $4, $5, $6)',
      [req.session.companyId, req.session.userId, 'subtask', rows[0].id, 'created', JSON.stringify({ task_id: id, title })]
    );

    return rows[0];
  });

  // PATCH /subtasks/:id
  fastify.patch('/subtasks/:subtaskId', async (req, reply) => {
    const { subtaskId } = req.params;
    const { completed } = req.body;
    const { rows } = await pool.query('UPDATE subtasks SET completed = $1 WHERE id = $2 RETURNING *', [completed, subtaskId]);
    
    // Audit log
    await pool.query(
      'INSERT INTO audit_log (company_id, user_id, entity_type, entity_id, action, changes) VALUES ($1, $2, $3, $4, $5, $6)',
      [req.session.companyId, req.session.userId, 'subtask', subtaskId, 'updated', JSON.stringify({ completed })]
    );

    return rows[0];
  });

  // DELETE /subtasks/:id
  fastify.delete('/subtasks/:subtaskId', { preHandler: [authorize('task:update')] }, async (req, reply) => {
    const { subtaskId } = req.params;
    
    // RBAC: Only Admin, PO, or SM can delete subtasks
    const isPrivileged = [ROLES.ADMIN, ROLES.PRODUCT_OWNER, ROLES.SCRUM_MASTER].includes(req.session.userRole);
    if (!isPrivileged) {
      return reply.code(403).send({ error: 'You do not have permission to delete subtasks.' });
    }

    const { rows } = await pool.query('DELETE FROM subtasks WHERE id = $1 RETURNING *', [subtaskId]);
    
    if (rows.length === 0) return reply.code(404).send({ error: 'Subtask not found' });

    // Audit log
    await pool.query(
      'INSERT INTO audit_log (company_id, user_id, entity_type, entity_id, action, changes) VALUES ($1, $2, $3, $4, $5, $6)',
      [req.session.companyId, req.session.userId, 'subtask', subtaskId, 'deleted', JSON.stringify(rows[0])]
    );

    return { success: true };
  });

  // GET /labels
  fastify.get('/labels', async (req, reply) => {
    const { rows } = await pool.query('SELECT * FROM task_labels WHERE company_id = $1', [req.session.companyId]);
    return rows;
  });

  // POST /labels
  fastify.post('/labels', async (req, reply) => {
    const { name, color, project_id } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO task_labels (company_id, project_id, name, color) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.session.companyId, project_id, name, color]
    );

    // Audit log
    await pool.query(
      'INSERT INTO audit_log (company_id, user_id, entity_type, entity_id, action, changes) VALUES ($1, $2, $3, $4, $5, $6)',
      [req.session.companyId, req.session.userId, 'label', rows[0].id, 'created', JSON.stringify({ name, color })]
    );

    return rows[0];
  });

  // POST /tasks/:id/labels/:labelId
  fastify.post('/:id/labels/:labelId', async (req, reply) => {
    const { id, labelId } = req.params;
    await pool.query('INSERT INTO task_label_assignments (task_id, label_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, labelId]);
    
    // Audit log
    await pool.query(
      'INSERT INTO audit_log (company_id, user_id, entity_type, entity_id, action, changes) VALUES ($1, $2, $3, $4, $5, $6)',
      [req.session.companyId, req.session.userId, 'label_assignment', id, 'added', JSON.stringify({ label_id: labelId })]
    );

    return { success: true };
  });
  
  // DELETE /tasks/:id
  fastify.delete('/:id', async (req, reply) => {
    if (req.session.userRole !== 'Admin') {
      return reply.code(403).send({ error: 'Only Administrators can delete tasks.' });
    }
    
    const { id } = req.params;
    
    // Get task before delete for audit log
    const taskRes = await pool.query('SELECT * FROM tasks WHERE id = $1 AND company_id = $2', [id, req.session.companyId]);
    if (taskRes.rows.length === 0) return reply.code(404).send({ error: 'Task not found' });
    
    await pool.query('DELETE FROM tasks WHERE id = $1 AND company_id = $2', [id, req.session.companyId]);
    
    // Audit log
    await pool.query(
      'INSERT INTO audit_log (company_id, user_id, entity_type, entity_id, action, changes) VALUES ($1, $2, $3, $4, $5, $6)',
      [req.session.companyId, req.session.userId, 'task', id, 'deleted', JSON.stringify(taskRes.rows[0])]
    );
    
    return { success: true };
  });
}

module.exports = taskRoutes;
