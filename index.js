require('dotenv').config();
const fastify = require('fastify')({
  logger: true,
  trustProxy: true // Required for Render/Proxies to handle Secure cookies
});

// Environment Variables
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('❌ CRITICAL: JWT_SECRET must be at least 32 characters long and defined in .env');
  process.exit(1);
}

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'https://agile.vsgrps.com',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
].filter(Boolean);

// Logging hook to catch silent 500 errors
fastify.addHook('onError', (request, reply, error, done) => {
  console.error("FASTIFY 500 ERROR CAUGHT:", error);
  done();
});

fastify.register(require('@fastify/cors'), {
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
});

fastify.register(require('@fastify/rate-limit'), {
  max: 1000,
  timeWindow: '1 minute'
});

fastify.register(require('@fastify/jwt'), {
  secret: JWT_SECRET
});

// Google OAuth
fastify.register(require('@fastify/oauth2'), {
  name: 'googleOAuth2',
  scope: ['profile', 'email'],
  credentials: {
    client: {
      id: process.env.GOOGLE_CLIENT_ID,
      secret: process.env.GOOGLE_CLIENT_SECRET
    },
    auth: require('@fastify/oauth2').GOOGLE_CONFIGURATION
  },
  startRedirectPath: '/auth/login/google',
  callbackUri: `${process.env.BASE_URL}/auth/login/google/callback`,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  }
});

// GitHub OAuth
fastify.register(require('@fastify/oauth2'), {
  name: 'githubOAuth2',
  scope: ['user:email'],
  credentials: {
    client: {
      id: process.env.GITHUB_CLIENT_ID,
      secret: process.env.GITHUB_CLIENT_SECRET
    },
    auth: require('@fastify/oauth2').GITHUB_CONFIGURATION
  },
  startRedirectPath: '/auth/login/github',
  callbackUri: `${process.env.BASE_URL}/auth/login/github/callback`
});



fastify.register(require('@fastify/multipart'), {
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

// Register routes with prefixes
fastify.register(require('./routes/auth'), { prefix: '/auth' });
fastify.register(require('./routes/tasks'), { prefix: '/tasks' });
fastify.register(require('./routes/projects'), { prefix: '/projects' });
fastify.register(require('./routes/meetings'), { prefix: '/meetings' });
fastify.register(require('./routes/files'), { prefix: '/files' });
fastify.register(require('./routes/notifications'), { prefix: '/notifications' });
fastify.register(require('./routes/audit'), { prefix: '/audit' });
fastify.register(require('./routes/search'), { prefix: '/search' });
fastify.register(require('./routes/invite'), { prefix: '/invite' });
fastify.register(require('./routes/dashboard'), { prefix: '/dashboard' });
fastify.register(require('./routes/users'), { prefix: '/users' });
fastify.register(require('./routes/ai'), { prefix: '/ai' });
fastify.register(require('./routes/backup'), { prefix: '/backup' });
fastify.register(require('./routes/reports'), { prefix: '/reports' });
fastify.register(require('./routes/superadmin'), { prefix: '/superadmin' });

// Global Error Handler
fastify.setErrorHandler((error, request, reply) => {
  fastify.log.error(error);

  if (error.validation) {
    return reply.code(400).send({
      error: 'Validation failed',
      details: error.validation
    });
  }

  if (error.statusCode === 429) {
    return reply.code(429).send({
      error: 'Too many requests. Please slow down.'
    });
  }

  // Hide stack traces in production
  const message = process.env.NODE_ENV === 'production'
    ? 'An internal server error occurred.'
    : error.message;

  reply.code(error.statusCode || 500).send({
    error: 'Internal Server Error',
    message
  });
});

fastify.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  console.log(`Server listening on ${address}`);
});
