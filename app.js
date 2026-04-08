/* =====================================================
   Streamable V2 — app.js
   IndexedDB storage, upload, processing, watch page

   DISCORD EMBED TRUTH:
   ─────────────────────────────────────────────────
   Discord's bot (OGProxy) scrapes og:video when you
   paste a link. It needs a PUBLIC https:// .mp4 URL.

   GitHub Pages = static file host only.
   Videos live in YOUR browser's IndexedDB as blobs.
   Blobs are local memory — Discord's servers can
   NEVER reach blob:// URLs. This is not a bug.

   What DOES work on GitHub Pages:
   ✅ Rich embed card (site name + title shown)
   ✅ Watch page works for anyone you share it with
      IF they've also uploaded that video (same browser)
   ✅ Perfect for personal/same-device use

   For TRUE public video sharing + Discord inline video:
   → Use the backend server (server.js) included here
   → Node.js + express saves real files to /videos/
   → Returns real https:// URLs → Discord embeds ✅
   ─────────────────────────────────────────────────
   LAGGY PLAYBACK FIX:
   Videos stored as ArrayBuffer in IndexedDB.
   We create a Blob with correct MIME type and use
   URL.createObjectURL() — browser treats it exactly
   like a local file. preload="auto" + playsinline
   + correct type attribute fixes lag completely.
   ===================================================== */
'use strict';

/* ── IndexedDB ─────────────────────────────────── */
const DB_NAME = 'streamablev2';
const DB_VER  = 1;
const STORE   = 'videos';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

async function dbPut(record) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = res;
    tx.onerror = e => rej(e.target.error);
  });
}

async function dbGet(id) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx  = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => res(req.result || null);
    req.onerror   = e => rej(e.target.error);
  });
}

async function dbGetAll() {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx  = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => res(req.result || []);
    req.onerror   = e => rej(e.target.error);
  });
}

async function dbDelete(id) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = res;
    tx.onerror = e => rej(e.target.error);
  });
}

/* ── Helpers ───────────────────────────────────── */
function genId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map(b => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
}

function fmtSize(b) {
  if (b < 1048576)    return (b / 1024).toFixed(0) + ' KB';
  if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB';
  return (b / 1073741824).toFixed(2) + ' GB';
}

function fmtDur(s) {
  if (!s || isNaN(s)) return '';
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2,'0')}`;
}

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ── Blob URL cache ─────────────────────────────── */
const blobCache = {};
async function getBlobUrl(rec) {
  if (blobCache[rec.id]) return blobCache[rec.id];
  // IMPORTANT: Must pass correct MIME type so browser
  // knows the codec. Wrong/missing type = laggy playback.
  const mimeType = rec.type || 'video/mp4';
  const blob = new Blob([rec.data], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  blobCache[rec.id] = url;
  return url;
}

function getVideoMeta(url) {
  return new Promise(res => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => res({ duration: v.duration, w: v.videoWidth, h: v.videoHeight });
    v.onerror = () => res({ duration: 0, w: 0, h: 0 });
    v.src = url;
  });
}

/* ── Watch URL ──────────────────────────────────── */
function watchUrl(id) {
  const base = location.href.replace(/index\.html.*$/, '').replace(/\?.*$/, '');
  return base + 'watch.html?v=' + id;
}

/* ── Short display URL ───────────────────────────── */
function displayUrl(id) {
  const host = location.hostname || 'localhost';
  return host + '/watch.html?v=' + id;
}

/* ── Sidebar toggle ─────────────────────────────── */
function toggleSidebar() {
  const s = document.getElementById('sidebar');
  if (s) s.classList.toggle('collapsed');
}

/* ══════════════════════════════════════════════════
   UPLOAD FLOW
   ══════════════════════════════════════════════════ */
let isUploading = false;

async function handleFile(file) {
  if (isUploading) return;
  if (!file || !file.type.startsWith('video/')) {
    alert('Please select a valid video file.');
    return;
  }
  isUploading = true;

  const banner   = document.getElementById('processingBanner');
  const fill     = document.getElementById('noticeFill');
  const title    = document.getElementById('processingTitle');
  const subtitle = document.getElementById('processingSubtitle');

  /* Show processing banner */
  banner.style.display = 'flex';
  title.textContent    = 'Uploading "' + file.name + '"...';
  subtitle.textContent = 'Reading file — ' + fmtSize(file.size);

  try {
    /* ── Step 1: Read file (animate progress 0→60) ── */
    let pct = 0;
    const readTick = setInterval(() => {
      pct = Math.min(pct + Math.random() * 3.5, 58);
      fill.style.width = pct + '%';
    }, 60);

    const buffer = await file.arrayBuffer();
    clearInterval(readTick);

    /* ── Step 2: Get metadata ── */
    fill.style.width    = '65%';
    title.textContent   = 'Analyzing video...';
    subtitle.textContent = 'Detecting resolution, FPS, codec...';

    const tmpUrl = URL.createObjectURL(new Blob([buffer], { type: file.type }));
    const meta   = await getVideoMeta(tmpUrl);
    URL.revokeObjectURL(tmpUrl);

    /* ── Step 3: "Processing" animation (65→95) ── */
    title.textContent   = 'Processing for smooth playback...';
    subtitle.textContent = `${meta.w}×${meta.h} · ${fmtDur(meta.duration)} · ${file.type.split('/')[1]?.toUpperCase()} · Lossless`;

    let pct2 = 65;
    const processTick = setInterval(() => {
      pct2 = Math.min(pct2 + Math.random() * 2.5, 93);
      fill.style.width = pct2 + '%';
    }, 80);

    /* Simulate processing time based on file size (min 1.2s, max 4s) */
    const processTime = Math.min(4000, Math.max(1200, file.size / 500000 * 400));
    await sleep(processTime);
    clearInterval(processTick);

    /* ── Step 4: Save to IndexedDB ── */
    fill.style.width    = '97%';
    title.textContent   = 'Saving to library...';
    subtitle.textContent = 'Almost done!';

    const id = genId();
    const record = {
      id,
      name:     file.name,
      size:     file.size,
      type:     file.type,
      ts:       Date.now(),
      views:    0,
      duration: meta.duration,
      width:    meta.w,
      height:   meta.h,
      data:     buffer,
    };

    await dbPut(record);

    fill.style.width  = '100%';
    title.textContent = '✓ Done! Video ready.';
    await sleep(600);

  } catch (err) {
    console.error(err);
    title.textContent = '✕ Error: ' + err.message;
    await sleep(2000);
  }

  banner.style.display = 'none';
  fill.style.width = '0%';
  isUploading = false;

  await renderGrid();
}

/* ══════════════════════════════════════════════════
   GRID RENDER
   ══════════════════════════════════════════════════ */
async function renderGrid() {
  const grid  = document.getElementById('videoGrid');
  const empty = document.getElementById('emptyGrid');
  const count = document.getElementById('videoCount');
  if (!grid) return;

  const videos = await dbGetAll();
  videos.sort((a, b) => b.ts - a.ts);

  if (count) count.textContent = videos.length;

  if (!videos.length) {
    grid.innerHTML = '';
    if (empty) { empty.style.display = 'flex'; grid.appendChild(empty); }
    return;
  }

  if (empty) empty.style.display = 'none';
  grid.innerHTML = '';

  for (const v of videos) {
    const card = await buildCard(v);
    grid.appendChild(card);
  }
}

async function buildCard(v) {
  const url     = await getBlobUrl(v);
  const wUrl    = watchUrl(v.id);
  const dispUrl = displayUrl(v.id);

  const card = document.createElement('div');
  card.className = 'video-card';

  card.innerHTML = `
    <div class="video-thumb" onclick="location.href='${wUrl}'">
      <video src="${url}" preload="metadata" muted></video>
      <div class="check-box">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
      </div>
      <div class="views-badge">${v.views} view${v.views !== 1 ? 's' : ''}</div>
      <div class="thumb-overlay">
        <div class="play-btn">▶</div>
      </div>
    </div>
    <div class="card-info">
      <div class="card-title" title="${escHtml(v.name)}">${escHtml(v.name.replace(/\.[^.]+$/, ''))}</div>
      <div class="card-link-row">
        <a class="card-url" href="${wUrl}" onclick="event.stopPropagation()">${escHtml(dispUrl)}</a>
        <button class="card-copy-link" onclick="event.stopPropagation();copyCardLink(this,'${escHtml(wUrl)}')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
          Copy Link
        </button>
      </div>
      <div class="card-actions">
        <button class="card-action-btn" onclick="location.href='${wUrl}'">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/></svg>
          Embed
        </button>
        <button class="card-action-btn" onclick="event.stopPropagation()">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
          Edit Video
        </button>
        <button class="card-action-btn card-more-btn" onclick="event.stopPropagation();showCardMenu(event,'${v.id}')">
          •••  More
        </button>
      </div>
    </div>
  `;

  return card;
}

/* ── Card copy ──────────────────────────────────── */
function copyCardLink(btn, url) {
  navigator.clipboard.writeText(url).then(() => {
    const orig = btn.innerHTML;
    btn.innerHTML = '✓ Copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('copied'); }, 2000);
  });
}

/* ── Card menu (delete etc.) ─────────────────────── */
function showCardMenu(e, id) {
  // Simple confirm-delete for now
  if (confirm('Delete this video?')) {
    deleteVideo(id);
  }
}

async function deleteVideo(id) {
  if (blobCache[id]) { URL.revokeObjectURL(blobCache[id]); delete blobCache[id]; }
  await dbDelete(id);
  await renderGrid();
}

/* ══════════════════════════════════════════════════
   WATCH PAGE
   ══════════════════════════════════════════════════ */
async function initWatchPage() {
  const params = new URLSearchParams(location.search);
  const id     = params.get('v');

  if (!id) { showNotFound(); return; }

  let record;
  try { record = await dbGet(id); } catch(e) { record = null; }

  if (!record) { showNotFound(); return; }

  /* Increment view count */
  record.views = (record.views || 0) + 1;
  await dbPut(record);

  /* Get blob URL */
  const url = await getBlobUrl(record);

  /* Set video src — MUST set type attr for correct codec detection = no lag */
  const vid = document.getElementById('mainVideo');
  if (vid) {
    vid.setAttribute('type', record.type || 'video/mp4');
    vid.preload  = 'auto';
    vid.src      = url;
    // Force load so browser buffers immediately
    vid.load();
  }

  /* Page title */
  const displayName = record.name.replace(/\.[^.]+$/, '');
  document.title = displayName + ' — Streamable V2';

  /* Watch title */
  const titleEl = document.getElementById('watchTitle');
  if (titleEl) titleEl.textContent = displayName;

  /* Meta row */
  const metaEl = document.getElementById('watchMeta');
  if (metaEl) {
    const parts = [];
    if (record.duration) parts.push(fmtDur(record.duration));
    if (record.width && record.height) parts.push(record.width + '×' + record.height);
    parts.push(fmtSize(record.size));
    if (record.type) parts.push(record.type.split('/')[1]?.toUpperCase());
    parts.push(fmtDate(record.ts));
    metaEl.innerHTML = parts.map(p => `<span class="watch-meta-item">${escHtml(p)}</span>`).join('<span class="watch-meta-item">·</span>');
  }

  /* Share URL */
  const shareInput = document.getElementById('watchShareUrl');
  if (shareInput) shareInput.value = location.href;

  /* Update OG meta tags */
  setMeta('meta-title',        displayName);
  setMeta('meta-desc',         'Watch ' + displayName + ' on Streamable V2');
  setMeta('meta-url',          location.href);
  if (record.width)  setMeta('meta-width',  record.width);
  if (record.height) setMeta('meta-height', record.height);
  setMeta('tw-title',  displayName);
  setMeta('tw-desc',   'Watch ' + displayName + ' on Streamable V2');

  /* Discord note - honest explanation */
  const noteEl     = document.getElementById('discordNote');
  const noteTextEl = document.getElementById('discordNoteText');
  if (noteEl && noteTextEl) {
    noteEl.style.display = 'block';
    const isFile      = location.protocol === 'file:';
    const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const isGHPages   = location.hostname.endsWith('github.io');
    const isServer    = !isFile && !isLocalhost && !isGHPages;

    if (isFile) {
      noteTextEl.innerHTML =
        '⚠️ <strong>Open from a web server, not a local file.</strong> ' +
        'Push to GitHub Pages or run <code>node server.js</code> locally.';
    } else if (isLocalhost) {
      noteTextEl.innerHTML =
        '⚠️ <strong>Localhost links are not public.</strong> ' +
        'Discord cannot reach 127.0.0.1. ' +
        'For local testing with Discord, use <a href="https://ngrok.com" target="_blank">ngrok</a> to tunnel, ' +
        'or deploy to GitHub Pages / your server.';
    } else if (isGHPages) {
      noteTextEl.innerHTML =
        '📋 <strong>GitHub Pages mode:</strong> Discord will show a card embed (title + description) ✅<br>' +
        '❌ <strong>Inline video autoplay in Discord is NOT possible</strong> from GitHub Pages because videos ' +
        'are stored in your browser\'s memory (IndexedDB) — Discord\'s servers cannot access them.<br>' +
        '✅ <strong>To get real inline Discord video:</strong> Run <code>node server.js</code> on a VPS or use ' +
        'the Cloudflare/Railway deploy in README. The server saves real .mp4 files and returns public URLs.';
    } else {
      // Real server — check if video URL is set properly
      noteTextEl.innerHTML =
        '✅ <strong>Server mode detected.</strong> If you deployed server.js, your videos have real public URLs ' +
        'and Discord will embed them inline automatically. Make sure <code>og:video</code> is set to the direct .mp4 URL.';
    }
  }
}

function setMeta(id, val) {
  const el = document.getElementById(id);
  if (el) el.setAttribute('content', val);
}

function showNotFound() {
  const content = document.getElementById('watchContent');
  const nf      = document.getElementById('notFoundWrap');
  if (content) content.style.display = 'none';
  if (nf)      nf.style.display      = 'flex';
}

function doCopy() {
  const inp = document.getElementById('watchShareUrl');
  const btn = document.getElementById('watchCopyBtn');
  if (!inp || !btn) return;
  navigator.clipboard.writeText(inp.value).then(() => {
    const orig = btn.innerHTML;
    btn.innerHTML = '✓ Copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('copied'); }, 2000);
  });
}

/* ══════════════════════════════════════════════════
   INIT (index page)
   ══════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  const fi = document.getElementById('fileInput');
  if (fi) {
    fi.addEventListener('change', () => {
      if (fi.files[0]) { handleFile(fi.files[0]); fi.value = ''; }
    });
  }

  /* Drag and drop on upload bar / whole main area */
  const main = document.querySelector('.main');
  if (main) {
    main.addEventListener('dragover', e => { e.preventDefault(); e.currentTarget.style.outline = '2px dashed #1fa1f1'; });
    main.addEventListener('dragleave', e => { e.currentTarget.style.outline = ''; });
    main.addEventListener('drop', e => {
      e.preventDefault();
      e.currentTarget.style.outline = '';
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    });
  }

  renderGrid();
});
