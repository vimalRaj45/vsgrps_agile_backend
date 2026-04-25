const pool = require('../db');
const authenticate = require('../middleware/authenticate');

async function fileRoutes(fastify, options) {
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
      return 0; // Fallback to 0 to prevent 500 errors
    }
  };

  fastify.addHook('preHandler', authenticate);

  // POST /files/upload
  fastify.post('/upload', async (req, reply) => {
    try {
      const data = await req.file();
      if (!data) return reply.code(400).send({ error: 'No file uploaded' });

      const { task_id, meeting_id, project_id } = data.fields;
      const fileContent = await data.toBuffer();
      const fileSize = fileContent.length;

      // Check Global storage quota (10MB)
      const LIMIT = 10 * 1024 * 1024;
      const currentTotal = await getTotalStorage(req.session.companyId);

      if (currentTotal + fileSize > LIMIT) {
        return reply.code(400).send({ error: 'Organizational storage limit reached (10MB). Please contact VSGRPS to upgrade your limits.' });
      }

      const is_private = data.fields.is_private?.value === 'true';
      const shared_with = data.fields.shared_with?.value ? data.fields.shared_with.value.split(',') : null;

      // Ensure UUIDs are valid or null
      const pid = project_id?.value && project_id.value !== 'null' && project_id.value !== '' ? project_id.value : null;
      const tid = task_id?.value && task_id.value !== 'null' && task_id.value !== '' ? task_id.value : null;
      const mid = meeting_id?.value && meeting_id.value !== 'null' && meeting_id.value !== '' ? meeting_id.value : null;

      const { rows } = await pool.query(
        'INSERT INTO files (company_id, project_id, task_id, meeting_id, uploaded_by, filename, mimetype, size, data, is_private, shared_with) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id, filename',
        [
          req.session.companyId, 
          pid, 
          tid, 
          mid, 
          req.session.userId, 
          data.filename, 
          data.mimetype, 
          fileSize, 
          fileContent,
          is_private,
          shared_with
        ]
      );

      // Audit log
      await pool.query(
        'INSERT INTO audit_log (company_id, user_id, entity_type, entity_id, action, changes) VALUES ($1, $2, $3, $4, $5, $6)',
        [req.session.companyId, req.session.userId, 'file', rows[0].id, 'uploaded', JSON.stringify({ filename: data.filename, size: fileSize })]
      );

      return rows[0];
    } catch (err) {
      console.error('Upload error:', err);
      return reply.code(500).send({ error: 'Failed to upload file. ' + err.message });
    }
  });

  // GET /files
  fastify.get('/', async (req, reply) => {
    try {
      const { project_id, task_id, meeting_id } = req.query;
      let query = `
        SELECT f.id, f.filename, f.mimetype, f.size, f.created_at, f.uploaded_by, 
               p.name as project_name, t.title as task_title, m.title as meeting_title 
        FROM files f 
        LEFT JOIN projects p ON f.project_id = p.id 
        LEFT JOIN tasks t ON f.task_id = t.id 
        LEFT JOIN meetings m ON f.meeting_id = m.id 
        WHERE f.company_id = $1 
        AND (f.is_private = FALSE OR f.uploaded_by = $2 OR $2 = ANY(f.shared_with))
      `;
      const params = [req.session.companyId, req.session.userId];

      if (project_id && project_id !== 'null' && project_id !== '') {
        params.push(project_id);
        query += ` AND f.project_id = $${params.length}`;
      }
      if (task_id && task_id !== 'null' && task_id !== '') {
        params.push(task_id);
        query += ` AND f.task_id = $${params.length}`;
      }
      if (meeting_id && meeting_id !== 'null' && meeting_id !== '') {
        params.push(meeting_id);
        query += ` AND f.meeting_id = $${params.length}`;
      }

      const { rows } = await pool.query(query, params);
      return rows;
    } catch (err) {
      console.error('Fetch files error:', err);
      return reply.code(500).send({ error: 'Failed to fetch files' });
    }
  });

  // GET /files/:id/download
  fastify.get('/:id/download', async (req, reply) => {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT * FROM files WHERE id = $1 AND company_id = $2', [id, req.session.companyId]);
    if (rows.length === 0) return reply.code(404).send({ error: 'File not found' });

    const file = rows[0];

    // Audit log
    await pool.query(
      'INSERT INTO audit_log (company_id, user_id, entity_type, entity_id, action, changes) VALUES ($1, $2, $3, $4, $5, $6)',
      [req.session.companyId, req.session.userId, 'file', id, 'downloaded', JSON.stringify({ filename: file.filename })]
    );

    reply.header('Content-Disposition', `attachment; filename="${file.filename}"`);
    reply.header('Content-Type', file.mimetype);
    return file.data;
  });

  // POST /links
  fastify.post('/links', async (req, reply) => {
    try {
      const { url, project_id, task_id, meeting_id, is_private, shared_with } = req.body;
      let title = url;
      let favicon_url = '';

      try {
        const ogs = require('open-graph-scraper');
        const { result } = await ogs({ url });
        title = result.ogTitle || result.twitterTitle || url;
        favicon_url = result.favicon || '';
      } catch (err) {
        console.error('OG Scrape failed', err);
      }

      // Ensure UUIDs are valid or null
      const pid = project_id && project_id !== 'null' && project_id !== '' ? project_id : null;
      const tid = task_id && task_id !== 'null' && task_id !== '' ? task_id : null;
      const mid = meeting_id && meeting_id !== 'null' && meeting_id !== '' ? meeting_id : null;

      const { rows } = await pool.query(
        'INSERT INTO links (company_id, project_id, task_id, meeting_id, added_by, url, title, favicon_url, is_private, shared_with) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *',
        [req.session.companyId, pid, tid, mid, req.session.userId, url, title, favicon_url, is_private || false, shared_with || null]
      );

      // Audit log
      await pool.query(
        'INSERT INTO audit_log (company_id, user_id, entity_type, entity_id, action, changes) VALUES ($1, $2, $3, $4, $5, $6)',
        [req.session.companyId, req.session.userId, 'link', rows[0].id, 'created', JSON.stringify({ url, title })]
      );

      return rows[0];
    } catch (err) {
      console.error('Link creation error:', err);
      return reply.code(500).send({ error: 'Failed to add link. ' + err.message });
    }
  });

  // GET /links
  fastify.get('/links', async (req, reply) => {
    try {
      const { project_id, task_id, meeting_id } = req.query;
      let query = `
        SELECT l.*, p.name as project_name, t.title as task_title, m.title as meeting_title 
        FROM links l 
        LEFT JOIN projects p ON l.project_id = p.id 
        LEFT JOIN tasks t ON l.task_id = t.id 
        LEFT JOIN meetings m ON l.meeting_id = m.id 
        WHERE l.company_id = $1
        AND (l.is_private = FALSE OR l.added_by = $2 OR $2 = ANY(l.shared_with))
      `;
      const params = [req.session.companyId, req.session.userId];

      if (project_id && project_id !== 'null' && project_id !== '') {
        params.push(project_id);
        query += ` AND l.project_id = $${params.length}`;
      }
      if (task_id && task_id !== 'null' && task_id !== '') {
        params.push(task_id);
        query += ` AND l.task_id = $${params.length}`;
      }
      if (meeting_id && meeting_id !== 'null' && meeting_id !== '') {
        params.push(meeting_id);
        query += ` AND l.meeting_id = $${params.length}`;
      }

      const { rows } = await pool.query(query, params);
      return rows;
    } catch (err) {
      console.error('Fetch links error:', err);
      return reply.code(500).send({ error: 'Failed to fetch links' });
    }
  });

  // GET /files/storage
  fastify.get('/storage', async (req, reply) => {
    const used = await getTotalStorage(req.session.companyId);
    const limit = 10 * 1024 * 1024; // 10MB
    return {
      used,
      limit,
      usedFormatted: used < 1024 * 1024 
        ? (used / 1024).toFixed(2) + ' KB' 
        : (used / (1024 * 1024)).toFixed(2) + ' MB',
      limitFormatted: '10 MB',
      percent: (used / limit) * 100
    };
  });
}

module.exports = fileRoutes;
