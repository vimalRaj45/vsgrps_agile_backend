const pool = require('../db');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { sendMail } = require('../utils/mailer');
const emailTemplates = require('../utils/emailTemplates');
const axios = require('axios');
const authenticate = require('../middleware/authenticate');
const { authorize, getUserPermissions } = require('../middleware/authorize');

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

    const token = await reply.jwtSign({
      userId: user.id,
      companyId: user.company_id,
      userRole: user.role,
      userName: user.name
    }, {
      expiresIn: rememberMe ? '30d' : '2h'
    });

    const { password_hash, reset_token, reset_token_expiry, ...userWithoutPass } = user;
    const userPermissions = await getUserPermissions(user.company_id, user.role);
    return { user: { ...userWithoutPass, permissions: userPermissions }, token };
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
  fastify.get('/me', { preHandler: authenticate }, async (req, reply) => {
    const { rows } = await pool.query(`
      SELECT u.id, u.company_id, u.name, u.email, u.role, u.avatar_url, u.theme_preference, c.name as company_name,
             (SELECT email FROM users WHERE company_id = u.company_id AND role = 'Admin' ORDER BY created_at ASC LIMIT 1) as admin_email
      FROM users u 
      LEFT JOIN companies c ON u.company_id = c.id 
      WHERE u.id = $1
    `, [req.user.userId]);
    if (rows.length === 0) return reply.code(401).send({ error: 'User not found' });
    const user = rows[0];
    const userPermissions = await getUserPermissions(user.company_id, user.role);
    return { user: { ...user, permissions: userPermissions } };
  });

  // Logout
  fastify.post('/logout', { preHandler: authenticate }, async (req, reply) => {
    const userId = req.user.userId;
    
    // Clear push subscriptions for this user on logout
    if (userId) {
      await pool.query('DELETE FROM push_subscriptions WHERE user_id = $1', [userId]);
    }

    return { success: true };
  });

  // GET /users (Company members)
  fastify.get('/users', { preHandler: authenticate }, async (req, reply) => {
    const { rows } = await pool.query('SELECT id, name, email, role, avatar_url FROM users WHERE company_id = $1', [req.user.companyId]);
    return rows;
  });

  // DELETE /auth/users/:id
  fastify.delete('/users/:id', { preHandler: [authenticate, authorize('user:delete')] }, async (req, reply) => {

    const { id } = req.params;
    if (id === req.user.userId) {
      return reply.code(400).send({ error: 'You cannot remove yourself.' });
    }

    const userRes = await pool.query('SELECT id, name, email, role FROM users WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);
    if (userRes.rows.length === 0) return reply.code(404).send({ error: 'User not found' });

    await pool.query('DELETE FROM users WHERE id = $1 AND company_id = $2', [id, req.user.companyId]);

    await pool.query(
      'INSERT INTO audit_log (company_id, user_id, entity_type, entity_id, action, changes) VALUES ($1, $2, $3, $4, $5, $6)',
      [req.user.companyId, req.user.userId, 'user', id, 'removed', JSON.stringify(userRes.rows[0])]
    );

  });
  // Google OAuth Callback
  fastify.get('/login/google/callback', async (req, reply) => {
    try {
      const { token } = await fastify.googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(req);
      const { data: userInfo } = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${token.access_token}` }
      });

      let userRes = await pool.query('SELECT u.*, c.name as company_name FROM users u LEFT JOIN companies c ON u.company_id = c.id WHERE u.google_id = $1 OR u.email = $2', [userInfo.id, userInfo.email]);
      let user = userRes.rows[0];

      if (!user) {
        // Redirect to complete signup on frontend
        const pendingToken = await reply.jwtSign({
          email: userInfo.email,
          name: userInfo.name,
          googleId: userInfo.id,
          type: 'pending_social_auth'
        }, { expiresIn: '15m' });

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        return reply.redirect(`${frontendUrl}/complete-signup?token=${pendingToken}`);
      } else if (!user.google_id) {
        // Link existing email to Google ID
        await pool.query('UPDATE users SET google_id = $1, is_verified = true WHERE id = $2', [userInfo.id, user.id]);
      }

      const jwtToken = await reply.jwtSign({
        userId: user.id,
        companyId: user.company_id,
        userRole: user.role,
        userName: user.name
      }, { expiresIn: '30d' });

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      reply.redirect(`${frontendUrl}/auth-success?token=${jwtToken}`);
    } catch (err) {
      fastify.log.error(err);
      reply.redirect(`${process.env.FRONTEND_URL}/login?error=social_auth_failed`);
    }
  });

  // GitHub OAuth Callback
  fastify.get('/login/github/callback', async (req, reply) => {
    try {
      const { token } = await fastify.githubOAuth2.getAccessTokenFromAuthorizationCodeFlow(req);
      const { data: userInfo } = await axios.get('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${token.access_token}` }
      });
      
      // GitHub might not return email in /user, fetch separately if needed
      let email = userInfo.email;
      if (!email) {
        const { data: emails } = await axios.get('https://api.github.com/user/emails', {
          headers: { Authorization: `Bearer ${token.access_token}` }
        });
        email = emails.find(e => e.primary && e.verified)?.email || emails[0]?.email;
      }

      let userRes = await pool.query('SELECT u.*, c.name as company_name FROM users u LEFT JOIN companies c ON u.company_id = c.id WHERE u.github_id = $1 OR u.email = $2', [userInfo.id.toString(), email]);
      let user = userRes.rows[0];

      if (!user) {
        // Redirect to complete signup on frontend
        const pendingToken = await reply.jwtSign({
          email: email,
          name: userInfo.name || userInfo.login,
          githubId: userInfo.id.toString(),
          type: 'pending_social_auth'
        }, { expiresIn: '15m' });

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        return reply.redirect(`${frontendUrl}/complete-signup?token=${pendingToken}`);
      } else if (!user.github_id) {
        await pool.query('UPDATE users SET github_id = $1, is_verified = true WHERE id = $2', [userInfo.id.toString(), user.id]);
      }

      const jwtToken = await reply.jwtSign({
        userId: user.id,
        companyId: user.company_id,
        userRole: user.role,
        userName: user.name
      }, { expiresIn: '30d' });

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      reply.redirect(`${frontendUrl}/auth-success?token=${jwtToken}`);
    } catch (err) {
      fastify.log.error(err);
      reply.redirect(`${process.env.FRONTEND_URL}/login?error=social_auth_failed`);
    }
  });
  // POST /auth/complete-social-signup
  fastify.post('/complete-social-signup', async (req, reply) => {
    const { token, companyName, name } = req.body;
    
    try {
      const decoded = await fastify.jwt.verify(token);
      if (decoded.type !== 'pending_social_auth') {
        return reply.code(400).send({ error: 'Invalid token type' });
      }

      // Check if user already exists (just in case)
      const existingUser = await pool.query('SELECT * FROM users WHERE email = $1', [decoded.email]);
      if (existingUser.rows.length > 0) {
        return reply.code(400).send({ error: 'User already exists' });
      }

      const client = await pool.connect();
      let user;
      try {
        await client.query('BEGIN');
        const companyRes = await client.query('INSERT INTO companies (name) VALUES ($1) RETURNING id', [companyName]);
        const companyId = companyRes.rows[0].id;
        
        const newUserRes = await client.query(
          'INSERT INTO users (company_id, name, email, google_id, github_id, role, is_verified) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
          [companyId, name || decoded.name, decoded.email, decoded.googleId || null, decoded.githubId || null, 'Admin', true]
        );
        user = newUserRes.rows[0];
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      const jwtToken = await reply.jwtSign({
        userId: user.id,
        companyId: user.company_id,
        userRole: user.role,
        userName: user.name
      }, { expiresIn: '30d' });

      const userPermissions = await getUserPermissions(user.company_id, user.role);
      return { token: jwtToken, user: { id: user.id, name: user.name, email: user.email, role: user.role, companyId: user.company_id, permissions: userPermissions } };
    } catch (err) {
      return reply.code(400).send({ error: 'Invalid or expired signup token' });
    }
  });
}

module.exports = authRoutes;
