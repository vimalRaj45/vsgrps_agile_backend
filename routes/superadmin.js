const crypto = require('crypto');
const { sendMail } = require('../utils/mailer');
const emailTemplates = require('../utils/emailTemplates');

// In-memory store for OTP (cleared on restart, fine for superadmin use)
let currentOTP = null;
let otpExpiry = null;
let otpAttempts = 0;
const MAX_OTP_ATTEMPTS = 3;

const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL;

if (!SUPER_ADMIN_EMAIL) {
  console.warn('⚠️ WARNING: SUPER_ADMIN_EMAIL not defined in .env. Super admin access will be disabled.');
}

async function sendOTPEmail(email, otp) {
  try {
    console.log('--- SUPER ADMIN OTP ---');
    console.log(`OTP: ${otp}`);
    console.log('-----------------------');

    await sendMail({
      to: email,
      subject: 'Sprintora | Super Admin Access Code',
      html: emailTemplates.otp(otp)
    });
  } catch (err) {
    console.error('OTP Email Error:', err.message);
  }
}

async function superAdminRoutes(fastify, options) {
  // Request OTP
  fastify.post('/request-otp', async (req, reply) => {
    const { email } = req.body;
    if (!SUPER_ADMIN_EMAIL || email !== SUPER_ADMIN_EMAIL) {
      return reply.code(403).send({ error: 'Access Denied: Restricted to system owner.' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    currentOTP = otp;
    otpExpiry = Date.now() + 600000; // 10 minutes
    otpAttempts = 0; // Reset attempts on new request

    await sendOTPEmail(email, otp);
    return { message: 'OTP sent to your email.' };
  });

  // Verify OTP
  fastify.post('/verify-otp', async (req, reply) => {
    const { email, otp } = req.body;
    if (!SUPER_ADMIN_EMAIL || email !== SUPER_ADMIN_EMAIL) {
      return reply.code(403).send({ error: 'Access Denied.' });
    }

    if (!currentOTP || Date.now() > otpExpiry) {
      return reply.code(400).send({ error: 'OTP expired or not requested.' });
    }

    if (otpAttempts >= MAX_OTP_ATTEMPTS) {
      currentOTP = null; // Invalidate OTP after too many attempts
      return reply.code(429).send({ error: 'Too many failed attempts. Please request a new code.' });
    }

    if (otp !== currentOTP) {
      otpAttempts++;
      return reply.code(401).send({ error: `Invalid access code. ${MAX_OTP_ATTEMPTS - otpAttempts} attempts remaining.` });
    }

    // Success - sign a token for Super Admin
    const token = await reply.jwtSign({
      email: email,
      isSuperAdmin: true
    }, {
      expiresIn: '2h'
    });
    
    currentOTP = null; // Clear OTP after use
    otpAttempts = 0;
    
    return { success: true, message: 'Super Admin access granted.', token };
  });
 
  // Check Super Admin Status
  fastify.get('/status', async (req, reply) => {
    try {
      const decoded = await req.jwtVerify();
      return { isSuperAdmin: !!decoded.isSuperAdmin };
    } catch (err) {
      return { isSuperAdmin: false };
    }
  });
 
  // Logout Super Admin
  fastify.post('/logout', async (req, reply) => {
    return { success: true };
  });
}

module.exports = superAdminRoutes;
