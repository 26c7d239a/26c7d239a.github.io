const FOLDER_MIME = "application/vnd.google-apps.folder";
const $ = (id) => document.getElementById(id);
const state = { videos: [], selectedId: null, scanning: false };
const CACHE_PREFIX = "drive-video-library-cache-v1:";
const MAX_PARALLEL_FOLDERS = 6;

function extractFolderId(input) {
  const value = (input || "").trim();
  if (/^[a-zA-Z0-9_-]{10,}$/.test(value)) return value;
  const match = value.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (!match) throw new Error("The folder link in config.js is missing or invalid.");
  return match[1];
}

function setStatus(message, kind = "busy") {
  $("status").textContent = message;
  $("statusDot").className = `status-dot ${kind}`;
}

function updateProgress(foldersChecked, foldersQueued, videosFound, pagesLoaded) {
  setStatus(`Scanning… ${foldersChecked} folders checked; ${videosFound} videos found.`, "busy");
  $("scanDetails").textContent =
    `${foldersChecked} folders checked · ${foldersQueued} folders discovered · ${pagesLoaded} Drive pages loaded`;
  $("videoCount").textContent = `${videosFound} video${videosFound === 1 ? "" : "s"}`;
}

async function driveList(apiKey, folderId, pageToken) {
  const params = new URLSearchParams({
    q: `'${folderId}' in parents and trashed = false`,
    fields: "nextPageToken,files(id,name,mimeType)",
    pageSize: "1000",
    key: apiKey
  });
  if (pageToken) params.set("pageToken", pageToken);

  let attempt = 0;
  while (true) {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`);
    const data = await response.json().catch(() => ({}));
    if (response.ok) return data;

    const reason = data?.error?.errors?.[0]?.reason || "";
    const retryable = response.status === 429 || response.status >= 500 ||
      (response.status === 403 && /rateLimit|userRateLimit/i.test(reason));
    if (retryable && attempt < 4) {
      const delay = Math.min(8000, 500 * (2 ** attempt)) + Math.random() * 250;
      await new Promise(resolve => setTimeout(resolve, delay));
      attempt++;
      continue;
    }
    throw new Error(data?.error?.message || `Google Drive returned HTTP ${response.status}.`);
  }
}

function isVideo(file) {
  return (file.mimeType || "").startsWith("video/") ||
    /\.(mp4|m4v|mov|webm|ogv|ogg|avi|mkv|mpeg|mpg)$/i.test(file.name || "");
}

function loadCachedVideos(rootId) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + rootId);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    return Array.isArray(cached) ? cached : null;
  } catch { return null; }
}

function saveCachedVideos(rootId, videos) {
  try { localStorage.setItem(CACHE_PREFIX + rootId, JSON.stringify(videos)); }
  catch { /* Storage may be disabled or full; scanning still works. */ }
}

async function scanTree(apiKey, rootId) {
  const queue = [{ id: rootId, path: "" }];
  const visited = new Set([rootId]);
  const videos = [];
  let nextIndex = 0, foldersChecked = 0, pagesLoaded = 0, lastUiUpdate = 0;

  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= queue.length) return;
      const folder = queue[index];
      let pageToken;
      do {
        const data = await driveList(apiKey, folder.id, pageToken);
        pagesLoaded++;
        for (const file of data.files || []) {
          if (file.mimeType === FOLDER_MIME) {
            if (!visited.has(file.id)) {
              visited.add(file.id);
              queue.push({ id: file.id, path: folder.path ? `${folder.path}/${file.name}` : file.name });
            }
          } else if (isVideo(file)) {
            videos.push({ id: file.id, name: file.name || "Untitled video", path: folder.path });
          }
        }
        pageToken = data.nextPageToken;
      } while (pageToken);

      foldersChecked++;
      const now = Date.now();
      if (now - lastUiUpdate > 150 || foldersChecked === queue.length) {
        updateProgress(foldersChecked, queue.length, videos.length, pagesLoaded);
        lastUiUpdate = now;
      }
    }
  }

  await Promise.all(Array.from({ length: MAX_PARALLEL_FOLDERS }, () => worker()));
  videos.sort((a, b) => a.name.localeCompare(b.name));
  return { videos, foldersChecked, pagesLoaded };
}

async function startScan() {
  if (state.scanning) return;
  state.scanning = true;
  $("scanBtn").disabled = true;
  $("scanDetails").textContent = "";
  setStatus("Checking settings…", "busy");

  try {
    const config = window.DRIVE_LIBRARY_CONFIG || {};
    const apiKey = (config.apiKey || "").trim();
    if (!apiKey || apiKey.startsWith("PASTE_")) throw new Error("Add your Google API key to config.js.");
    if (!config.folderUrl || config.folderUrl.startsWith("PASTE_")) throw new Error("Add your Google Drive folder link to config.js.");
    const rootId = extractFolderId(config.folderUrl);

    const cached = loadCachedVideos(rootId);
    if (cached) {
      state.videos = cached;
      state.selectedId = null;
      renderVideos();
      $("videoCount").textContent = `${cached.length} cached videos`;
      $("scanDetails").textContent = "Showing the last saved video list while checking Drive for updates…";
      setStatus(`Showing saved list (${cached.length} videos); refreshing…`, "busy");
    } else {
      state.videos = [];
      renderVideos();
      setStatus("Connecting to Google Drive…", "busy");
    }

    const result = await scanTree(apiKey, rootId);
    state.videos = result.videos;
    state.selectedId = null;
    saveCachedVideos(rootId, result.videos);
    renderVideos();
    $("videoCount").textContent = `${result.videos.length} videos`;
    $("scanDetails").textContent =
      `Finished: ${result.foldersChecked} folders · ${result.pagesLoaded} Drive pages · ${result.videos.length} videos.`;
    setStatus(result.videos.length ? `Working — ${result.videos.length} videos ready.` : "Scan finished, but no videos were found.", "ok");
  } catch (error) {
    setStatus(`Not working — ${error.message}`, "error");
    $("scanDetails").textContent = "The saved list (if available) is still shown. Check Drive API access, sharing permissions, and your API key.";
    $("videoCount").textContent = `${state.videos.length} videos`;
  } finally {
    state.scanning = false;
    $("scanBtn").disabled = false;
  }
}

function renderVideos() {
  const query = $("searchInput").value.trim().toLowerCase();
  const filtered = state.videos.filter(video =>
    (video.name || "").toLowerCase().includes(query) || (video.path || "").toLowerCase().includes(query)
  );
  const host = $("videoList");
  host.replaceChildren();
  $("emptyState").hidden = filtered.length > 0;
  $("emptyState").textContent = state.videos.length ? "No videos match your search." : "No videos to show yet.";

  for (const video of filtered) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "video-item" + (state.selectedId === video.id ? " selected" : "");
    const play = document.createElement("span");
    play.className = "video-play";
    play.textContent = state.selectedId === video.id ? "▶" : "▷";
    const text = document.createElement("span");
    text.className = "video-text";
    const name = document.createElement("span");
    name.className = "video-name";
    name.textContent = video.name;
    const path = document.createElement("span");
    path.className = "video-path";
    path.textContent = video.path || "Main folder";
    text.append(name, path);
    button.append(play, text);
    button.addEventListener("click", () => playVideo(video));
    host.appendChild(button);
  }
}

function playVideo(video) {
  state.selectedId = video.id;
  const player = $("player");
  player.replaceChildren();
  const iframe = document.createElement("iframe");
  iframe.src = `https://drive.google.com/file/d/${encodeURIComponent(video.id)}/preview`;
  iframe.allow = "autoplay; fullscreen";
  iframe.allowFullscreen = true;
  iframe.title = video.name;
  player.appendChild(iframe);
  $("nowPlaying").textContent = `Playing: ${video.name}`;
  renderVideos();
}

$("scanBtn").addEventListener("click", startScan);
$("searchInput").addEventListener("input", renderVideos);
startScan();
