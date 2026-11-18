const FOLDER_MIME = "application/vnd.google-apps.folder";
const VIDEO_MIME_PREFIX = "video/";

const $ = (id) => document.getElementById(id);
const state = { videos: [], folders: [], activeFolder: "", selectedId: null };

function extractFolderId(input) {
  const value = input.trim();
  if (/^[a-zA-Z0-9_-]{10,}$/.test(value)) return value;
  const match = value.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (!match) throw new Error("That doesn't look like a Google Drive folder link. Paste a folder URL.");
  return match[1];
}

async function driveList(apiKey, folderId, pageToken) {
  const params = new URLSearchParams({
    q: `'${folderId}' in parents and trashed = false`,
    fields: "nextPageToken,files(id,name,mimeType,webViewLink,thumbnailLink,size,modifiedTime)",
    pageSize: "1000",
    orderBy: "folder,name",
    key: apiKey
  });
  if (pageToken) params.set("pageToken", pageToken);
  const url = `https://www.googleapis.com/drive/v3/files?${params}`;
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) {
    const reason = data?.error?.message || `Google Drive API error (${response.status})`;
    throw new Error(reason);
  }
  return data;
}

async function scanFolder(apiKey, folderId, path, foundVideos, foundFolders, visited) {
  if (visited.has(folderId)) return;
  visited.add(folderId);
  let pageToken;
  do {
    const data = await driveList(apiKey, folderId, pageToken);
    for (const file of data.files || []) {
      const filePath = path ? `${path}/${file.name}` : file.name;
      if (file.mimeType === FOLDER_MIME) {
        foundFolders.push({ id: file.id, name: file.name, path: filePath });
        await scanFolder(apiKey, file.id, filePath, foundVideos, foundFolders, visited);
      } else if (isVideo(file)) {
        foundVideos.push({ ...file, path });
      }
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
}

function isVideo(file) {
  return (file.mimeType || "").startsWith(VIDEO_MIME_PREFIX) ||
    /\.(mp4|m4v|mov|webm|ogv|ogg|avi|mkv|mpeg|mpg)$/i.test(file.name || "");
}

function setStatus(message, isError = false) {
  $("status").textContent = message;
  $("status").classList.toggle("error", isError);
}

async function startScan() {
  const apiKey = $("apiKey").value.trim();
  let rootId;
  try {
    rootId = extractFolderId($("folderUrl").value);
    if (!apiKey) throw new Error("Enter a Google API key first.");
  } catch (error) {
    setStatus(error.message, true);
    return;
  }

  $("scanBtn").disabled = true;
  $("scanBtn").textContent = "Scanning…";
  setStatus("Scanning folders and subfolders. Large libraries may take a little while.");
  $("library").hidden = true;

  try {
    const videos = [], folders = [], visited = new Set();
    await scanFolder(apiKey, rootId, "", videos, folders, visited);
    videos.sort((a, b) => a.name.localeCompare(b.name));
    state.videos = videos;
    state.folders = folders;
    state.activeFolder = "";
    state.selectedId = null;
    renderLibrary();
    $("library").hidden = false;
    setStatus(`Scan complete. Found ${videos.length} video${videos.length === 1 ? "" : "s"} in ${visited.size} folder${visited.size === 1 ? "" : "s"}.`);
    if (!videos.length) setStatus("Scan complete, but no videos were found. Check that the folder is shared and contains supported video files.");
  } catch (error) {
    setStatus(`${error.message} Check that the Drive API is enabled and the folder is accessible to this API key.`, true);
  } finally {
    $("scanBtn").disabled = false;
    $("scanBtn").innerHTML = 'Find videos <span>→</span>';
  }
}

function renderLibrary() {
  $("videoCount").textContent = state.videos.length;
  $("allCount").textContent = state.videos.length;
  renderFolders();
  renderVideos();
}

function renderFolders() {
  const host = $("folderList");
  host.innerHTML = "";
  const counts = new Map();
  for (const video of state.videos) {
    const path = video.path || "";
    counts.set(path, (counts.get(path) || 0) + 1);
  }
  for (const folder of state.folders) {
    const count = state.videos.filter(v => v.path === folder.path || v.path.startsWith(folder.path + "/")).length;
    const button = document.createElement("button");
    button.className = "folder-item" + (state.activeFolder === folder.path ? " active" : "");
    button.innerHTML = `<span></span><span>${count}</span>`;
    button.firstElementChild.textContent = "📁 " + folder.name;
    button.addEventListener("click", () => {
      state.activeFolder = state.activeFolder === folder.path ? "" : folder.path;
      renderFolders();
      renderVideos();
    });
    host.appendChild(button);
  }
  document.querySelector(".folder-filter").classList.toggle("active", !state.activeFolder);
}

function renderVideos() {
  const query = $("searchInput").value.trim().toLowerCase();
  const filtered = state.videos.filter(video => {
    const matchesQuery = video.name.toLowerCase().includes(query);
    const matchesFolder = !state.activeFolder || video.path === state.activeFolder || video.path.startsWith(state.activeFolder + "/");
    return matchesQuery && matchesFolder;
  });
  const grid = $("videoGrid");
  grid.innerHTML = "";
  $("emptyState").hidden = filtered.length !== 0;
  for (const video of filtered) {
    const card = document.createElement("button");
    card.className = "video-card" + (state.selectedId === video.id ? " selected" : "");
    const icon = document.createElement("div");
    icon.className = "file-icon";
    icon.textContent = "▶";
    const name = document.createElement("div");
    name.className = "video-name";
    name.textContent = video.name;
    const path = document.createElement("div");
    path.className = "video-path";
    path.textContent = video.path || "Root folder";
    card.append(icon, name, path);
    card.addEventListener("click", () => playVideo(video));
    grid.appendChild(card);
  }
}

function playVideo(video) {
  state.selectedId = video.id;
  const panel = $("playerPanel");
  panel.innerHTML = "";
  const iframe = document.createElement("iframe");
  iframe.src = `https://drive.google.com/file/d/${encodeURIComponent(video.id)}/preview`;
  iframe.allow = "autoplay; fullscreen";
  iframe.allowFullscreen = true;
  iframe.referrerPolicy = "strict-origin-when-cross-origin";
  iframe.title = video.name;
  panel.appendChild(iframe);
  $("nowPlaying").textContent = `NOW PLAYING  /  ${video.name}`;
  renderVideos();
}

$("scanBtn").addEventListener("click", startScan);
$("folderUrl").addEventListener("keydown", e => { if (e.key === "Enter") startScan(); });
$("apiKey").addEventListener("keydown", e => { if (e.key === "Enter") startScan(); });
$("searchInput").addEventListener("input", renderVideos);
document.querySelector(".folder-filter").addEventListener("click", () => {
  state.activeFolder = "";
  renderFolders();
  renderVideos();
});
