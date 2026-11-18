const FOLDER_MIME = "application/vnd.google-apps.folder";
const $ = (id) => document.getElementById(id);
const state = { videos: [], selectedId: null, scanning: false };

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

async function driveList(apiKey, folderId, pageToken) {
  const params = new URLSearchParams({
    q: `'${folderId}' in parents and trashed = false`,
    fields: "nextPageToken,files(id,name,mimeType,webViewLink,size,modifiedTime)",
    pageSize: "1000",
    orderBy: "folder,name",
    key: apiKey
  });
  if (pageToken) params.set("pageToken", pageToken);
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `Google Drive returned HTTP ${response.status}.`;
    throw new Error(message);
  }
  return data;
}

function isVideo(file) {
  return (file.mimeType || "").startsWith("video/") ||
    /\.(mp4|m4v|mov|webm|ogv|ogg|avi|mkv|mpeg|mpg)$/i.test(file.name || "");
}

async function scanFolder(apiKey, folderId, path, foundVideos, visited) {
  if (visited.has(folderId)) return;
  visited.add(folderId);
  setStatus(`Scanning folder ${visited.size}…`, "busy");
  $("scanDetails").textContent = `${foundVideos.length} videos found so far. Checking folders and subfolders.`;

  let pageToken;
  do {
    const data = await driveList(apiKey, folderId, pageToken);
    for (const file of data.files || []) {
      const filePath = path ? `${path}/${file.name}` : file.name;
      if (file.mimeType === FOLDER_MIME) {
        await scanFolder(apiKey, file.id, filePath, foundVideos, visited);
      } else if (isVideo(file)) {
        foundVideos.push({ ...file, path });
        $("scanDetails").textContent = `${foundVideos.length} videos found so far. Checking folders and subfolders.`;
      }
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
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

    const videos = [];
    const visited = new Set();
    setStatus("Connected to Google Drive. Scanning…", "busy");
    await scanFolder(apiKey, rootId, "", videos, visited);
    videos.sort((a, b) => a.name.localeCompare(b.name));
    state.videos = videos;
    state.selectedId = null;
    renderVideos();

    $("videoCount").textContent = `${videos.length} video${videos.length === 1 ? "" : "s"}`;
    $("scanDetails").textContent = `Finished checking ${visited.size} folder${visited.size === 1 ? "" : "s"}. ${videos.length} video${videos.length === 1 ? "" : "s"} found.`;
    if (videos.length) setStatus(`Working — scan complete (${videos.length} videos).`, "ok");
    else setStatus("Scan finished, but no videos were found.", "ok");
  } catch (error) {
    setStatus(`Not working — ${error.message}`, "error");
    $("scanDetails").textContent = "Check that the Drive API is enabled and the folder is shared so this API key can access it.";
    $("videoCount").textContent = `${state.videos.length} videos`;
  } finally {
    state.scanning = false;
    $("scanBtn").disabled = false;
  }
}

function renderVideos() {
  const query = $("searchInput").value.trim().toLowerCase();
  const filtered = state.videos.filter(video =>
    video.name.toLowerCase().includes(query) || (video.path || "").toLowerCase().includes(query)
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
