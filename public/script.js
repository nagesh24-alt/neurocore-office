function showTab(tab) {
  document.querySelectorAll(".tab").forEach(t => t.style.display = "none");
  document.getElementById(tab).style.display = "block";
}

// Default open
showTab("editor");

let currentFile = "";

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
  try {
    const res = await fetch(`/read/${currentFile}`);
    const data = await res.json();

    if (data.type === "text") {
      document.getElementById("preview").innerText = data.content;
    } 
    else if (data.type === "image") {
      document.getElementById("preview").innerHTML = 
        `<img src="${data.content}" style="max-width:100%">`;
    }
  } catch (err) {
    alert("Error loading file");
    console.error(err);
  }
}

// Apply AI output to editor
function applyToEditor() {
  document.getElementById("preview").innerText =
    document.getElementById("output").innerText;
}

// Use current editor/preview text as AI input
function useEditorText() {
  document.getElementById("input").value =
    document.getElementById("preview").innerText;
}

// Toggle dark mode
function toggleDarkMode() {
  document.body.classList.toggle("dark");
}

// AI function
async function runAI() {
  const output = document.getElementById("output");
  output.innerText = "Processing... ⏳";

  const text = document.getElementById("input").value;
  const action = document.getElementById("action").value;

  const res = await fetch("/ai-edit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, action })
  });

  const result = await res.text();
  output.innerText = result;
}

async function saveFile() {
  const content = document.getElementById("preview").innerText;

  if (!currentFile) {
    alert("No file loaded!");
    return;
  }

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
    alert("Saved successfully!");
  } else {
    alert("Save failed!");
  }
}

// Load all files
async function loadFiles() {
  try {
    const res = await fetch("/files");
    const files = await res.json();

    const list = document.getElementById("fileList");
    list.innerHTML = "";

    files.forEach(file => {
      const li = document.createElement("li");

      li.innerHTML = `
        ${file.name} (${file.size} bytes)
        <button onclick="openFile('${file.name}')">Open</button>
        <button onclick="deleteFile('${file.name}')">Delete</button>
        <button onclick="downloadFile('${file.name}')">Download</button>
      `;

      list.appendChild(li);
    });
  } catch (err) {
    console.error("Error loading files", err);
  }
}

// Open file
function openFile(name) {
  currentFile = name;
  loadFile();
}

// Delete file
async function deleteFile(name) {
  await fetch(`/delete/${name}`, {
    method: "DELETE"
  });

  alert("File deleted!");
  loadFiles();
}

// Download file
function downloadFile(name) {
  window.open(`/download/${name}`);
}

// Load file list on page load
loadFiles();
