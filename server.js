/**
 * Streamable V2 — server.js
 * ─────────────────────────────────────────────────────────
 * Run this instead of GitHub Pages to get:
 *   ✅ Real public https:// video URLs
 *   ✅ Discord inline video autoplay embeds
 *   ✅ Lossless quality (zero re-encoding)
 *   ✅ Original FPS preserved
 *   ✅ HTTP Range requests (seeking works perfectly)
 *   ✅ Correct Content-Type headers
 *
 * HOW TO RUN:
 *   npm install express multer cors
 *   node server.js
 *   → Open http://localhost:3000
 *
 * HOW TO DEPLOY (free):
 *   Railway.app: connect GitHub repo → auto deploys
 *   Render.com:  free tier, connect GitHub repo
 *   VPS:         node server.js + nginx reverse proxy
 * ─────────────────────────────────────────────────────────
 */

const express  = require('express');
const multer   = require('multer');
const cors     = require('cors');
const path     = require('path');
const fs       = require('fs');
const crypto   = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ── Directories ── */
const VIDEOS_DIR = path.join(__dirname, 'videos');
const META_FILE  = path.join(__dirname, 'videos', 'meta.json');
if (!fs.existsSync(VIDEOS_DIR)) fs.mkdirSync(VIDEOS_DIR, { recursive: true });

/* ── Load/save metadata ── */
function loadMeta() {
  try { return JSON.parse(fs.readFileSync(META_FILE, 'utf8')); } catch { return {}; }
}
function saveMeta(meta) {
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));
}

/* ── Multer: save with original extension, original quality ── */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, VIDEOS_DIR),
  destination: VIDEOS_DIR,
  filename: (req, file, cb) => {
    const id  = crypto.randomBytes(4).toString('hex');
    const ext = path.extname(file.originalname) || '.mp4';
    req.videoId = id;
    cb(null, id + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 4 * 1024 * 1024 * 1024 }, // 4 GB max
});

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // serve HTML/CSS/JS

/* ── Serve videos with Range support (needed for Discord + seeking) ── */
app.get('/videos/:filename', (req, res) => {
  const filePath = path.join(VIDEOS_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');

  const stat     = fs.statSync(filePath);
  const fileSize = stat.size;
  const range    = req.headers.range;

  // Detect MIME type from extension
  const ext  = path.extname(filePath).toLowerCase();
  const mime = {
    '.mp4':  'video/mp4',
    '.webm': 'video/webm',
    '.mov':  'video/quicktime',
    '.avi':  'video/x-msvideo',
    '.mkv':  'video/x-matroska',
    '.m4v':  'video/mp4',
    '.ogv':  'video/ogg',
  }[ext] || 'video/mp4';

  if (range) {
    // HTTP Range request — required for seeking and Discord embeds
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end   = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunk = end - start + 1;

    res.writeHead(206, {
      'Content-Range':  `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges':  'bytes',
      'Content-Length': chunk,
      'Content-Type':   mime,
      'Cache-Control':  'public, max-age=31536000',
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type':   mime,
      'Accept-Ranges':  'bytes',
      'Cache-Control':  'public, max-age=31536000',
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

/* ── Upload endpoint ── */
app.post('/api/upload', upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });

  const meta    = loadMeta();
  const id      = req.videoId || path.basename(req.file.filename, path.extname(req.file.filename));
  const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
  const videoUrl = `${baseUrl}/videos/${req.file.filename}`;

  meta[id] = {
    id,
    name:     req.file.originalname,
    filename: req.file.filename,
    size:     req.file.size,
    type:     req.file.mimetype,
    ts:       Date.now(),
    views:    0,
    videoUrl,
    watchUrl: `${baseUrl}/watch.html?v=${id}`,
  };

  saveMeta(meta);

  res.json({
    id,
    videoUrl,
    watchUrl: `${baseUrl}/watch.html?v=${id}`,
    name:     req.file.originalname,
    size:     req.file.size,
  });
});

/* ── Get video metadata ── */
app.get('/api/video/:id', (req, res) => {
  const meta = loadMeta();
  const v    = meta[req.params.id];
  if (!v) return res.status(404).json({ error: 'Not found' });

  // Increment views
  v.views = (v.views || 0) + 1;
  saveMeta(meta);

  res.json(v);
});

/* ── List all videos ── */
app.get('/api/videos', (req, res) => {
  const meta = loadMeta();
  res.json(Object.values(meta).sort((a, b) => b.ts - a.ts));
});

/* ── Delete video ── */
app.delete('/api/video/:id', (req, res) => {
  const meta = loadMeta();
  const v    = meta[req.params.id];
  if (!v) return res.status(404).json({ error: 'Not found' });

  const filePath = path.join(VIDEOS_DIR, v.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  delete meta[req.params.id];
  saveMeta(meta);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`\n✅ Streamable V2 running at http://localhost:${PORT}`);
  console.log(`   Videos saved to: ${VIDEOS_DIR}`);
  console.log(`   Discord embeds:  ENABLED (real HTTP video URLs)\n`);
});
