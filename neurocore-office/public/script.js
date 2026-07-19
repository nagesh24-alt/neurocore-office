async function parseJsonResponse(response) {

    const text = await response.text();

    try {
        return JSON.parse(text);
    } catch {
        throw new Error(
            response.ok
                ? "Server returned an invalid response."
                : `Request failed (${response.status}). Restart the server if you recently added new features.`
        );
    }

}

function setProtectedStatusMessage(message, isError = true) {

    const status = document.getElementById("protectedStatusMessage");

    if (!status)
        return;

    status.textContent = message || "";
    status.style.display = message ? "block" : "none";
    status.style.color = isError ? "#ff4d4f" : "#22c55e";

}

async function uploadFile() {

    const file = document.getElementById("fileInput").files[0];

    if (!file) {
        alert("Please select a PDF.");
        return;
    }

    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/upload", {
        method: "POST",
        body: formData
    });

    const result = await parseJsonResponse(response);

    if (result.success) {
        alert("Uploaded: " + result.filename);
        loadPDFs();
    } else {
        alert(result.message);
    }
}
//formatfileSize
function formatFileSize(bytes) {
    if (!bytes || bytes < 0) return "--";

    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let unit = 0;

    while (size >= 1024 && unit < units.length - 1) {
        size /= 1024;
        unit++;
    }

    return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

// Display dashboard table
function displayDashboard(files) {

    const body = document.getElementById("pdfTableBody");

    body.innerHTML = "";

    // Reset selectAll checkbox when data reloads
    const selectAllCheckbox = document.getElementById("selectAll");
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = false;
    }

    if (files.length === 0) {
        body.innerHTML = "<tr><td colspan='11' style='text-align: center; color: var(--text-muted); padding: 20px;'>No PDFs found.</td></tr>";
        document.getElementById("recent-count").textContent = "0 files";
        return;
    }

    document.getElementById("recent-count").textContent = `${files.length} files`;

    files.forEach(file => {

        const tags = Array.isArray(file.tags) ? file.tags : [];
        const tagsText = tags.length ? tags.join(", ") : "—";

        const row = document.createElement("tr");

        row.innerHTML = `
            <td><input type="checkbox"></td>
            <td>📄</td>
            <td class="name-column"><a href="/pdf/${encodeURIComponent(file.name)}" target="_blank" class="file-table-link" style="color: var(--text-primary); text-decoration: none;">${file.name}</a></td>
            <td>
                <span class="tags-cell" style="display:inline-block; max-width:180px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${tagsText}</span>
            </td>
            <td>${formatFileSize(file.size)}</td>
            <td>--</td>
            <td>${new Date(file.modified).toLocaleDateString()}</td>
            <td>${file.owner}</td>

            <td>
                <span class="status status-normal">
                    ${file.status}
                </span>
            </td>

            <td>
                <a
                    href="/pdf/${encodeURIComponent(file.name)}"
                    target="_blank"
                    class="open-btn">
                    👁 Open
                </a>
            </td>

            <td class="action-cell">

                <button class="action-menu-btn">

                    ⋮

                </button>

                <div class="action-menu">

                    <button class="rename-btn"
                        onclick="event.stopPropagation(); renameDashboardPDF('${file.name.replace(/'/g, "\\'")}')">
                        ✏ Rename
                    </button>

                    <button class="move-btn"
                        onclick="event.stopPropagation(); moveDashboardPDF('${file.name.replace(/'/g, "\\'")}')">
                        📂 Move
                    </button>

                    <button class="copy-btn"
                        onclick="event.stopPropagation(); copyDashboardPDF('${file.name.replace(/'/g, "\\'")}')">
                        📄 Copy
                    </button>

                    <button class="protect-btn"
                        onclick="event.stopPropagation(); openProtectModal('${file.name.replace(/'/g, "\\'")}')">
                        🔒 Protect
                    </button>

                    <button class="tags-btn"
                        onclick="event.stopPropagation(); openTagsModal('${file.name.replace(/'/g, "\\'")}')">
                        🏷️ Edit Tags
                    </button>

                    <button class="delete-btn"
                        onclick="event.stopPropagation(); deleteDashboardPDF('${file.name.replace(/'/g, "\\'")}')">
                        🗑 Delete
                    </button>
                </div>

            </td>
        `;

        const link = row.querySelector(".file-table-link");
        link.onclick = (e) => {
            e.stopPropagation();
            loadDocumentInfo(file);
        };

        body.appendChild(row);
        const menuButton = row.querySelector(".action-menu-btn");
        const menu = row.querySelector(".action-menu");

        menuButton.onclick = (e) => {

            e.stopPropagation();

            // Hide other menus first
            document.querySelectorAll(".action-menu").forEach(m => {
                if (m !== menu) {
                    m.style.display = "none";
                }
            });

            menu.style.display =
                menu.style.display === "block"
                    ? "none"
                    : "block";

        };

    });

}


async function deleteDashboardPDF(file) {

    if (!confirm(`Delete "${file}"?`))
        return;

    try {
        const response = await fetch("/pdf/" + encodeURIComponent(file), {
            method: "DELETE"
        });

        const result = await parseJsonResponse(response);

        alert(result.message);

        loadPDFs();
    } catch (err) {
        alert(err.message);
    }

}

async function loadProtectedPDFs() {

    const response = await fetch("/protected-pdfs");

    const result = await parseJsonResponse(response);

    if (!result.success)
        return;

    const protectedList = document.getElementById("protectedPdfList");

    protectedList.innerHTML = "";
    document.getElementById("protected-count").textContent = `${result.files.length} files`;

    if (result.files.length === 0) {
        protectedList.innerHTML = "<div class='no-files-state'><p>No protected PDFs found.</p></div>";
        return;
    }

    result.files.forEach(file => {

        const div = document.createElement("div");
        div.className = "file-item";

        // Open Protected PDF
        const link = document.createElement("a");

        link.href = "/protected/" + encodeURIComponent(file);
        link.target = "_blank";
        link.className = "file-info";
        link.innerHTML = `<span class="file-icon">🔒</span> <span class="file-name">${file}</span>`;

        div.appendChild(link);

        const actionsDiv = document.createElement("div");
        actionsDiv.className = "file-actions";

        // Delete Button
        const deleteButton = document.createElement("button");
        deleteButton.textContent = "🗑 Delete";
        deleteButton.className = "btn-delete";
        deleteButton.onclick = async () => {

            if (!confirm(`Delete "${file}"?`))
                return;

            const response = await fetch(
                "/protected/" + encodeURIComponent(file),
                {
                    method: "DELETE"
                }
            );

            const result = await parseJsonResponse(response);

            alert(result.message);

            loadProtectedPDFs();

        };
        actionsDiv.appendChild(deleteButton);

        // Remove Password Button
        const removePasswordButton = document.createElement("button");
        removePasswordButton.textContent = "🔓 Remove Password";
        removePasswordButton.className = "btn-restore";
        removePasswordButton.onclick = async () => {

            const password = prompt("Enter current password:");

            if (!password)
                return;

            setProtectedStatusMessage("");

            try {

                const response = await fetch("/pdf/unprotect", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        filename: file,
                        password: password
                    })
                });

                const result = await parseJsonResponse(response);

                if (!response.ok || !result.success) {
                    setProtectedStatusMessage(
                        result.message || "Invalid Password please try again later"
                    );
                    return;
                }

                setProtectedStatusMessage(result.message, false);
                loadProtectedPDFs();
                loadPDFs();

            } catch (error) {
                setProtectedStatusMessage(
                    "Invalid Password please try again later"
                );
            }

        };
        actionsDiv.appendChild(removePasswordButton);

        // Change Password Button
        const changePasswordButton = document.createElement("button");
        changePasswordButton.textContent = "🔑 Change Password";
        changePasswordButton.className = "btn-copy";
        changePasswordButton.onclick = async () => {

            const currentPassword = prompt("Enter current password:");

            if (!currentPassword)
                return;

            const newPassword = prompt("Enter new password:");

            if (!newPassword)
                return;

            const confirmPassword = prompt("Confirm new password:");

            if (!confirmPassword)
                return;

            if (newPassword !== confirmPassword) {
                alert("New passwords do not match.");
                return;
            }

            try {

                const response = await fetch("/pdf/change-password", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        filename: file,
                        currentPassword: currentPassword,
                        newPassword: newPassword
                    })
                });

                const result = await parseJsonResponse(response);

                alert(result.message);

                loadProtectedPDFs();

            } catch (err) {
                alert(err.message);
            }

        };
        actionsDiv.appendChild(changePasswordButton);

        div.appendChild(actionsDiv);
        protectedList.appendChild(div);

    });

}

// Load PDFs
async function loadPDFs() {

    const response = await fetch("/pdfs");

    const result = await parseJsonResponse(response);

    if (result.success) {
        displayDashboard(result.files);
    }

}

// Search PDFs
async function searchPDFs() {

    const keyword = document.getElementById("searchInput").value;

    if (keyword.trim() === "") {
        loadPDFs();
        return;
    }

    const response = await fetch(
        "/pdfs/search?q=" +
        encodeURIComponent(keyword)
    );

    const result = await parseJsonResponse(response);

    if (result.success) {
        displayDashboard(result.files);
    }

}

// Show document information
async function loadDocumentInfo(file) {

    const response = await fetch(
        "/pdf/" + encodeURIComponent(file.name) + "/info"
    );

    const result = await parseJsonResponse(response);

    if (!result.success)
        return;

    const info = result.info;

    document.getElementById("documentInfo").innerHTML = `
        <div class="info-details">
            <div class="info-row">
                <span class="info-label">Filename</span>
                <span class="info-value">${info.filename}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Extension</span>
                <span class="info-value">${info.extension}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Size</span>
                <span class="info-value">${info.size} bytes</span>
            </div>
            <div class="info-row">
                <span class="info-label">Created</span>
                <span class="info-value">${new Date(info.created).toLocaleString()}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Modified</span>
                <span class="info-value">${new Date(info.modified).toLocaleString()}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Location</span>
                <span class="info-value">${info.location}</span>
            </div>
        </div>
    `;

}

// Global modal variables
let currentFileToProtect = "";

function openProtectModal(filename) {
    currentFileToProtect = filename;
    document.getElementById("protect-password").value = "";
    document.getElementById("allow-print").checked = true;
    document.getElementById("allow-copy").checked = true;
    document.getElementById("allow-edit").checked = true;

    const modal = document.getElementById("protect-modal");
    modal.style.display = "flex";
    // Trigger CSS opacity transition on next paint
    setTimeout(() => {
        modal.classList.add("active");
    }, 10);
}

function closeProtectModal() {
    const modal = document.getElementById("protect-modal");
    modal.classList.remove("active");
    setTimeout(() => {
        modal.style.display = "none";
    }, 250);
    currentFileToProtect = "";
}

// Close modal when clicking outside of the content
window.onclick = (event) => {
    const protectModal = document.getElementById("protect-modal");
    const renameModal = document.getElementById("rename-modal");
    const moveModal = document.getElementById("move-modal");
    const copyModal = document.getElementById("copy-modal");
    const tagsModal = document.getElementById("tags-modal");
    if (event.target === protectModal) {
        closeProtectModal();
    }
    if (event.target === renameModal) {
        closeRenameModal();
    }
    if (event.target === moveModal) {
        closeMoveModal();
    }
    if (event.target === copyModal) {
        closeCopyModal();
    }
    if (event.target === tagsModal) {
        closeTagsModal();
    }

    // Close action menus when clicking outside
    if (!event.target.classList.contains("action-menu-btn")) {
        const menus = document.querySelectorAll(".action-menu");
        menus.forEach(menu => {
            menu.style.display = "none";
        });
    }
};

async function submitProtectPDF(event) {
    event.preventDefault();

    const password = document.getElementById("protect-password").value;
    const allowPrint = document.getElementById("allow-print").checked;
    const allowCopy = document.getElementById("allow-copy").checked;
    const allowEdit = document.getElementById("allow-edit").checked;

    if (!password) {
        alert("Password is required.");
        return;
    }

    try {
        const response = await fetch("/pdf/permissions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                filename: currentFileToProtect,
                password: password,
                allowPrint: allowPrint,
                allowCopy: allowCopy,
                allowEdit: allowEdit
            })
        });

        const result = await parseJsonResponse(response);

        if (response.ok && result.success) {
            closeProtectModal();
            alert(result.message || "PDF protected successfully!");
            loadPDFs();
            loadProtectedPDFs();
        } else {
            alert(result.message || "Permission application failure.");
        }
    } catch (error) {
        alert("Permission application failure.");
    }
}

let currentFileToRename = "";
let currentFileToMove = "";
let currentFileToCopy = "";

function openRenameModal(filename) {
    currentFileToRename = filename;
    document.getElementById("rename-newname").value = filename;

    const modal = document.getElementById("rename-modal");
    modal.style.display = "flex";
    setTimeout(() => {
        modal.classList.add("active");
    }, 10);
}

function renameDashboardPDF(file) {
    openRenameModal(file);
}

function closeRenameModal() {
    const modal = document.getElementById("rename-modal");
    modal.classList.remove("active");
    setTimeout(() => {
        modal.style.display = "none";
    }, 250);
    currentFileToRename = "";
}

async function submitRenamePDF(event) {
    event.preventDefault();
    let newName = document.getElementById("rename-newname").value.trim();
    if (!newName) {
        alert("New name is required.");
        return;
    }
    if (!newName.toLowerCase().endsWith(".pdf")) {
        newName += ".pdf";
    }

    try {
        const response = await fetch(`/pdf/${encodeURIComponent(currentFileToRename)}?newName=${encodeURIComponent(newName)}`, {
            method: "PATCH"
        });

        const result = await parseJsonResponse(response);

        if (response.ok && result.success) {
            closeRenameModal();
            alert(result.message || "PDF renamed successfully!");
            loadPDFs();
        } else {
            alert(result.message || "Rename failed.");
        }
    } catch (error) {
        alert("Rename failed.");
    }
}

function openMoveModal(filename) {
    currentFileToMove = filename;
    document.getElementById("move-folder").selectedIndex = 0;

    const modal = document.getElementById("move-modal");
    modal.style.display = "flex";
    setTimeout(() => {
        modal.classList.add("active");
    }, 10);
}

function moveDashboardPDF(file) {
    openMoveModal(file);
}

function closeMoveModal() {
    const modal = document.getElementById("move-modal");
    modal.classList.remove("active");
    setTimeout(() => {
        modal.style.display = "none";
    }, 250);
    currentFileToMove = "";
}

async function submitMovePDF(event) {
    event.preventDefault();
    const folder = document.getElementById("move-folder").value;
    if (!folder) {
        alert("Please select a folder.");
        return;
    }

    try {
        const response = await fetch("/pdf/move", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                filename: currentFileToMove,
                folder: folder
            })
        });

        const result = await parseJsonResponse(response);

        if (response.ok && result.success) {
            closeMoveModal();
            alert(result.message || "PDF moved successfully!");
            loadPDFs();
            selectFolder(currentFolder);
        } else {
            alert(result.message || "Move failed.");
        }
    } catch (error) {
        alert("Move failed.");
    }
}

function openCopyModal(filename) {
    currentFileToCopy = filename;
    document.getElementById("copy-folder").selectedIndex = 0;

    const modal = document.getElementById("copy-modal");
    modal.style.display = "flex";
    setTimeout(() => {
        modal.classList.add("active");
    }, 10);
}

function copyDashboardPDF(file) {
    openCopyModal(file);
}

function closeCopyModal() {
    const modal = document.getElementById("copy-modal");
    modal.classList.remove("active");
    setTimeout(() => {
        modal.style.display = "none";
    }, 250);
    currentFileToCopy = "";
}

let currentFileToEditTags = "";

async function openTagsModal(filename) {
    currentFileToEditTags = filename;
    document.getElementById("tags-modal-filename").textContent = filename;
    
    // Fetch current tags
    try {
        const response = await fetch(`/pdf/${encodeURIComponent(filename)}/tags`);
        const result = await parseJsonResponse(response);
        if (response.ok && result.success) {
            document.getElementById("tags-input").value = result.tags.join(", ");
        } else {
            document.getElementById("tags-input").value = "";
        }
    } catch {
        document.getElementById("tags-input").value = "";
    }

    const modal = document.getElementById("tags-modal");
    modal.style.display = "flex";
    setTimeout(() => {
        modal.classList.add("active");
    }, 10);
}

function closeTagsModal() {
    const modal = document.getElementById("tags-modal");
    modal.classList.remove("active");
    setTimeout(() => {
        modal.style.display = "none";
    }, 250);
    currentFileToEditTags = "";
}

async function submitEditTags(event) {
    event.preventDefault();
    const tagsVal = document.getElementById("tags-input").value;
    // Split by comma and clean whitespace
    const tags = tagsVal.split(",")
        .map(t => t.trim())
        .filter(t => t.length > 0);

    try {
        const response = await fetch(`/pdf/${encodeURIComponent(currentFileToEditTags)}/tags`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ tags })
        });

        const result = await parseJsonResponse(response);

        if (response.ok && result.success) {
            closeTagsModal();
            alert(result.message || "Tags saved successfully!");
            loadPDFs();
        } else {
            alert(result.message || "Failed to save tags.");
        }
    } catch (error) {
        alert("Failed to save tags.");
    }
}

async function submitCopyPDF(event) {
    event.preventDefault();
    const folder = document.getElementById("copy-folder").value;
    if (!folder) {
        alert("Please select a folder.");
        return;
    }

    try {
        const response = await fetch("/pdf/copy", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                filename: currentFileToCopy,
                folder: folder
            })
        });

        const result = await parseJsonResponse(response);

        if (response.ok && result.success) {
            closeCopyModal();
            alert(result.message || "PDF copied successfully!");
            selectFolder(currentFolder);
        } else {
            alert(result.message || "Copy failed.");
        }
    } catch (error) {
        alert("Copy failed.");
    }
}

// Sidebar sections switching
function switchSection(section) {
    const sections = document.querySelectorAll(".content-section");
    sections.forEach(s => s.classList.remove("active"));

    const activeSection = document.getElementById(`${section}-section`);
    if (activeSection) {
        activeSection.classList.add("active");
    }

    const navItems = document.querySelectorAll(".sidebar-nav .nav-item");
    navItems.forEach(item => item.classList.remove("active"));

    const activeNavItem = document.getElementById(`nav-${section}`);
    if (activeNavItem) {
        activeNavItem.classList.add("active");
    }
}

// Folder category logic
let currentFolder = "Books";

async function selectFolder(folderName) {
    currentFolder = folderName;

    const tabBtns = document.querySelectorAll(".folder-tab-btn");
    tabBtns.forEach(btn => {
        if (btn.getAttribute("data-folder") === folderName) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });

    document.getElementById("current-folder-title").textContent = `Folder: ${folderName}`;

    try {
        const response = await fetch(`/pdf/folder/${encodeURIComponent(folderName)}`);
        const result = await parseJsonResponse(response);

        const folderFileList = document.getElementById("folderFileList");
        const folderCount = document.getElementById("folder-count");

        if (!result.success) {
            folderFileList.innerHTML = "<div class='no-files-state'><p>Error loading folder files.</p></div>";
            folderCount.textContent = "0 files";
            return;
        }

        folderCount.textContent = `${result.files.length} files`;
        folderFileList.innerHTML = "";

        if (result.files.length === 0) {
            folderFileList.innerHTML = "<div class='no-files-state'><p>No PDFs found in this folder.</p></div>";
            return;
        }

        result.files.forEach(file => {
            const div = document.createElement("div");
            div.className = "file-item";

            const link = document.createElement("a");
            link.href = `/pdf/folder/${encodeURIComponent(folderName)}/${encodeURIComponent(file)}`;
            link.target = "_blank";
            link.className = "file-info";
            link.innerHTML = `
                <span class="file-icon">📄</span>
                <span class="file-name">${file}</span>
            `;

            div.appendChild(link);
            folderFileList.appendChild(div);
        });

    } catch (error) {
        console.error("Error loading folder PDFs:", error);
    }
}

// Load PDFs and sections when page opens
window.onload = () => {
    loadPDFs();
    loadProtectedPDFs();
    selectFolder("Books");
    switchSection("dashboard");

    // Select all checkboxes handler
    const selectAllCheckbox = document.getElementById("selectAll");
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener("change", (e) => {
            const checkboxes = document.querySelectorAll("#pdfTableBody input[type='checkbox']");
            checkboxes.forEach(cb => {
                cb.checked = e.target.checked;
            });
        });
    }

    // Uncheck selectAll if individual checkbox is unchecked
    const tableBody = document.getElementById("pdfTableBody");
    if (tableBody && selectAllCheckbox) {
        tableBody.addEventListener("change", (e) => {
            if (e.target && e.target.type === "checkbox") {
                const checkboxes = Array.from(document.querySelectorAll("#pdfTableBody input[type='checkbox']"));
                const allChecked = checkboxes.length > 0 && checkboxes.every(cb => cb.checked);
                selectAllCheckbox.checked = allChecked;
            }
        });
    }
};