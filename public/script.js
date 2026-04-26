function showTab(tab) {
  if (tab === "doc-viewer-tab") tab = "docViewer";
  document.querySelectorAll(".tab").forEach(t => t.style.display = "none");
  const tabEl = document.getElementById(tab);
  if (tabEl) {
    if (tab === "pdf-viewer-tab" || tab === "docViewer") tabEl.style.display = "flex";
    else if (tab === "dashboard") tabEl.style.display = "grid";
    else tabEl.style.display = "block";
  }
}

function openDocViewer() {
  showTab("docViewer");
}

function formatText(cmd, value = null) {
  focusActiveEditor();
  document.execCommand(cmd, false, value);
  updateDocStatus();
}

function setHeading(tag) {
  focusActiveEditor();
  document.execCommand('formatBlock', false, tag);
  buildDocSections();
  updateDocStatus();
}

function boldText() {
  formatText('bold');
}

function italicText() {
  formatText('italic');
}

function underlineText() {
  formatText('underline');
}

function alignText(type) {
  const commands = {
    left: 'justifyLeft',
    center: 'justifyCenter',
    right: 'justifyRight'
  };
  formatText(commands[type] || 'justifyLeft');
}

function focusActiveEditor() {
  const docTab = document.getElementById('docViewer');
  const docContent = document.getElementById('docContent');
  if (docTab?.style.display !== 'none' && docContent) {
    docContent.focus();
    return;
  }
  preview?.focus();
}

// Default open
showTab("dashboard");

let currentFile = "";
const preview = document.getElementById("preview");

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("#doc-toolbar button").forEach(button => {
    button.addEventListener("mousedown", event => event.preventDefault());
  });
});

// Upload file
async function uploadFile(event) {
  try {
    const file = event.target.files[0];
    if (!file) {
      alert("Please select a file");
      return;
    }
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/upload", {
      method: "POST",
      body: formData
    });

    const data = await res.json();
    currentFile = data.file;

    loadFile();
    loadFiles(); // 👈 ADD THIS
  } catch (err) {
    alert("Upload failed!");
    console.error(err);
  }
}

// Load file content
async function loadFile() {
  if (!currentFile) return;

  try {
    if (!currentFile.trim()) return;

    const res = await fetch(`/read/${encodeURIComponent(currentFile)}`);
    if (!res.ok) throw new Error("Failed to load file");

    const data = await res.json();

    if (data.type === "text") {
      preview.innerText = data.content; // Plain text uses innerText
      showTab("editor");
    }
    else if (data.type === "docx") {
      loadDoc(data.content, currentFile);
      openDocViewer();
    }
    else if (data.type === "image") {
      preview.innerHTML =
        `<img src="${data.content}" style="max-width:100%">`;
      showTab("editor");
    }
    else if (data.type === "pdf") {
      loadPDFInViewer(data.content, currentFile);
      showTab("pdf-viewer-tab");
    }
    else if (data.type === "excel") {
      let tableHtml = "<table>";
      data.content.forEach((row, index) => {
        tableHtml += "<tr>";
        row.forEach(cell => {
          if (index === 0) {
            tableHtml += `<th>${cell || ''}</th>`;
          } else {
            tableHtml += `<td>${cell || ''}</td>`;
          }
        });
        tableHtml += "</tr>";
      });
      tableHtml += "</table>";
      preview.innerHTML = tableHtml;
      showTab("editor");
    }
    else {
      preview.innerText = "Preview not supported for this file type.";
      showTab("editor");
    }
  } catch (err) {
    alert("Error loading file");
    console.error(err);
  }
}

// Apply AI output to editor
function applyToEditor() {
  const docContent = document.getElementById("docContent");
  if (document.getElementById("docViewer")?.style.display !== "none" && docContent) {
    docContent.innerHTML = document.getElementById("output").innerHTML;
    updateDocStatus();
  } else {
    preview.innerHTML = document.getElementById("output").innerHTML;
  }
}

// Use current editor/preview text as AI input
function useEditorText() {
  const docContent = document.getElementById("docContent");
  const docIsOpen = document.getElementById("docViewer")?.style.display !== "none";
  document.getElementById("input").value =
    docIsOpen && docContent ? docContent.innerText : preview.innerText;
}

// Toggle dark mode
function toggleDarkMode() {
  document.body.classList.toggle("dark");
}

// AI function
async function runAI() {
  const output = document.getElementById("output");
  output.innerText = "Processing... ⏳";
  const docContent = document.getElementById("docContent");
  const docIsOpen = document.getElementById("docViewer")?.style.display !== "none";

  const text =
    document.getElementById("input").value ||
    (docIsOpen && docContent ? docContent.innerHTML : "") ||
    preview.innerHTML;

  if (!text.trim()) {
    output.innerText = "Enter text first or load a file!";
    return;
  }
  const action = document.getElementById("action").value;

  try {
    const res = await fetch("/ai-edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, action })
    });

    if (!res.ok) {
      output.innerText = "AI failed!";
      return;
    }

    const result = await res.text();
    output.innerText = result;
  } catch (err) {
    output.innerText = "Error connecting to AI!";
    console.error("AI Error:", err);
  }
}

async function saveFile(options = {}) {
  if (!currentFile) {
    if (!options.silent) alert("No file loaded!");
    return false;
  }

  const ext = currentFile.split('.').pop().toLowerCase();
  // Use innerHTML for rich text formats, innerText for plain text to prevent saving HTML tags
  const docContent = document.getElementById("docContent");
  const content = (ext === "docx" && docContent) ? docContent.innerHTML : preview.innerText;

  const res = await fetch("/save", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      filename: currentFile,
      content: content
    })
  });

  if (res.ok) {
    if (!options.silent) alert("Saved successfully!");
    markDocSaved();
    return true;
  } else {
    if (!options.silent) alert("Save failed!");
    return false;
  }
}

// Load all files
async function loadFiles() {
  const container = document.getElementById("files-container");
  const countEl = document.getElementById("files-count");
  const legacyList = document.getElementById("fileList");

  console.log("loadFiles: elements found", {
    filesContainer: Boolean(container),
    fileList: Boolean(legacyList),
    filesCount: Boolean(countEl)
  });

  if (!container && !legacyList) {
    console.error("fileList element not found and files-container element not found");
    return;
  }

  try {
    const res = await fetch("/files");
    if (!res.ok) {
      throw new Error(`Failed to fetch files: ${res.status} ${res.statusText}`);
    }

    const files = await res.json();
    console.log("loadFiles: API response", files);

    if (!Array.isArray(files) || files.length === 0) {
      if (container) renderEmpty(container, countEl, "No files available");
      if (legacyList) legacyList.innerHTML = "";
      return;
    }

    files.sort((a, b) => getFileTime(b.lastModified) - getFileTime(a.lastModified));

    if (countEl) {
      countEl.textContent = `${files.length} file${files.length !== 1 ? "s" : ""}`;
    }

    if (container) {
      container.innerHTML = buildTable(files);
      return;
    }

    const list = document.getElementById("fileList");
    if (!list) {
      console.error("fileList element not found");
      return;
    }
    list.innerHTML = "";

    files.forEach(file => {
      let icon = "📄";
      const ext = file.name.split('.').pop().toLowerCase();
      if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) icon = "🖼";
      else if (['xls', 'xlsx', 'csv'].includes(ext)) icon = "📊";

      const li = document.createElement("li");
      if (file.name === currentFile) {
        li.classList.add("active");
      }

      li.innerHTML = `
        <div class="file-card">
          <div class="file-meta">
            <span class="file-icon">${icon}</span>
            <div>
              <div class="file-name">${file.name}</div>
              <div class="file-size">${(file.size / 1024).toFixed(2)} KB</div>
            </div>
          </div>
          <div class="actions">
            <button onclick="openFile('${file.name}')">Open</button>
            <button onclick="deleteFile('${file.name}')">Delete</button>
            <button onclick="downloadFile('${file.name}')">Download</button>
          </div>
        </div>
      `;

      list.appendChild(li);
    });
  } catch (err) {
    console.error("Error loading files", err);
    if (container) renderEmpty(container, countEl, "Unable to load files right now");
  }
}

function loadDoc(html, name) {
  const docContent = document.getElementById("docContent");
  if (!docContent) return;

  docContent.innerHTML = html || "<p></p>";
  document.getElementById("doc-filename-text").textContent = name || "Document.docx";
  document.getElementById("doc-status-filename").textContent = name || "Document.docx";
  document.getElementById("doc-edited-status").textContent = "Saved";
  buildDocSections();
  updateDocWordCount();
}

function updateDocStatus() {
  updateDocWordCount();
  const status = document.getElementById("doc-edited-status");
  if (status) status.textContent = "Edited";
}

function markDocSaved() {
  const status = document.getElementById("doc-edited-status");
  if (status) status.textContent = "Saved";
}

function updateDocWordCount() {
  const docContent = document.getElementById("docContent");
  const text = docContent?.innerText.trim() || "";
  const count = text ? text.split(/\s+/).length : 0;
  const wordCount = document.getElementById("doc-word-count");
  const statusWords = document.getElementById("doc-status-words");
  if (wordCount) wordCount.textContent = count;
  if (statusWords) statusWords.textContent = `${count} words`;
}

function buildDocSections() {
  const list = document.getElementById("doc-sections-list");
  const docContent = document.getElementById("docContent");
  if (!list || !docContent) return;

  const headings = [...docContent.querySelectorAll("h1, h2")];
  list.innerHTML = "";

  if (!headings.length) {
    list.innerHTML = '<div class="doc-section-empty">No sections yet</div>';
    return;
  }

  headings.forEach((heading, index) => {
    if (!heading.id) heading.id = `doc-section-${index + 1}`;
    const item = document.createElement("button");
    item.className = `doc-section-item ${heading.tagName.toLowerCase()}`;
    item.textContent = heading.textContent || `Section ${index + 1}`;
    item.onclick = () => heading.scrollIntoView({ behavior: "smooth", block: "start" });
    list.appendChild(item);
  });
}

async function exportDocx() {
  const saved = await saveFile({ silent: true });
  if (saved && currentFile) {
    window.open(`/download/${encodeURIComponent(currentFile)}`);
  } else {
    alert("Export failed!");
  }
}

function exportDocPdf() {
  alert("Export as PDF is coming soon.");
}

// Open file
function openFile(name) {
  currentFile = name;
  loadFile();

  document.querySelectorAll("#fileList tr, #fileList li").forEach(item => {
    item.classList.remove("active");
  });

  if (window.event?.target) {
    window.event.target.closest("tr, li")?.classList.add("active");
  }
}

// Delete file
async function deleteFile(name) {
  const res = await fetch(`/delete/${encodeURIComponent(name)}`, { method: "DELETE" });

  if (res.ok) {
    alert("File deleted!");
    loadFiles();
  } else {
    alert("Delete failed!");
  }
}

// Download file
function downloadFile(name) {
  window.open(`/download/${encodeURIComponent(name)}`);
}

// Load file list on page load

/* ── PDF Viewer State ──────────────────────────────────────────── */
const PDF_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

let pdfDoc = null;
let currentPage = 1;
let currentZoom = 100;
let currentPdfUrl = "";
let pendingRenderPage = null;
let isRenderingPage = false;
let sidebarOpen = true;
const ZOOM_STEPS = [50, 75, 100, 125, 150, 200];

document.addEventListener('DOMContentLoaded', () => {
  configurePDFWorker();
  buildThumbnails(0);
});

/* ── Tab switching ─────────────────────────────────────────────── */
function setTab(el, name) {
  document.querySelectorAll('.tb-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
}

/* ── Sidebar toggle ────────────────────────────────────────────── */
function toggleSidebar() {
  sidebarOpen = !sidebarOpen;
  document.getElementById('pdf-sidebar').classList.toggle('collapsed', !sidebarOpen);
}

/* ── Open PDF ──────────────────────────────────────────────────── */
function openPDF() {
  // Triggers the main file manager upload since we share it
  document.querySelector('#editor input[type="file"]').click();
}

function configurePDFWorker() {
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
  }
}

function showPDFViewer() {
  const wrapper = document.getElementById('pdf-page-wrapper');
  const empty = document.getElementById('pdf-empty-state');
  const error = document.getElementById('pdf-error');
  const canvas = document.getElementById('pdfCanvas');

  wrapper.style.display = 'block';
  empty.style.display = 'none';
  error.style.display = 'none';
  canvas.style.display = 'block';
}

function loadPDFInViewer(src, name) {
  const label = name || src.split('/').pop() || 'Document.pdf';
  document.getElementById('filename-text').textContent = label;
  document.getElementById('status-filename').textContent = label;
  showPDFViewer();
  loadPDF(src);
}

async function loadPDF(fileUrl) {
  configurePDFWorker();
  currentPdfUrl = fileUrl;
  currentPage = 1;
  pendingRenderPage = null;
  pdfDoc = null;
  setPDFError(false);
  updatePDFControls();

  try {
    if (!window.pdfjsLib) {
      throw new Error("PDF.js failed to load");
    }

    pdfDoc = await pdfjsLib.getDocument(fileUrl).promise;
    document.getElementById('totalPages').textContent = pdfDoc.numPages;
    document.getElementById('pageInput').max = pdfDoc.numPages;
    buildThumbnails(pdfDoc.numPages);
    await renderPage(1);
  } catch (err) {
    console.error("Failed to load PDF", err);
    pdfDoc = null;
    setPDFError(true);
    buildThumbnails(0);
    updatePDFControls();
  }
}

async function renderPage(pageNumber) {
  if (!pdfDoc) return;

  const targetPage = Math.min(Math.max(pageNumber || 1, 1), pdfDoc.numPages);
  if (isRenderingPage) {
    pendingRenderPage = targetPage;
    return;
  }

  isRenderingPage = true;
  setPDFError(false);

  try {
    const page = await pdfDoc.getPage(targetPage);
    const canvas = document.getElementById('pdfCanvas');
    const context = canvas.getContext('2d');
    const viewport = page.getViewport({ scale: currentZoom / 100 });

    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = viewport.width + 'px';
    canvas.style.height = viewport.height + 'px';

    await page.render({ canvasContext: context, viewport }).promise;
    currentPage = targetPage;
    updatePDFControls();
  } catch (err) {
    console.error("Failed to render PDF page", err);
    setPDFError(true);
  } finally {
    isRenderingPage = false;
    if (pendingRenderPage !== null) {
      const nextRender = pendingRenderPage;
      pendingRenderPage = null;
      renderPage(nextRender);
    }
  }
}

/* ── Print ─────────────────────────────────────────────────────── */
function printPDF() {
  if (!currentPdfUrl) {
    alert('Please open a PDF file first.');
    return;
  }
  window.open(currentPdfUrl, '_blank');
}

/* ── Zoom ──────────────────────────────────────────────────────── */
function setZoom(val) {
  currentZoom = parseInt(val, 10);
  updatePDFControls();
  if (pdfDoc) renderPage(currentPage);
}

function zoomIn() {
  const idx = ZOOM_STEPS.indexOf(currentZoom);
  if (idx < ZOOM_STEPS.length - 1) setZoom(ZOOM_STEPS[idx + 1]);
}

function zoomOut() {
  const idx = ZOOM_STEPS.indexOf(currentZoom);
  if (idx > 0) setZoom(ZOOM_STEPS[idx - 1]);
}

function adjustZoom(delta) {
  if (delta > 0) zoomIn();
  else zoomOut();
}

function nextPage() {
  if (pdfDoc && currentPage < pdfDoc.numPages) {
    renderPage(currentPage + 1);
  }
}

function prevPage() {
  if (pdfDoc && currentPage > 1) {
    renderPage(currentPage - 1);
  }
}

function updatePDFControls() {
  document.getElementById('pageInput').value = currentPage;
  document.getElementById('totalPages').textContent = pdfDoc ? pdfDoc.numPages : '—';
  document.getElementById('zoomSel').value = currentZoom;
  document.getElementById('status-zoom').textContent = currentZoom + '%';
  document.querySelectorAll('.page-thumb').forEach((thumb, index) => {
    thumb.classList.toggle('active', index + 1 === currentPage);
  });
}

function setPDFError(show) {
  const error = document.getElementById('pdf-error');
  const canvas = document.getElementById('pdfCanvas');
  if (!error || !canvas) return;
  error.style.display = show ? 'flex' : 'none';
  canvas.style.display = show ? 'none' : 'block';
}

/* ── Export PDF ────────────────────────────────────────────────── */
function exportPDF() {
  if (!currentPdfUrl) {
    alert('Please open a PDF file first.');
    return;
  }
  const a = document.createElement('a');
  a.href = currentPdfUrl;
  a.download = document.getElementById('filename-text').textContent || 'document.pdf';
  a.click();
}

/* ── Thumbnail builder ─────────────────────────────────────────── */
function buildThumbnails(count) {
  const list = document.getElementById('sidebar-pages-list');
  if (!list) return;
  list.innerHTML = '';
  for (let i = 1; i <= count; i++) {
    const div = document.createElement('div');
    div.className = 'page-thumb' + (i === 1 ? ' active' : '');
    div.onclick = () => selectPage(div, i);
    div.innerHTML = `
      <div class="thumb-img">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      </div>
      <span class="thumb-num">${i}</span>
    `;
    list.appendChild(div);
  }
}

function selectPage(el, num) {
  document.querySelectorAll('.page-thumb').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  const pageInput = document.getElementById('pageInput');
  if (pageInput) pageInput.value = num;
  renderPage(num);
}



/* ── Greeting ────────────────────────────── */
(function setGreeting() {
  const h = new Date().getHours();
  const g = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  const el = document.getElementById('greeting-text');
  if (el) el.textContent = `Good ${g}, Admin 👋`;
})();

/* ── Sidebar Nav ─────────────────────────── */
function setNav(el, id) {
  if (el.classList.contains('disabled')) return;
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  el.classList.add('active');
}

/* ── Dark Mode ───────────────────────────── */
function toggleDarkMode() {
  document.body.classList.toggle('dark-mode');
}

/* ── Navigation hooks ────────────────────── */
// We use showTab() directly in HTML, these are backups.

/* ── Load Files ── */
async function loadRecentFiles() {
  return loadFiles();
}

function getFileType(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (['doc', 'docx'].includes(ext)) return 'docx';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'xlsx';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'img';
  return 'txt';
}

function fileTypeLabel(t) {
  return { pdf: 'PDF', docx: 'DOC', xlsx: 'XLS', img: 'IMG', txt: 'TXT' }[t] || 'FILE';
}

function buildTable(files) {
  const rows = files.map((f, i) => {
    // our backend returns { name: "...", size: 1234 }
    const t = getFileType(f.name || f.filename);
    const mod = formatLastModified(f.lastModified || f.modified || f.updatedAt);
    const name = f.name || f.filename || 'Untitled';
    const jsName = escJsString(name);
    return `
    <tr>
      <td>
        <div class="file-name-cell">
          <div class="file-type-icon ${t}">${fileTypeLabel(t)}</div>
          <span class="file-name-text">${escHtml(name)}</span>
        </div>
      </td>
      <td class="file-date">${fileTypeLabel(t)}</td>
      <td class="file-date">${mod}</td>
      <td>
        <div class="file-actions">
          <button class="action-btn" title="Open" onclick="handleOpen('${jsName}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button class="action-btn" title="Download" onclick="handleDownload('${jsName}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
          <button class="action-btn danger" title="Delete" onclick="handleDelete('${jsName}', this)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');

  return `
  <table class="files-table">
    <thead>
      <tr>
        <th>File Name</th>
        <th>Type</th>
        <th>Last Modified</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody id="fileList">${rows}</tbody>
  </table>`;
}

function renderEmpty(container, countEl, message = 'No files available') {
  if (countEl) countEl.textContent = '0 files';
  container.innerHTML = `
  <div class="empty-state">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin:0 auto 10px; display:block;"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
    <p>${escHtml(message)}</p>
  </div>`;
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escJsString(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, "\\n").replace(/\r/g, "\\r");
}

function getFileTime(value) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function formatLastModified(value) {
  const time = getFileTime(value);
  if (!time) return "-";

  const date = new Date(time);
  const absolute = date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  });
  const relative = getRelativeTime(date);

  return `
    <span title="${escHtml(absolute)}">
      ${escHtml(absolute)}
      <small class="file-relative-time">${escHtml(relative)}</small>
    </span>`;
}

function getRelativeTime(date) {
  const diff = Date.now() - date.getTime();
  if (!Number.isFinite(diff)) return "";
  if (diff < 0) return "Just now";

  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mo${months === 1 ? "" : "s"} ago`;

  const years = Math.floor(days / 365);
  return `${years} yr${years === 1 ? "" : "s"} ago`;
}

/* ── File actions — bridge to YOUR functions ── */
function handleOpen(name) {
  currentFile = name;
  loadFile();
}

function handleDownload(name) {
  window.location.href = "/download/" + encodeURIComponent(name);
}

async function handleDelete(name, btn) {
  if (!confirm(`Delete "${name}"?`)) return;
  try {
    const res = await fetch("/delete/" + encodeURIComponent(name), { method: "DELETE" });
    if (res.ok) {
      if (btn) btn.closest('tr').remove();
      loadRecentFiles();
    } else {
      alert("Delete failed");
    }
  } catch (err) {
    console.error(err);
  }
}

/* ── Upload Modal ─────────────────────────── */
let selectedFiles = null;

function showUploadModal() {
  document.getElementById('upload-modal').classList.add('active');
}

function closeUploadModal() {
  document.getElementById('upload-modal').classList.remove('active');
  resetUploadState();
}

function closeModalOnOverlay(e) {
  if (e.target === document.getElementById('upload-modal')) closeUploadModal();
}

function handleFileSelect(files) {
  if (!files || !files.length) return;
  selectedFiles = files;
  const names = Array.from(files).map(f => f.name).join(', ');
  document.getElementById('upload-file-names').textContent = names;
  document.getElementById('upload-file-list').style.display = 'block';
  const btn = document.getElementById('upload-submit-btn');
  btn.disabled = false;
  btn.style.opacity = '1';
  btn.style.cursor = 'pointer';
}

function handleDrop(e) {
  e.preventDefault();
  document.getElementById('upload-drop').classList.remove('dragging');
  handleFileSelect(e.dataTransfer.files);
}

async function submitUpload() {
  if (!selectedFiles) return;

  const form = new FormData();
  form.append('file', selectedFiles[0]); // our backend expects single 'file'

  try {
    const res = await fetch('/upload', { method: 'POST', body: form });
    if (res.ok) {
      closeUploadModal();
      loadRecentFiles();
    } else {
      alert('Upload failed. Please try again.');
    }
  } catch (e) {
    console.error(e);
    alert('Upload failed. Check your connection.');
  }
}

function resetUploadState() {
  selectedFiles = null;
  document.getElementById('file-input').value = '';
  document.getElementById('upload-file-list').style.display = 'none';
  document.getElementById('upload-file-names').textContent = '';
  const btn = document.getElementById('upload-submit-btn');
  btn.disabled = true;
  btn.style.opacity = '.5';
  btn.style.cursor = 'not-allowed';
}

/* ── Search ───────────────────────────────── */
function handleSearch(val) {
  const rows = document.querySelectorAll('.files-table tbody tr');
  rows.forEach(r => {
    const name = r.querySelector('.file-name-text')?.textContent?.toLowerCase() || '';
    r.style.display = name.includes(val.toLowerCase()) ? '' : 'none';
  });
}

/* ── ESC key closes modal ─────────────────── */
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeUploadModal(); });

/* ── Init ─────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  loadRecentFiles();
});
