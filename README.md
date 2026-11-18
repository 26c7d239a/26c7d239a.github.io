# Drive Video Library (vanilla)

A static HTML/CSS/JavaScript site that recursively scans a shared Google Drive folder, finds video files, and plays selected files using Drive's embedded preview.

## 1. Configure Google Drive API

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project.
3. Enable **Google Drive API** for the project.
4. Create an API key under **APIs & Services → Credentials**.
5. Restrict the key to the Google Drive API and, when deployed, to your website's HTTP referrers.

The key is entered in the page at runtime. Do not hard-code a personal key into `app.js` or commit it to a public repository.

## 2. Share the folder

For the API-key-only version, the root folder and its contents must be readable by anyone with the link. Google Drive permissions may be inherited, but check nested folders if any items are missing.

Private folders require an OAuth-based sign-in flow instead of a simple API key. Do not make private content public just to use this demo.

## 3. Run locally

Because browsers restrict some features on `file://`, serve the folder over localhost. For example, with Python installed:

```bash
python -m http.server 8000
```

Then visit http://localhost:8000.

## 4. Deploy

Upload `index.html`, `styles.css`, and `app.js` to any static host (GitHub Pages, Netlify, Cloudflare Pages, etc.). Add the deployed domain to the API key's HTTP referrer restrictions.

## Notes / limitations

- The scan follows nested folders and handles Drive API pagination.
- It detects files by video MIME type and common video extensions.
- Playback uses Google's `/file/d/FILE_ID/preview` iframe. Google Drive permissions, browser support, and Google's preview/transcoding rules determine whether a particular file plays.
- This is a client-only demo: the API key is visible to visitors in browser developer tools. Restrict it by API and HTTP referrer. For a production site with private folders, use OAuth and preferably a small backend to protect credentials.
- Google Drive is not a general-purpose video CDN; large files, unsupported codecs, download restrictions, or quota limits can prevent playback.
