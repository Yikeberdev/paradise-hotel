// Root entry point forwarding to backend/server.js
// This ensures platforms that default to "node server.js" in the root directory work out of the box.
require('./backend/server.js');
