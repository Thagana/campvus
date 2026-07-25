// Barrel for the shared engine surface — everything both Mode A (headless,
// LMS-adjacent) and a future Mode B (direct-upload full app) are meant to
// call identically. A future Mode B adapter should require('../engine')
// instead of reaching into individual files.

module.exports = {
  ...require('./crypto-utils'),
  ...require('./identity'),
  ...require('./manifest-store'),
  ...require('./content-store'),
  ...require('./ingest'),
  ...require('./topics'),
  ...require('./swarm-protocol')
}
