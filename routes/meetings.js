const pool = require('../db');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');

async function meetingRoutes(fastify, options) {
  fastify.addHook('preHandler', authenticate);

  // GET /meetings
  fastify.get('/', async (req, reply) => {
    const { project_id } = req.query;
    let query = 'SELECT m.*, p.name as project_name FROM meetings m LEFT JOIN projects p ON m.project_id = p.id WHERE m.company_id = $1';
    const params = [req.session.companyId];

    if (project_id) {
      params.push(project_id);
      query += ` AND m.project_id = $${params.length}`;
    }

    query += ' ORDER BY m.scheduled_at DESC';
    const { rows } = await pool.query(query, params);
    return rows;
  });

  // GET /meetings/:id
  fastify.get('/:id', async (req, reply) => {
    const { id } = req.params;
    const { rows } = await pool.query(
      'SELECT m.*, p.name as project_name FROM meetings m LEFT JOIN projects p ON m.project_id = p.id WHERE m.id = $1 AND m.company_id = $2',
      [id, req.session.companyId]
    );
    if (rows.length === 0) return reply.code(404).send({ error: 'Meeting not found' });
    
    const attendees = await pool.query(
      'SELECT u.id, u.name, u.email, u.avatar_url FROM meeting_attendees ma JOIN users u ON ma.user_id = u.id WHERE ma.meeting_id = $1',
      [id]
    );
    
    return { ...rows[0], attendees: attendees.rows };
  });

  // POST /meetings
  fastify.post('/', { preHandler: [authorize('meeting:create')] }, async (req, reply) => {
    const { project_id, title, scheduled_at, agenda, attendees, meeting_link, outcome } = req.body;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query(
        'INSERT INTO meetings (company_id, project_id, title, scheduled_at, agenda, created_by, meeting_link, outcome) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
        [req.session.companyId, project_id, title, scheduled_at, agenda, req.session.userId, meeting_link, outcome]
      );
      const meeting = res.rows[0];

      if (attendees && attendees.length > 0) {
        for (const userId of attendees) {
          await client.query('INSERT INTO meeting_attendees (meeting_id, user_id) VALUES ($1, $2)', [meeting.id, userId]);
          await client.query(
            'INSERT INTO notifications (company_id, user_id, type, message, link) VALUES ($1, $2, $3, $4, $5)',
            [req.session.companyId, userId, 'meeting_added', `You have been added to meeting: ${title}`, `/meetings/${meeting.id}`]
          );
        }
      }

      await client.query('COMMIT');

      // Audit log
      await pool.query(
        'INSERT INTO audit_log (company_id, user_id, entity_type, entity_id, action, changes) VALUES ($1, $2, $3, $4, $5, $6)',
        [req.session.companyId, req.session.userId, 'meeting', meeting.id, 'created', JSON.stringify({ title, scheduled_at })]
      );

      return meeting;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  // PATCH /meetings/:id
  fastify.patch('/:id', { preHandler: [authorize('meeting:update')] }, async (req, reply) => {
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
        `UPDATE meetings SET ${setClause} WHERE id = $1 AND company_id = $2 RETURNING *`,
        values
      );

      if (rows.length === 0) return reply.code(404).send({ error: 'Meeting not found' });

      // Audit log
      await pool.query(
        'INSERT INTO audit_log (company_id, user_id, entity_type, entity_id, action, changes) VALUES ($1, $2, $3, $4, $5, $6)',
        [companyId, userId, 'meeting', id, 'updated', JSON.stringify(updates)]
      );

      return rows[0];
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Database update failed' });
    }
  });

  // GET /meetings/:id/notes
  fastify.get('/:id/notes', async (req, reply) => {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT * FROM meeting_notes WHERE meeting_id = $1 ORDER BY created_at ASC', [id]);
    return rows;
  });

  // POST /meetings/:id/notes
  fastify.post('/:id/notes', async (req, reply) => {
    const { id } = req.params;
    const { section, content, due_date, assigned_to } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO meeting_notes (meeting_id, section, content, due_date, assigned_to) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [id, section, content, due_date, assigned_to]
    );

    // Audit log
    await pool.query(
      'INSERT INTO audit_log (company_id, user_id, entity_type, entity_id, action, changes) VALUES ($1, $2, $3, $4, $5, $6)',
      [req.session.companyId, req.session.userId, 'meeting_note', id, 'created', JSON.stringify({ section, content: content.substring(0, 50) })]
    );

    return rows[0];
  });

  // PATCH /notes/:id
  fastify.patch('/notes/:id', async (req, reply) => {
    const { id } = req.params;
    const { converted_to_task } = req.body;
    const { rows } = await pool.query('UPDATE meeting_notes SET converted_to_task = $1 WHERE id = $2 RETURNING *', [converted_to_task, id]);
    return rows[0];
  });
}

module.exports = meetingRoutes;
