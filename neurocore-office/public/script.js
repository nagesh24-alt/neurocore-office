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

// Display PDF list
function displayPDFs(files, refreshFunction) {

    const pdfList = document.getElementById("pdfList");

    pdfList.innerHTML = "";

    if (files.length === 0) {
        pdfList.innerHTML = "<p>No PDFs found.</p>";
        document.getElementById("recent-count").textContent = "0 files";
        return;
    }

    document.getElementById("recent-count").textContent = `${files.length} files`;

    files.forEach(file => {

        const div = document.createElement("div");

        // Open PDF
        const link = document.createElement("a");

        link.href = "/pdf/" + encodeURIComponent(file);
        link.target = "_blank";
        link.innerHTML = "📄 " + file;
        // Load document information when clicked
link.onclick = () => {

    loadDocumentInfo(file);

};


        div.appendChild(link);

        // Delete Button
        const deleteButton = document.createElement("button");

        deleteButton.textContent = "🗑 Delete";

        deleteButton.onclick = async () => {

            if (!confirm(`Delete "${file}"?`))
                return;

            const response = await fetch("/pdf/" + encodeURIComponent(file), {
                method: "DELETE"
            });

            const result = await parseJsonResponse(response);

            alert(result.message);

            refreshFunction();

        };

        div.appendChild(deleteButton);

        // Rename Button
        const renameButton = document.createElement("button");

        renameButton.textContent = "✏ Rename";

        renameButton.onclick = async () => {

            let newName = prompt("Enter new PDF name:", file);

            if (!newName)
                return;

            // Automatically keep .pdf extension
            if (!newName.toLowerCase().endsWith(".pdf")) {
                newName += ".pdf";
            }

            const response = await fetch(
                "/pdf/" +
                encodeURIComponent(file) +
                "?newName=" +
                encodeURIComponent(newName),
                {
                    method: "PATCH"
                }
            );

            const result = await parseJsonResponse(response);

            alert(result.message);

            refreshFunction();

        };

        div.appendChild(renameButton);
        //move button
        const moveButton = document.createElement("button");

    moveButton.textContent = "📂 Move";

    moveButton.onclick = async () => {

        try {

            const folder = prompt(
                "Move to folder:\nBooks\nCollege\nNotes\nProjects\nArchive"
            );

            if (!folder)
                return;

            const response = await fetch("/pdf/move", {

                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    filename: file,
                    folder: folder
                })

            });

            const result = await parseJsonResponse(response);

            alert(result.message);

            loadPDFs();

        } catch (error) {
            alert(error.message);
        }

    };

div.appendChild(moveButton);

// =======================
//copy button
const copyButton = document.createElement("button");

copyButton.textContent = "📄 Copy";

copyButton.onclick = async () => {

    try {

        const folder = prompt(
            "Copy to folder:\nBooks\nCollege\nNotes\nProjects\nArchive"
        );

        if (!folder)
            return;

        const response = await fetch("/pdf/copy", {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                filename: file,
                folder: folder
            })

        });

        const result = await parseJsonResponse(response);

        alert(result.message);

    } catch (error) {
        alert(error.message);
    }

};

div.appendChild(copyButton);
//------------------
//PDF encryption
const protectButton = document.createElement("button");

protectButton.textContent = "🔒 Protect";

protectButton.onclick = async () => {

    const password = prompt("Enter password:");

    if (!password)
        return;

    const response = await fetch("/pdf/protect", {

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

    alert(result.message);

};

div.appendChild(protectButton);

        pdfList.appendChild(div);

    });

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
        protectedList.innerHTML = "<p>No protected PDFs found.</p>";
        return;
    }

    result.files.forEach(file => {

        const div = document.createElement("div");

        // Open Protected PDF
        const link = document.createElement("a");

        link.href = "/protected/" + encodeURIComponent(file);

        link.target = "_blank";

        link.innerHTML = "🔒 " + file;

        div.appendChild(link);

        // Delete Button
        const deleteButton = document.createElement("button");

        deleteButton.textContent = "🗑 Delete";

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

        div.appendChild(deleteButton);

        // Remove Password Button
        const removePasswordButton = document.createElement("button");

        removePasswordButton.textContent = "🔓 Remove Password";

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

        div.appendChild(removePasswordButton);

        protectedList.appendChild(div);

    });

}
// Load PDFs
async function loadPDFs() {

    const response = await fetch("/pdfs");

    const result = await parseJsonResponse(response);

    if (result.success) {
        displayPDFs(result.files, loadPDFs);
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
        displayPDFs(result.files, searchPDFs);
    }

}
// Show document information
async function loadDocumentInfo(file) {

    const response = await fetch(
        "/pdf/" + encodeURIComponent(file) + "/info"
    );

    const result = await parseJsonResponse(response);

    if (!result.success)
        return;

    const info = result.info;

    document.getElementById("documentInfo").innerHTML = `
        <p><strong>Filename:</strong> ${info.filename}</p>
        <p><strong>Extension:</strong> ${info.extension}</p>
        <p><strong>Size:</strong> ${info.size} bytes</p>
        <p><strong>Created:</strong> ${info.created}</p>
        <p><strong>Modified:</strong> ${info.modified}</p>
        <p><strong>Location:</strong> ${info.location}</p>
    `;

}

// Load PDFs when page opens
window.onload = () => {

    loadPDFs();
    
    loadProtectedPDFs();

};