# Streamable V2

This is a pixel-perfect clone of Streamable built for speed and simplicity. You can upload videos, grab shareable links, and get rich embed cards for Discord. 

## 📂 Project Structure

* **index.html:** The dashboard where you’ll handle uploads and view your video grid.
* **watch.html:** The dedicated player page with a built-in share panel.
* **style.css:** Custom CSS designed to match Streamable’s iconic light theme.
* **app.js:** The "brain" of the app. It handles IndexedDB storage, upload logic, and video processing.

---

## 🚀 Launching on GitHub Pages

Setting this up is straightforward:
1.  Push these 4 files to a new GitHub repository.
2.  Head to **Settings** → **Pages**.
3.  Select **Deploy from branch**, choose `main`, and set the folder to `/ (root)`.
4.  Your site will be live at: `https://USERNAME.github.io/REPO_NAME/`

---

## 💡 The "Discord Embed" Situation

You might notice that while Discord shows a nice preview card, it won't play the video directly in the chat. **This isn't a bug in the code**—it’s just how the web works.

### The Technical "Why"
When you upload a video here, it’s stored in your browser’s **IndexedDB** as a `blob://` URL. These URLs are temporary and local to *your* machine. Since Discord’s servers can't reach into your browser's memory to grab the file, they can’t "see" the video data to play it inline.

### What to expect on GitHub Pages:
* ✅ **Rich Previews:** Discord will still show your site name, title, and description.
* ✅ **Easy Sharing:** The link works perfectly for anyone who has that video data saved locally.
* ❌ **No Inline Play:** Discord cannot auto-play the video because the file isn't hosted on a public server.

---

## 🛠️ How to get "Real" Inline Embeds

If you want those native Discord plays, you'll need a backend to host the actual files. Here are the best ways to do it:

### 1. Cloudflare R2 (The Pro Choice)
This is my top recommendation. It's essentially free for small projects.
* Set up an R2 bucket and a Cloudflare Worker.
* Modify `app.js` to send the file to your Worker instead of IndexedDB.
* The Worker returns a public `https://` link that Discord can actually read.

### 2. Supabase Storage (Easiest to Code)
If you don't want to mess with Workers, use the Supabase JS SDK. 
* They give you 1GB for free, which is plenty for a personal clone.
* It provides permanent URLs out of the box.

### 3. A Simple VPS (The Old School Way)
If you have a Linux box running Nginx, just point a directory to your video folder. Just make sure you enable `Accept-Ranges` in your Nginx config so Discord can "scrub" through the video timeline.

---

## 🎬 Video Quality Note

I designed this to keep your footage pristine. There is **zero re-encoding or compression.** When you see the "processing" bar, the app is just indexing metadata—the actual video bytes are stored exactly as you recorded them. Original FPS, original bitrate, no loss.
