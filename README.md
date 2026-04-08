# Streamable V2

Self-hosted Streamable clone. Upload → get link → share → plays in Discord.

---

## ❓ WHY DISCORD DOESN'T SHOW INLINE VIDEO (and the real fix)

Discord reads the `og:video` meta tag from your page URL and fetches that video URL **from Discord's own servers**.

Videos uploaded here are stored in your **browser's IndexedDB** as binary blobs. When played, they become `blob://` URLs. **Discord's servers cannot reach `blob://` URLs. They are local browser memory only.**

This is not a bug — it is a fundamental browser security feature.

### What works on GitHub Pages
| Feature | Works? |
|---------|--------|
| Upload videos | ✅ |
| Watch page loads | ✅ |
| Share link (opens watch page) | ✅ |
| Discord card embed (title + description) | ✅ |
| Discord **inline video autoplay** | ❌ Not possible |

### ✅ Real fix: Run the Node.js server

When you run `server.js`, videos are saved as real `.mp4` files on disk and the server returns real `https://` URLs. Discord can fetch and embed them inline.

---

## Option A: Local + ngrok (test Discord embeds instantly)

```bash
npm install
node server.js
# open new terminal:
npx ngrok http 3000
# copy the https://xxx.ngrok.io URL, then:
BASE_URL=https://xxx.ngrok.io node server.js
```
Upload a video → paste the watch link in Discord → inline video plays ✅

---

## Option B: Railway.app (free permanent hosting)

1. Push repo to GitHub
2. [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
3. Add env var: `BASE_URL=https://YOUR-APP.railway.app`
4. Done ✅

---

## Option C: Render.com (free)

1. Push to GitHub
2. [render.com](https://render.com) → New Web Service → connect repo
3. Build: `npm install` · Start: `node server.js`
4. Add env var: `BASE_URL=https://YOUR-APP.onrender.com`

---

## Option D: GitHub Pages only

Just push the 4 frontend files (`index.html`, `watch.html`, `style.css`, `app.js`).
You get shareable links and Discord card embeds — no inline video.

---

## Video quality

**Zero re-encoding.** Stored and served byte-for-byte. Original codec, FPS, bitrate, resolution.
The processing step only reads metadata. Nothing is changed.

---

## Files

```
index.html    — main upload page
watch.html    — video player page  
style.css     — Streamable-accurate light theme
app.js        — frontend logic
server.js     — Node.js backend (real file storage + Discord embeds)
package.json  — npm deps (express, multer, cors)
videos/       — created automatically by server
```
