# Drive Videos

A minimal Google Drive video viewer. It automatically scans the configured folder and all nested folders when the page opens. The status line at the top shows whether the scan is working, how many folders/videos have been checked, and any errors.

## One-time setup

1. Open `config.js` in a text editor.
2. Paste your shared Google Drive folder URL into `folderUrl`.
3. Paste your Google API key into `apiKey`.
4. Save the file.
5. Open the site using a local web server (see below).

## Run locally

From this folder, run:

```bash
python -m http.server 8000
```

Then open http://localhost:8000 in your browser. The page automatically scans on load. Use **Rescan** to scan again.

## Google Drive requirements

- Enable the Google Drive API in your Google Cloud project.
- For the API-key-only setup, the root folder and nested folders/files must be accessible to anyone with the link. A standard API key cannot access a private Drive folder. Private Drive content requires an OAuth-based sign-in flow, which this simple static version does not include.
- Restrict your API key to the Google Drive API and, once deployed, to your website's HTTP referrers. The key is visible in client-side files, so do not treat it as a secret.

## Playback notes

Videos play in Google's Drive preview player. Playback depends on the file's sharing permissions and Google's preview/transcoding support. Only one video plays at a time.
