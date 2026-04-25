const pool = require('../db');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const { sendMail } = require('../utils/mailer');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');

async function sendInviteEmail(req, email, companyName, inviterName, token) {
  const origin = req.headers.origin || req.headers.referer || process.env.BASE_URL || 'https://vsgrps-agile-backend.onrender.com';
  const inviteLink = `${origin.replace(/\/$/, '')}/invite/${token}`;

  try {
    console.log('--- DEVELOPMENT INVITE LINK ---');
    console.log(`Invite to: ${email}`);
    console.log(`Link: ${inviteLink}`);
    console.log('-------------------------------');

    await sendMail({
      to: email,
      subject: `Invitation to join ${companyName} on VSGRPS Agile`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333;">
          <h2>Workspace Invitation</h2>
          <p><strong>${inviterName}</strong> has invited you to join the <strong>${companyName}</strong> workspace on VSGRPS Agile.</p>
          <p>Click the button below to set up your account and get started:</p>
          <a href="${inviteLink}" style="display: inline-block; padding: 12px 24px; background-color: #6366f1; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; margin-top: 20px;">Join Workspace</a>
          <p style="margin-top: 30px; font-size: 12px; color: #777;">If you were not expecting this invitation, please ignore this email.</p>
        </div>
      `
    });
  } catch (err) {
    console.error('Invite Email Error:', err.message);
  }
}

async function inviteRoutes(fastify, options) {
  // POST /invite/check
  fastify.post('/check', { preHandler: [authenticate] }, async (req, reply) => {
    const { email } = req.body;
    const { rows } = await pool.query(`
      SELECT u.id, u.company_id, c.name as company_name 
      FROM users u 
      JOIN companies c ON u.company_id = c.id 
      WHERE u.email = $1
    `, [email]);

    if (rows.length > 0) {
      const existingUser = rows[0];
      if (existingUser.company_id === req.session.companyId) {
        return { exists: true, sameOrg: true };
      } else {
        return { exists: true, sameOrg: false, companyName: existingUser.company_name };
      }
    }

    return { exists: false };
  });

  // POST /invites (Admin only)
  fastify.post('/', { preHandler: [authenticate, authorize('user:invite')] }, async (req, reply) => {
    const { email, role } = req.body;
    const token = uuidv4();

    // Get company and inviter info for email
    const [companyRes, inviterRes] = await Promise.all([
      pool.query('SELECT name FROM companies WHERE id = $1', [req.session.companyId]),
      pool.query('SELECT name FROM users WHERE id = $1', [req.session.userId])
    ]);

    const { rows } = await pool.query(
      'INSERT INTO invites (company_id, email, role, token, invited_by) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.session.companyId, email, role || 'Developer', token, req.session.userId]
    );

    // Send Invite Email
    await sendInviteEmail(req, email, companyRes.rows[0].name, inviterRes.rows[0].name, token);

    return { token: rows[0].token };
  });

  // GET /invite/:token
  fastify.get('/:token', async (req, reply) => {
    const { token } = req.params;
    const { rows } = await pool.query(
      'SELECT i.*, c.name as company_name FROM invites i JOIN companies c ON i.company_id = c.id WHERE i.token = $1 AND i.accepted = FALSE',
      [token]
    );
    if (rows.length === 0) return reply.code(404).send({ error: 'Invalid or expired invite' });
    
    const invite = rows[0];
    
    // Check if user already exists in the system (other orgs)
    const { rows: userRows } = await pool.query('SELECT name FROM users WHERE email = $1 LIMIT 1', [invite.email]);
    
    return { 
      ...invite, 
      userExists: userRows.length > 0,
      existingName: userRows.length > 0 ? userRows[0].name : null
    };
  });

  // POST /invite/:token/accept
  fastify.post('/:token/accept', async (req, reply) => {
    const { token } = req.params;
    const { name, password } = req.body;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const inviteRes = await client.query('SELECT * FROM invites WHERE token = $1 AND accepted = FALSE', [token]);
      if (inviteRes.rows.length === 0) throw new Error('Invalid invite');
      const invite = inviteRes.rows[0];

      let finalName = name;
      let finalHash;

      // Check if user exists in another org
      const { rows: existingUsers } = await client.query('SELECT name, password_hash FROM users WHERE email = $1 LIMIT 1', [invite.email]);
      
      if (existingUsers.length > 0) {
        // User already in system - inherit their existing profile
        finalName = existingUsers[0].name;
        finalHash = existingUsers[0].password_hash;
      } else {
        // New user - require name and password
        if (!name || !password) throw new Error('Name and password are required for new users');
        finalHash = await bcrypt.hash(password, 10);
      }

      // Auto-verify invited users since they received the invite via email
      const userRes = await client.query(
        'INSERT INTO users (company_id, name, email, password_hash, role, invited_by, invite_accepted, is_verified) VALUES ($1, $2, $3, $4, $5, $6, TRUE, TRUE) RETURNING *',
        [invite.company_id, finalName, invite.email, finalHash, invite.role, invite.invited_by]
      );

      await client.query('UPDATE invites SET accepted = TRUE WHERE id = $1', [invite.id]);

      await client.query('COMMIT');
      return { success: true };
    } catch (err) {
      await client.query('ROLLBACK');
      return reply.code(400).send({ error: err.message });
    } finally {
      client.release();
    }
  });
}

module.exports = inviteRoutes;
