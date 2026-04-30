const pool = require('../db');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { sendMail } = require('../utils/mailer');
const emailTemplates = require('../utils/emailTemplates');
const authenticate = require('../middleware/authenticate');

async function sendVerificationEmail(req, email, name, token) {
  const origin = req.headers.origin || req.headers.referer || process.env.BASE_URL || 'https://agile.vsgrps.com';
  const verificationLink = `${origin.replace(/\/$/, '')}/verify?token=${token}`;

  try {
    await sendMail({
      to: email,
      subject: 'Verify your Sprintora Account',
      html: emailTemplates.verification(name, verificationLink)
    });
  } catch (err) {
    console.error('Email Error:', err.message);
  }
}

async function sendResetEmail(req, email, name, token) {
  const origin = req.headers.origin || req.headers.referer || process.env.BASE_URL || 'https://agile.vsgrps.com';
  const resetLink = `${origin.replace(/\/$/, '')}/reset-password?token=${token}`;

  try {
    await sendMail({
      to: email,
      subject: 'Reset your Sprintora Password',
      html: emailTemplates.resetPassword(name, resetLink)
    });
  } catch (err) {
    console.error('Reset Email Error:', err.message);
  }
}

async function authRoutes(fastify, options) {
  // Login
  fastify.post('/login', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute'
      }
    }
  }, async (req, reply) => {
    const { email, password, rememberMe, companyId } = req.body;
    
    if (!email || !password || !email.includes('@')) {
      return reply.code(400).send({ error: 'Valid email and password are required.' });
    }

    const { rows } = await pool.query(`
      SELECT u.*, c.name as company_name 
      FROM users u 
      LEFT JOIN companies c ON u.company_id = c.id 
      WHERE u.email = $1
    `, [email]);

    if (rows.length === 0) return reply.code(401).send({ error: 'Invalid credentials.' });

    // Filter matching users by password
    const matchingUsers = [];
    for (const u of rows) {
      const match = await bcrypt.compare(password, u.password_hash);
      if (match) {
        matchingUsers.push(u);
      }
    }

    if (matchingUsers.length === 0) {
      return reply.code(401).send({ error: 'Invalid credentials.' });
    }

    let user;
    if (matchingUsers.length > 1) {
      if (companyId) {
        user = matchingUsers.find(u => u.company_id === companyId);
        if (!user) return reply.code(400).send({ error: 'Invalid organization selected.' });
      } else {
        // Return list of organizations for user to choose
        const orgs = matchingUsers.map(u => ({
          companyId: u.company_id,
          companyName: u.company_name,
          role: u.role
        }));
        return { multipleOrgs: true, orgs };
      }
    } else {
      user = matchingUsers[0];
    }

    // Check verification
    if (!user.is_verified) {
      return reply.code(403).send({ error: 'Account not verified. Please check your inbox for the activation link.' });
    }

    req.session.userId = user.id;
    req.session.companyId = user.company_id;
    req.session.userRole = user.role;
    req.session.userName = user.name;

    // Handle Remember Me
    if (rememberMe) {
      req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    } else {
      req.session.cookie.maxAge = 2 * 60 * 60 * 1000; // 2 hours (default)
    }

    const { password_hash, reset_token, reset_token_expiry, ...userWithoutPass } = user;
    return { user: userWithoutPass };
  });

  // Forgot Password
  fastify.post('/forgot-password', async (req, reply) => {
    const { email } = req.body;
    
    // Fix 8: Input Validation
    if (!email || !email.includes('@')) {
      return reply.code(400).send({ error: 'Valid email is required.' });
    }

    const { rows } = await pool.query('SELECT id, name, email FROM users WHERE email = $1', [email]);

    if (rows.length === 0) {
      return reply.code(404).send({ error: 'No account found with this email address.' });
    }

    const user = rows[0];
    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 3600000); // 1 hour

    await pool.query(
      'UPDATE users SET reset_token = $1, reset_token_expiry = $2 WHERE id = $3',
      [token, expiry, user.id]
    );
    await sendResetEmail(req, email, user.name, token);

    return { message: 'Password reset link has been sent to your email.' };
  });

  // Reset Password
  fastify.post('/reset-password', async (req, reply) => {
    const { token, password } = req.body;

    if (!token || !password || password.length < 8) {
      return reply.code(400).send({ error: 'Invalid token or password (min 8 chars).' });
    }

    const { rows } = await pool.query(
      'SELECT id FROM users WHERE reset_token = $1 AND reset_token_expiry > NOW()',
      [token]
    );

    if (rows.length === 0) {
      return reply.code(400).send({ error: 'Invalid or expired reset token.' });
    }

    const userId = rows[0].id;
    const hash = await bcrypt.hash(password, 10);

    await pool.query(
      'UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expiry = NULL WHERE id = $2',
      [hash, userId]
    );

    return { message: 'Password reset successful. You can now log in.' };
  });

  // Register (Create Company + Admin User)
  fastify.post('/register', async (req, reply) => {
    const { name, email, password, companyName } = req.body;

    // Fix 8: Input Validation
    if (!name || !email || !password || !companyName || password.length < 8) {
      return reply.code(400).send({ error: 'All fields are required. Password must be at least 8 characters.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const companyRes = await client.query('INSERT INTO companies (name) VALUES ($1) RETURNING id', [companyName]);
      const companyId = companyRes.rows[0].id;

      const hash = await bcrypt.hash(password, 10);
      const token = crypto.randomBytes(32).toString('hex');

      const userRes = await client.query(
        'INSERT INTO users (company_id, name, email, password_hash, role, verification_token, is_verified) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, company_id, name, email, role',
        [companyId, name, email, hash, 'Admin', token, false]
      );

      await client.query('COMMIT');

      // Send verification email
      await sendVerificationEmail(req, email, name, token);

      return { message: 'Registration successful! Please check your email to verify your account.' };
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505') return reply.code(400).send({ error: 'Email already exists' });
      throw err;
    } finally {
      client.release();
    }
  });

  // Verify Email
  fastify.get('/verify', async (req, reply) => {
    const { token } = req.query;
    if (!token) return reply.code(400).send({ error: 'Missing token' });

    const { rows } = await pool.query(
      'UPDATE users SET is_verified = true, verification_token = NULL WHERE verification_token = $1 RETURNING id, name',
      [token]
    );

    if (rows.length === 0) {
      return reply.code(400).send({ error: 'Invalid or expired verification token' });
    }

    return { success: true, message: `Email verified successfully! You can now log in, ${rows[0].name}.` };
  });

  // Me
  fastify.get('/me', async (req, reply) => {
    if (!req.session.userId) return reply.code(401).send({ error: 'Not authenticated' });
    const { rows } = await pool.query(`
      SELECT u.id, u.company_id, u.name, u.email, u.role, u.avatar_url, u.theme_preference, c.name as company_name 
      FROM users u 
      LEFT JOIN companies c ON u.company_id = c.id 
      WHERE u.id = $1
    `, [req.session.userId]);
    if (rows.length === 0) return reply.code(401).send({ error: 'User not found' });
    return { user: rows[0] };
  });

  // Logout
  fastify.post('/logout', async (req, reply) => {
    const userId = req.session.userId;
    
    // Clear push subscriptions for this user on logout
    if (userId) {
      await pool.query('DELETE FROM push_subscriptions WHERE user_id = $1', [userId]);
    }

    await new Promise((resolve) => {
      req.session.destroy((err) => {
        if (err) console.error('Logout error:', err);
        resolve();
      });
    });
    reply.clearCookie('session'); // Explicitly clear cookie
    return { success: true };
  });

  // GET /users (Company members)
  fastify.get('/users', { preHandler: authenticate }, async (req, reply) => {
    const { rows } = await pool.query('SELECT id, name, email, role, avatar_url FROM users WHERE company_id = $1', [req.session.companyId]);
    return rows;
  });

  // DELETE /auth/users/:id
  fastify.delete('/users/:id', { preHandler: authenticate }, async (req, reply) => {
    if (req.session.userRole !== 'Admin') {
      return reply.code(403).send({ error: 'Only Administrators can remove team members.' });
    }

    const { id } = req.params;
    if (id === req.session.userId) {
      return reply.code(400).send({ error: 'You cannot remove yourself.' });
    }

    const userRes = await pool.query('SELECT id, name, email, role FROM users WHERE id = $1 AND company_id = $2', [id, req.session.companyId]);
    if (userRes.rows.length === 0) return reply.code(404).send({ error: 'User not found' });

    await pool.query('DELETE FROM users WHERE id = $1 AND company_id = $2', [id, req.session.companyId]);

    await pool.query(
      'INSERT INTO audit_log (company_id, user_id, entity_type, entity_id, action, changes) VALUES ($1, $2, $3, $4, $5, $6)',
      [req.session.companyId, req.session.userId, 'user', id, 'removed', JSON.stringify(userRes.rows[0])]
    );

  });
}

module.exports = authRoutes;
