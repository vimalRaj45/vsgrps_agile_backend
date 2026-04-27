const pool = require('../db');
const authenticate = require('../middleware/authenticate');
const { r2Client, bucketName } = require('../utils/r2');
const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

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
          COALESCE((SELECT SUM(size) FROM files WHERE company_id = $1), 0) +
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

      // Check per-file limit (50MB)
      if (fileSize > 50 * 1024 * 1024) {
        return reply.code(400).send({ error: 'Individual file size exceeds the 50MB limit.' });
      }

      // Check Global storage quota (200MB)
      const LIMIT = 200 * 1024 * 1024;
      const currentTotal = await getTotalStorage(req.session.companyId);

      if (currentTotal + fileSize > LIMIT) {
        return reply.code(400).send({ error: 'Organizational storage limit reached (200MB). Please contact VSGRPS to upgrade your limits.' });
      }

      const is_private = data.fields.is_private?.value === 'true';
      const shared_with = data.fields.shared_with?.value ? data.fields.shared_with.value.split(',') : null;

      // Ensure UUIDs are valid or null
      const pid = project_id?.value && project_id.value !== 'null' && project_id.value !== '' ? project_id.value : null;
      const tid = task_id?.value && task_id.value !== 'null' && task_id.value !== '' ? task_id.value : null;
      const mid = meeting_id?.value && meeting_id.value !== 'null' && meeting_id.value !== '' ? meeting_id.value : null;

      const { rows } = await pool.query(
        'INSERT INTO files (company_id, project_id, task_id, meeting_id, uploaded_by, filename, mimetype, size, is_private, shared_with) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, filename',
        [
          req.session.companyId, 
          pid, 
          tid, 
          mid, 
          req.session.userId, 
          data.filename, 
          data.mimetype, 
          fileSize, 
          is_private,
          shared_with
        ]
      );

      const fileId = rows[0].id;
      const r2Key = `files/${req.session.companyId}/${fileId}/${data.filename}`;

      // Upload to Cloudflare R2
      await r2Client.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: r2Key,
        Body: fileContent,
        ContentType: data.mimetype,
      }));

      // Update file record with R2 key (optional, but good for tracking)
      // For now we'll just store the key in our logic or add a column if needed.
      // We can reconstruct the key from ID and filename.

      // Audit log
    await pool.query(
      'INSERT INTO audit_log (company_id, user_id, entity_type, entity_id, action, changes) VALUES ($1, $2, $3, $4, $5, $6)',
      [req.session.companyId, req.session.userId, 'file', rows[0].id, 'uploaded', JSON.stringify({ filename: data.filename, size: fileSize })]
    );

    // Notifications for shared users
    if (is_private && shared_with && shared_with.length > 0) {
      const { sendPushNotification } = require('../utils/push');
      const message = `${req.session.userName} shared a file with you: ${data.filename}`;
      for (const uid of shared_with) {
        if (uid === req.session.userId) continue;
        await pool.query(
          'INSERT INTO notifications (company_id, user_id, type, message, link) VALUES ($1, $2, $3, $4, $5)',
          [req.session.companyId, uid, 'file_shared', message, `/files?id=${rows[0].id}`]
        );
        await sendPushNotification(uid, {
          title: 'File Shared',
          body: message,
          icon: '/logo192.png',
          data: { url: `/files` }
        });
      }
    }

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
    try {
      const { id } = req.params;
      const { rows } = await pool.query('SELECT * FROM files WHERE id = $1 AND company_id = $2', [id, req.session.companyId]);
      if (rows.length === 0) return reply.code(404).send({ error: 'File not found' });

      const file = rows[0];
      const r2Key = `files/${req.session.companyId}/${file.id}/${file.filename}`;

      // Audit log
      await pool.query(
        'INSERT INTO audit_log (company_id, user_id, entity_type, entity_id, action, changes) VALUES ($1, $2, $3, $4, $5, $6)',
        [req.session.companyId, req.session.userId, 'file', id, 'downloaded', JSON.stringify({ filename: file.filename })]
      );

      const response = await r2Client.send(new GetObjectCommand({
        Bucket: bucketName,
        Key: r2Key,
      }));

      reply.header('Content-Disposition', `attachment; filename="${file.filename}"`);
      reply.header('Content-Type', file.mimetype);
      
      // Stream the file from R2 to the client
      return response.Body;
    } catch (err) {
      console.error('Download error:', err);
      return reply.code(500).send({ error: 'Failed to download file from storage.' });
    }
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

      // Notifications for shared users
      if (is_private && shared_with && shared_with.length > 0) {
        const { sendPushNotification } = require('../utils/push');
        const message = `${req.session.userName} shared a link with you: ${title}`;
        for (const uid of shared_with) {
          if (uid === req.session.userId) continue;
          await pool.query(
            'INSERT INTO notifications (company_id, user_id, type, message, link) VALUES ($1, $2, $3, $4, $5)',
            [req.session.companyId, uid, 'link_shared', message, `/files`]
          );
          await sendPushNotification(uid, {
            title: 'Link Shared',
            body: message,
            icon: '/logo192.png',
            data: { url: `/files` }
          });
        }
      }

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

  // DELETE /files/:id
  fastify.delete('/:id', async (req, reply) => {
    try {
      const { id } = req.params;
      const { rows } = await pool.query('SELECT id, uploaded_by, filename FROM files WHERE id = $1 AND company_id = $2', [id, req.session.companyId]);
      
      if (rows.length === 0) return reply.code(404).send({ error: 'File not found' });
      
      const file = rows[0];
      if (file.uploaded_by !== req.session.userId && req.session.userRole !== 'Admin') {
        return reply.code(403).send({ error: 'You can only delete files you uploaded.' });
      }

      const r2Key = `files/${req.session.companyId}/${file.id}/${file.filename}`;

      // Delete from Cloudflare R2
      try {
        await r2Client.send(new DeleteObjectCommand({
          Bucket: bucketName,
          Key: r2Key,
        }));
      } catch (r2Err) {
        console.warn('Failed to delete from R2, proceeding with DB deletion:', r2Err);
      }

      await pool.query('DELETE FROM files WHERE id = $1 AND company_id = $2', [id, req.session.companyId]);

      // Audit log
      await pool.query(
        'INSERT INTO audit_log (company_id, user_id, entity_type, entity_id, action, changes) VALUES ($1, $2, $3, $4, $5, $6)',
        [req.session.companyId, req.session.userId, 'file', id, 'deleted', JSON.stringify({ filename: file.filename })]
      );

      return { success: true };
    } catch (err) {
      console.error('Delete file error:', err);
      return reply.code(500).send({ error: 'Failed to delete file' });
    }
  });

  // DELETE /links/:id
  fastify.delete('/links/:id', async (req, reply) => {
    try {
      const { id } = req.params;
      const { rows } = await pool.query('SELECT added_by, title FROM links WHERE id = $1 AND company_id = $2', [id, req.session.companyId]);
      
      if (rows.length === 0) return reply.code(404).send({ error: 'Link not found' });
      
      const link = rows[0];
      if (link.added_by !== req.session.userId && req.session.userRole !== 'Admin') {
        return reply.code(403).send({ error: 'You can only delete links you added.' });
      }

      await pool.query('DELETE FROM links WHERE id = $1 AND company_id = $2', [id, req.session.companyId]);

      // Audit log
      await pool.query(
        'INSERT INTO audit_log (company_id, user_id, entity_type, entity_id, action, changes) VALUES ($1, $2, $3, $4, $5, $6)',
        [req.session.companyId, req.session.userId, 'link', id, 'deleted', JSON.stringify({ title: link.title })]
      );

      return { success: true };
    } catch (err) {
      console.error('Delete link error:', err);
      return reply.code(500).send({ error: 'Failed to delete link' });
    }
  });

  // GET /files/storage
  fastify.get('/storage', async (req, reply) => {
    const used = await getTotalStorage(req.session.companyId);
    const limit = 200 * 1024 * 1024; // 200MB
    return {
      used,
      limit,
      usedFormatted: used < 1024 * 1024 
        ? (used / 1024).toFixed(2) + ' KB' 
        : (used / (1024 * 1024)).toFixed(2) + ' MB',
      limitFormatted: '200 MB',
      percent: (used / limit) * 100
    };
  });
}

module.exports = fileRoutes;
