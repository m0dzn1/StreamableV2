/* ============================================================
   StreamVault — app.js
   Handles: upload, indexedDB storage, link gen, watch page
   ============================================================ */

'use strict';

// ── IndexedDB wrapper ──────────────────────────────────────
const DB_NAME   = 'streamvault';
const DB_VER    = 1;
const STORE     = 'videos';

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

async function saveVideo(record) {
  const db  = await openDB();
  const tx  = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put(record);
  return new Promise((res, rej) => {
    tx.oncomplete = res;
    tx.onerror    = e => rej(e.target.error);
  });
}

async function getVideo(id) {
  const db  = await openDB();
  const tx  = db.transaction(STORE, 'readonly');
  const req = tx.objectStore(STORE).get(id);
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror   = e => rej(e.target.error);
  });
}

async function getAllVideos() {
  const db  = await openDB();
  const tx  = db.transaction(STORE, 'readonly');
  const req = tx.objectStore(STORE).getAll();
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result || []);
    req.onerror   = e => rej(e.target.error);
  });
}

// ── ID generator ──────────────────────────────────────────
function genId(len = 8) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(len)))
    .map(b => chars[b % chars.length]).join('');
}

// ── Format helpers ────────────────────────────────────────
function fmtSize(bytes) {
  if (bytes < 1024)       return bytes + ' B';
  if (bytes < 1048576)    return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(2) + ' GB';
}

function fmtDuration(sec) {
  if (!sec || isNaN(sec)) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  });
}

// ── Upload logic ──────────────────────────────────────────
let currentObjectURL = null;

function resetUpload() {
  document.getElementById('linkResult').style.display  = 'none';
  document.getElementById('uploadProgress').style.display = 'none';
  document.getElementById('fileInput').value = '';
  if (currentObjectURL) {
    URL.revokeObjectURL(currentObjectURL);
    currentObjectURL = null;
  }
}

async function handleFile(file) {
  if (!file || !file.type.startsWith('video/')) {
    alert('Please select a valid video file.');
    return;
  }

  // Show progress
  const progress  = document.getElementById('uploadProgress');
  const fillEl    = document.getElementById('progressFill');
  const pctEl     = document.getElementById('progressPercent');
  const metaEl    = document.getElementById('progressMeta');
  const nameEl    = document.getElementById('progressFileName');

  progress.style.display = 'block';
  nameEl.textContent      = file.name;
  metaEl.textContent      = `Reading file — ${fmtSize(file.size)}`;

  // Simulate progress while reading
  let pct = 0;
  const ticker = setInterval(() => {
    pct = Math.min(pct + Math.random() * 4, 88);
    fillEl.style.width  = pct + '%';
    pctEl.textContent   = Math.round(pct) + '%';
  }, 80);

  try {
    // Read file as ArrayBuffer for storage
    const buffer = await file.arrayBuffer();

    clearInterval(ticker);
    fillEl.style.width = '95%';
    pctEl.textContent  = '95%';
    metaEl.textContent = 'Saving to local storage...';

    const id  = genId();
    const url = URL.createObjectURL(new Blob([buffer], { type: file.type }));
    currentObjectURL = url;

    // Get video metadata
    const meta = await getVideoMeta(url);

    // Build record
    const record = {
      id,
      name:      file.name,
      size:      file.size,
      type:      file.type,
      ts:        Date.now(),
      duration:  meta.duration,
      width:     meta.width,
      height:    meta.height,
      data:      buffer,
    };

    await saveVideo(record);

    fillEl.style.width = '100%';
    pctEl.textContent  = '100%';
    metaEl.textContent = 'Done!';

    await sleep(400);
    progress.style.display = 'none';

    showResult(record, url);
    loadRecentGrid();

  } catch (err) {
    clearInterval(ticker);
    console.error(err);
    metaEl.textContent = '✕ Error: ' + err.message;
  }
}

function getVideoMeta(url) {
  return new Promise(resolve => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      resolve({ duration: v.duration, width: v.videoWidth, height: v.videoHeight });
    };
    v.onerror = () => resolve({ duration: 0, width: 0, height: 0 });
    v.src = url;
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Show result ───────────────────────────────────────────
function showResult(record, blobUrl) {
  const section = document.getElementById('linkResult');
  section.style.display = 'block';
  section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  // Build watch URL
  const watchUrl = `${location.origin}${location.pathname.replace('index.html','').replace(/\/$/, '')}/watch.html?v=${record.id}`;

  document.getElementById('resultFilename').textContent = record.name;
  document.getElementById('resultMeta').textContent =
    `${fmtSize(record.size)}  ·  ${fmtDuration(record.duration)}  ·  ${record.width}×${record.height}  ·  ${record.type}`;

  const input = document.getElementById('shareLink');
  input.value = watchUrl;

  // Discord preview
  document.getElementById('discordLinkText').textContent = watchUrl;

  const previewVid = document.getElementById('discordPreviewVideo');
  const placeholder = document.getElementById('discordPlaceholder');
  if (blobUrl) {
    previewVid.src     = blobUrl;
    previewVid.style.display = 'block';
    placeholder.style.display = 'none';
  }

  // Watch button
  document.getElementById('watchLink').href = watchUrl;
}

// ── Copy link ─────────────────────────────────────────────
function copyLink() {
  const input = document.getElementById('shareLink');
  copyText(input.value, document.getElementById('copyBtn'));
}

function copyWatchLink() {
  const input = document.getElementById('watchShareInput');
  copyText(input.value, event.target);
}

function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.textContent;
    btn.textContent = '✓ Copied!';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = orig;
      btn.classList.remove('copied');
    }, 2000);
  });
}

// ── Recent grid ───────────────────────────────────────────
async function loadRecentGrid() {
  const grid = document.getElementById('videoGrid');
  if (!grid) return;

  const videos = await getAllVideos();
  if (!videos.length) {
    grid.innerHTML = '<div class="empty-state">No uploads yet. Drop a video above to get started.</div>';
    return;
  }

  videos.sort((a, b) => b.ts - a.ts);

  grid.innerHTML = '';
  for (const v of videos.slice(0, 20)) {
    const url      = await getBlobUrl(v);
    const watchUrl = `watch.html?v=${v.id}`;
    const card     = document.createElement('a');
    card.className = 'video-card';
    card.href      = watchUrl;
    card.innerHTML = `
      <div class="video-thumb">
        <video src="${url}" preload="metadata" muted></video>
        <div class="video-thumb-overlay"><div class="play-circle">▶</div></div>
      </div>
      <div class="video-card-info">
        <div class="video-card-name">${escHtml(v.name)}</div>
        <div class="video-card-meta">${fmtSize(v.size)} · ${fmtDuration(v.duration)} · ${fmtDate(v.ts)}</div>
      </div>
    `;
    grid.appendChild(card);
  }
}

// Cache blob URLs to avoid re-creating
const blobCache = {};
async function getBlobUrl(record) {
  if (blobCache[record.id]) return blobCache[record.id];
  const url = URL.createObjectURL(new Blob([record.data], { type: record.type }));
  blobCache[record.id] = url;
  return url;
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Watch page init ───────────────────────────────────────
async function initWatchPage() {
  const params = new URLSearchParams(location.search);
  const id     = params.get('v');

  if (!id) { showNotFound(); return; }

  try {
    const record = await getVideo(id);
    if (!record) { showNotFound(); return; }

    // Page title
    document.title = `${record.name} — StreamVault`;
    const ogTitle  = document.getElementById('og-title');
    if (ogTitle) ogTitle.setAttribute('content', record.name);

    // Set video source
    const url = await getBlobUrl(record);
    const vid = document.getElementById('mainVideo');
    vid.src   = url;

    // Title & info
    document.getElementById('videoTitle').textContent = record.name;
    document.getElementById('videoStats').innerHTML = `
      <span class="stat-item"><strong>${fmtSize(record.size)}</strong> size</span>
      <span class="stat-item"><strong>${fmtDuration(record.duration)}</strong> duration</span>
      <span class="stat-item"><strong>${record.width}×${record.height}</strong> resolution</span>
      <span class="stat-item"><strong>${record.type.split('/')[1]?.toUpperCase() || 'VIDEO'}</strong> format</span>
      <span class="stat-item"><strong>${fmtDate(record.ts)}</strong> uploaded</span>
    `;

    // Share link
    const shareInput = document.getElementById('watchShareInput');
    if (shareInput) shareInput.value = location.href;

    // OG tags for Discord
    const ogVideo = document.getElementById('og-video');
    if (ogVideo) ogVideo.setAttribute('content', url);

  } catch (err) {
    console.error(err);
    showNotFound();
  }
}

function showNotFound() {
  const content  = document.getElementById('watchContent');
  const notFound = document.getElementById('notFound');
  if (content)  content.style.display  = 'none';
  if (notFound) notFound.style.display  = 'flex';
}

// ── Drop zone setup ───────────────────────────────────────
function setupDropzone() {
  const zone  = document.getElementById('dropzone');
  const input = document.getElementById('fileInput');
  if (!zone) return;

  zone.addEventListener('click', () => input.click());

  zone.addEventListener('dragover', e => {
    e.preventDefault();
    zone.classList.add('drag-over');
  });

  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));

  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  input.addEventListener('change', () => {
    if (input.files[0]) handleFile(input.files[0]);
  });
}

// ── Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupDropzone();
  loadRecentGrid();
});
