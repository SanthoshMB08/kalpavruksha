// Express 4 does not forward rejected async handlers to its error middleware.
function wrapHandlers(handlers) {
  return Object.fromEntries(Object.entries(handlers).map(([name, handler]) => [
    name, (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
  ]));
}

function validateId(req, res, next, id) {
  if (!/^[1-9][0-9]{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n) {
    return res.status(400).type('text').send(req.t('Invalid identifier.'));
  }
  next();
}

module.exports = { wrapHandlers, validateId };
