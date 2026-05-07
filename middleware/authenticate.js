module.exports = async function authenticate(req, reply) {
  try {
    await req.jwtVerify();
  } catch (err) {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
};
