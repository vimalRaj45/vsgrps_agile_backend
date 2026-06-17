const pool = require('../db');
const { authorize } = require('../middleware/authorize');
const authenticate = require('../middleware/authenticate');
const { r2Client, bucketName } = require('../utils/r2');
const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

async function userRoutes(fastify) {
  fastify.addHook('preHandler', async (req, reply) => {
    // Skip authenticate for public avatar route
    if (req.url.startsWith('/users/avatar/') && req.method === 'GET') return;
    return authenticate(req, reply);
  });

  // GET /users/avatar/:userId - Publicly accessible avatar proxy
  fastify.get('/avatar/:userId', async (req, reply) => {
    try {
      const { userId } = req.params;
      const { rows } = await pool.query('SELECT name, avatar_url FROM users WHERE id = $1', [userId]);
      
      if (rows.length === 0) return reply.code(404).send({ error: 'User not found' });
      
      const user = rows[0];
      
      if (!user.avatar_url || !user.avatar_url.startsWith('avatars/')) {
        // Fallback to UI Avatars
        return reply.redirect(`https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=6366f1&color=fff&bold=true`);
      }

      const response = await r2Client.send(new GetObjectCommand({
        Bucket: bucketName,
        Key: user.avatar_url,
      }));

      reply.header('Content-Type', response.ContentType || 'image/png');
      reply.header('Cache-Control', 'public, max-age=3600');
      return response.Body;
    } catch (err) {
      console.error('Avatar fetch error:', err);
      return reply.redirect('https://ui-avatars.com/api/?name=User&background=6366f1&color=fff');
    }
  });

  // POST /users/avatar - Upload your own avatar
  fastify.post('/avatar', async (req, reply) => {
    try {
      const data = await req.file();
      if (!data) return reply.code(400).send({ error: 'No file uploaded' });

      // Fetch current avatar to delete it if it exists in R2
      const userRes = await pool.query('SELECT avatar_url FROM users WHERE id = $1', [req.user.userId]);
      const oldAvatar = userRes.rows[0]?.avatar_url;

      if (oldAvatar && oldAvatar.startsWith('avatars/')) {
        try {
          await r2Client.send(new DeleteObjectCommand({
            Bucket: bucketName,
            Key: oldAvatar,
          }));
        } catch (delErr) {
          console.warn('Failed to delete old avatar:', delErr);
          // Continue anyway
        }
      }

      const fileContent = await data.toBuffer();
      const r2Key = `avatars/${req.user.userId}-${Date.now()}.png`;

      await r2Client.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: r2Key,
        Body: fileContent,
        ContentType: data.mimetype,
      }));

      const avatarUrl = `${r2Key}`; // Store the key, proxy handles the rest
      await pool.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [avatarUrl, req.user.userId]);

      return { success: true, avatarUrl: `/users/avatar/${req.user.userId}?v=${Date.now()}` };
    } catch (err) {
      console.error('Avatar upload error:', err);
      return reply.code(500).send({ error: 'Failed to upload avatar' });
    }
  });

  // List all users in the same company
  fastify.get('/', { preHandler: [authorize('user:view')] }, async (req, reply) => {
    const { companyId } = req.user;
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
    const { companyId } = req.user;

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
      [companyId, req.user.userId, 'user', id, 'updated', JSON.stringify(req.body)]
    );

    return result.rows[0];
  });

  // Delete user
  fastify.delete('/:id', { preHandler: [authorize('audit:view')] }, async (req, reply) => {
    const { id } = req.params;
    const { companyId, userId } = req.user;

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
  // List all roles for the company
  fastify.get('/roles', { preHandler: [authorize('role:manage')] }, async (req, reply) => {
    const { companyId } = req.user;
    const { rows: roles } = await pool.query(
      'SELECT id, name, description, is_system FROM custom_roles WHERE company_id = $1 ORDER BY is_system DESC, name ASC',
      [companyId]
    );

    // Fetch permissions for each role
    for (const role of roles) {
      const { rows: perms } = await pool.query(
        'SELECT permission_key FROM role_permissions WHERE role_id = $1',
        [role.id]
      );
      role.permissions = perms.map(p => p.permission_key);
    }

    return roles;
  });

  // Get all available permissions
  fastify.get('/permissions', { preHandler: [authorize('role:manage')] }, async (req, reply) => {
    reply.header('Cache-Control', 'no-store, max-age=0');
    const { AVAILABLE_PERMISSIONS } = require('../middleware/authorize');
    return AVAILABLE_PERMISSIONS;
  });

  // Create a new role
  fastify.post('/roles', { preHandler: [authorize('role:manage')] }, async (req, reply) => {
    const { name, description, permissions } = req.body;
    const { companyId } = req.user;

    if (!name) return reply.code(400).send({ error: 'Role name is required' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        'INSERT INTO custom_roles (company_id, name, description) VALUES ($1, $2, $3) RETURNING id',
        [companyId, name, description]
      );
      const roleId = rows[0].id;

      if (permissions && Array.isArray(permissions)) {
        for (const perm of permissions) {
          await client.query(
            'INSERT INTO role_permissions (role_id, permission_key) VALUES ($1, $2)',
            [roleId, perm]
          );
        }
      }

      await client.query('COMMIT');
      return { id: roleId, name, description, permissions };
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505') return reply.code(400).send({ error: 'Role name already exists' });
      throw err;
    } finally {
      client.release();
    }
  });

  // Update role permissions
  fastify.patch('/roles/:id', { preHandler: [authorize('role:manage')] }, async (req, reply) => {
    const { id } = req.params;
    const { description, permissions } = req.body;
    const { companyId } = req.user;

    // Check if role belongs to the same company
    const check = await pool.query('SELECT is_system FROM custom_roles WHERE id = $1 AND company_id = $2', [id, companyId]);
    if (check.rows.length === 0) return reply.code(404).send({ error: 'Role not found' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (description) {
        await client.query('UPDATE custom_roles SET description = $1 WHERE id = $2', [description, id]);
      }

      if (permissions && Array.isArray(permissions)) {
        await client.query('DELETE FROM role_permissions WHERE role_id = $1', [id]);
        for (const perm of permissions) {
          await client.query(
            'INSERT INTO role_permissions (role_id, permission_key) VALUES ($1, $2)',
            [id, perm]
          );
        }
      }

      await client.query('COMMIT');
      return { success: true };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  // Delete a role
  fastify.delete('/roles/:id', { preHandler: [authorize('role:manage')] }, async (req, reply) => {
    const { id } = req.params;
    const { companyId } = req.user;

    // Check if role belongs to the same company and is not system
    const check = await pool.query('SELECT is_system, name FROM custom_roles WHERE id = $1 AND company_id = $2', [id, companyId]);
    if (check.rows.length === 0) return reply.code(404).send({ error: 'Role not found' });
    if (check.rows[0].is_system) return reply.code(403).send({ error: 'Cannot delete system roles' });

    // Check if any user is assigned to this role
    const usersWithRole = await pool.query('SELECT id FROM users WHERE company_id = $1 AND role = $2', [companyId, check.rows[0].name]);
    if (usersWithRole.rows.length > 0) {
      return reply.code(400).send({ error: 'Cannot delete role while users are assigned to it' });
    }

    await pool.query('DELETE FROM custom_roles WHERE id = $1', [id]);
    return { success: true };
  });
}

module.exports = userRoutes;
