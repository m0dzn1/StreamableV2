# Streamable V2

A pixel-accurate Streamable clone. Upload videos, get shareable links, embed in Discord.

## Files

```
index.html   — main page (upload + video grid)
watch.html   — video player + share panel
style.css    — Streamable-accurate light theme
app.js       — all logic (IndexedDB, upload, processing, watch page)
```

## Deploy to GitHub Pages

1. Push all 4 files to a GitHub repo
2. Settings → Pages → Deploy from branch → main → / (root)
3. Your URL: `https://USERNAME.github.io/REPO_NAME/`

---

## Why Discord shows embed card but NOT inline video

This is a fundamental web limitation, not a bug in this code.

### How Discord embeds work:
Discord's bot visits your URL and reads `<meta property="og:video" content="...">`.
It then fetches that video URL directly to display inline.

### Why blob:// URLs don't work:
Videos uploaded here are stored in **browser IndexedDB** as binary data and served
as `blob://` URLs (e.g. `blob://localhost/abc123`). These URLs:
- Only exist in YOUR browser's memory
- Cannot be accessed by Discord's servers
- Are destroyed when you close the browser tab

### What DOES work on GitHub Pages:
✅ The share link opens the watch page correctly  
✅ Discord shows a rich embed card (site name + title + description)  
✅ Anyone with the link can watch — IF they have the video saved in their own browser  
❌ Discord cannot auto-play the video inline  

### To get REAL inline Discord embeds:

You need a backend that stores and serves video files over HTTP.

#### Option A: Cloudflare R2 (Free, Recommended)
1. Create Cloudflare account → R2 bucket
2. Deploy a Worker that uploads to R2 and returns a real `https://` URL
3. In `app.js`, replace `dbPut/getBlobUrl` with fetch calls to your Worker
4. The real URL goes in `og:video` meta tag → Discord embeds inline ✅

#### Option B: Any VPS (nginx + node)
```nginx
location /videos/ {
    root /var/www/streamablev2;
    add_header Accept-Ranges bytes;
    add_header Access-Control-Allow-Origin *;
}
```
Upload files to `/var/www/streamablev2/videos/ID.mp4`, return the URL.

#### Option C: Supabase Storage (Free tier)
Use `@supabase/supabase-js` to upload to Supabase Storage bucket.
Returns real `https://` URLs. Free up to 1GB.

---

## Video Quality

Videos are stored **exactly as uploaded** — no re-encoding, no compression,
no quality loss, original FPS preserved. The "processing" step only reads
metadata and indexes the file. The actual video bytes are stored byte-for-byte.
