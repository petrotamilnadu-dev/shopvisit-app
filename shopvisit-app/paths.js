// Central place for where the SQLite database and uploaded photos live.
//
// Locally (no PERSIST_DIR set), everything lives inside the project folder as before —
// ./data/shopvisit.db and ./uploads/.
//
// In production (e.g. Render), set PERSIST_DIR to the mount path of your ONE attached disk
// (Render allows only one disk per service). Both the database and uploaded photos will then
// live under that single disk as subfolders, so both survive restarts/redeploys.
//   Example: PERSIST_DIR=/opt/render/project/src/shopvisit-app/persist

const path = require('path');

const baseDir = process.env.PERSIST_DIR || __dirname;

const DATA_DIR = path.join(baseDir, 'data');
const UPLOAD_DIR = path.join(baseDir, 'uploads');

module.exports = { DATA_DIR, UPLOAD_DIR };
