const { getAuth } = require('@clerk/fastify');

module.exports = async function authenticate(req, reply) {
  const auth = getAuth(req);
  
  // Allow both Clerk auth and legacy session auth for gradual migration
  if (!auth.userId && !req.session.userId) {
    return reply.code(401).send({ error: 'Unauthorized' });
  }

  // If authenticated via Clerk, sync Clerk data to the session object
  // so the rest of the app's routes (which use req.session) continue to work.
  if (auth.userId) {
    req.session.userId = auth.userId;
    // Extract metadata from Clerk session claims
    // Note: sessionClaims depends on how you've configured your Clerk JWT template
    req.session.companyId = auth.sessionClaims?.public_metadata?.company_id || auth.sessionClaims?.company_id;
    req.session.userRole = auth.sessionClaims?.public_metadata?.role || auth.sessionClaims?.role || 'Developer';
  }
};
