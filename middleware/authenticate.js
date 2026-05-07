module.exports = async function authenticate(req, reply) {
  try {
    // Support token in query parameter (useful for file downloads)
    const token = req.query.token;
    if (token) {
      const decoded = await req.server.jwt.verify(token);
      req.user = decoded;
    } else {
      await req.jwtVerify();
    }
  } catch (err) {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
};
