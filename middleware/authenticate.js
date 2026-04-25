module.exports = async function authenticate(req, reply) {
  if (!req.session.userId) {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
};
