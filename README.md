# StreamVault 🎬

A self-hosted video upload & sharing platform. Upload videos, get shareable links, and play directly in Discord embeds — original quality, zero compression.

## Features

- **Drag & drop** video upload (MP4, MOV, WebM, AVI, MKV, and more)
- **Lossless storage** — videos stored in original quality, no re-encoding
- **Shareable links** — each video gets a unique `/watch.html?v=ID` URL
- **Discord embeds** — paste the link in Discord and it previews inline
- **Local IndexedDB storage** — no server needed for basic use
- **Recent uploads grid** with thumbnails
- **Zero dependencies** — pure HTML, CSS, JavaScript

---

## 🚀 Quick Start (GitHub Pages)

### 1. Fork / Clone this repo

```bash
git clone https://github.com/YOUR_USERNAME/streamvault.git
cd streamvault
```

### 2. Enable GitHub Pages

- Go to your repo → **Settings** → **Pages**
- Set source to **Deploy from branch** → `main` → `/ (root)`
- Click **Save**

Your site will be live at:
```
https://YOUR_USERNAME.github.io/streamvault/
```

### 3. Upload videos

Visit your GitHub Pages URL, drag & drop a video, and copy the share link!

---

## 📌 Important: How Storage Works

By default, StreamVault uses **browser IndexedDB** — videos are stored locally in your browser. This means:

| ✅ Works | ❌ Doesn't work |
|----------|----------------|
| Sharing links with yourself | Links shared to other people |
| Watching on same browser | Watching on different devices |
| Discord embed preview (for you) | Others playing the embed |

### For true public sharing → Use a backend

To share videos publicly (like Streamable), you need a file server. Two easy options:

---

## 🌐 Backend Options for Public Sharing

### Option A: Cloudflare R2 + Workers (Free tier, recommended)

1. Create a [Cloudflare account](https://cloudflare.com)
2. Create an **R2 bucket** (free up to 10GB/month)
3. Create a **Worker** that handles upload and serve:

```js
// Worker pseudocode
export default {
  async fetch(request, env) {
    if (request.method === 'PUT') {
      // Upload: PUT /upload/VIDEO_ID
      await env.R2_BUCKET.put(videoId, request.body);
      return new Response(JSON.stringify({ id: videoId, url: serveUrl }));
    }
    if (request.method === 'GET') {
      // Serve: GET /v/VIDEO_ID
      const obj = await env.R2_BUCKET.get(videoId);
      return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata.contentType }});
    }
  }
}
```

4. In `app.js`, replace the `saveVideo` / `getBlobUrl` functions to call your Worker URL instead of IndexedDB.

---

### Option B: Express.js + Local Storage (Self-hosted VPS)

```bash
npm install express multer cors
```

```js
// server.js
const express = require('express');
const multer  = require('multer');
const path    = require('path');
const app     = express();

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 4 * 1024 * 1024 * 1024 } // 4GB
});

app.use(express.static('.'));
app.use('/uploads', express.static('uploads'));

app.post('/api/upload', upload.single('video'), (req, res) => {
  const id = require('crypto').randomBytes(4).toString('hex');
  res.json({ id, url: `/uploads/${req.file.filename}` });
});

app.get('/api/video/:id', (req, res) => {
  // Return metadata from a simple JSON store
});

app.listen(3000, () => console.log('StreamVault running on :3000'));
```

Then update the frontend API calls in `app.js` to point to your server.

---

## 🎮 Discord Embed Requirements

For videos to embed natively in Discord (auto-play without clicking the link), the video URL must:

1. Be a **direct video file URL** (`.mp4`, `.webm`, etc.)
2. Have proper `Content-Type: video/mp4` headers
3. Support **HTTP Range Requests** (for seeking)
4. Have `og:video` meta tags set correctly

Both Cloudflare R2 and a proper Express server handle all of these automatically.

---

## 📁 File Structure

```
streamvault/
├── index.html      # Upload page
├── watch.html      # Video player page
├── style.css       # All styles
├── app.js          # Upload, storage, watch logic
└── README.md       # This file
```

---

## 🔧 Customization

| Variable | Location | Description |
|----------|----------|-------------|
| `--accent` | `style.css :root` | Accent color (default: lime yellow) |
| `--bg` | `style.css :root` | Background color |
| `DB_NAME` | `app.js` | IndexedDB database name |
| `genId(len)` | `app.js` | Change video ID length |

---

## License

MIT — do whatever you want with it.
