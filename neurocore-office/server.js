const express = require("express");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const upload = require("./middleware/uploadMiddleware");

const app = express();

const ALLOWED_FOLDERS = ["Books", "College", "Notes", "Projects", "Archive"];

app.use(express.json());
app.use(express.static("public"));
//upload PDF API
app.post("/upload", (req, res) => {

    upload.single("file")(req, res, (err) => {

        if (err) {
            return res.status(400).json({
                success: false,
                message: err.message
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "No file uploaded."
            });
        }

        res.json({
            success: true,
            filename: req.file.filename
        });

    });

});
//list uploaded PDFs API
app.get("/pdfs", (req, res) => {

    const uploadFolder = path.join(__dirname, "uploads");

    fs.readdir(uploadFolder, (err, files) => {

        if (err) {
            return res.status(500).json({
                success: false,
                message: "Unable to read uploads folder."
            });
        }

        const pdfFiles = files.filter(file =>
            file.toLowerCase().endsWith(".pdf")
        );

        res.json({
            success: true,
            total: pdfFiles.length,
            files: pdfFiles
        });

    });

});
// List Protected PDFs
app.get("/protected-pdfs", (req, res) => {

    const folder = path.join(__dirname, "protected");

    if (!fs.existsSync(folder)) {
        return res.json({
            success: true,
            total: 0,
            files: []
        });
    }

    fs.readdir(folder, (err, files) => {

        if (err) {
            return res.status(500).json({
                success: false,
                message: "Unable to read protected folder."
            });
        }

        const pdfs = files.filter(file =>
            file.toLowerCase().endsWith(".pdf")
        );

        res.json({
            success: true,
            total: pdfs.length,
            files: pdfs
        });

    });

});
//Move PDFs API
app.post("/pdf/move", (req, res) => {

    const { filename, folder } = req.body;

    if (!filename || !folder) {
        return res.status(400).json({
            success: false,
            message: "Filename and folder are required."
        });
    }
     if (!ALLOWED_FOLDERS.includes(folder)) {
        return res.status(400).json({
            success: false,
            message: "Invalid folder. Use: " + ALLOWED_FOLDERS.join(", ")
        });
    }

    const source = path.join(__dirname, "uploads", filename);
    const destinationDir = path.join(__dirname, "documents", folder);
    const destination = path.join(destinationDir, filename);

    if (!fs.existsSync(source)) {
        return res.status(404).json({
            success: false,
            message: "PDF not found."
        });
    }

    fs.mkdirSync(destinationDir, { recursive: true });

    fs.rename(source, destination, (err) => {

        if (err) {
            return res.status(500).json({
                success: false,
                message: "Unable to move PDF."
            });
        }

        res.json({
            success: true,
            message: "PDF moved successfully."
        });

    });

});
//Copy PDFs API
app.post("/pdf/copy", (req, res) => {

    const { filename, folder } = req.body;

    if (!filename || !folder) {
        return res.status(400).json({
            success: false,
            message: "Filename and folder are required."
        });
    }

    if (!ALLOWED_FOLDERS.includes(folder)) {
        return res.status(400).json({
            success: false,
            message: "Invalid folder. Use: " + ALLOWED_FOLDERS.join(", ")
        });
    }

    const source = path.join(__dirname, "uploads", filename);
    const destinationDir = path.join(__dirname, "documents", folder);
    const destination = path.join(destinationDir, filename);

    if (!fs.existsSync(source)) {
        return res.status(404).json({
            success: false,
            message: "PDF not found."
        });
    }

    fs.mkdirSync(destinationDir, { recursive: true });

    fs.copyFile(source, destination, (err) => {

        if (err) {
            return res.status(500).json({
                success: false,
                message: "Unable to copy PDF."
            });
        }

        res.json({
            success: true,
            message: "PDF copied successfully."
        });

    });

});
//open PDF API
app.get("/pdf/:filename", (req, res) => {

    const filename = req.params.filename;

    const filePath = path.join(__dirname, "uploads", filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({
            success: false,
            message: "PDF not found."
        });
    }

    res.sendFile(filePath);

});

//Delete uploaded PDFs
app.delete("/pdf/:filename", (req, res) => {

    const filename = req.params.filename;
    const filePath = path.join(__dirname, "uploads", filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({
            success: false,
            message: "PDF not found."
        });
    }

    fs.unlink(filePath, (err) => {

        if (err) {
            return res.status(500).json({
                success: false,
                message: "Unable to delete PDF."
            });
        }

        res.json({
            success: true,
            message: "PDF deleted successfully."
        });

    });

});
// Open Protected PDF API
app.get("/protected/:filename", (req, res) => {

    const filename = req.params.filename;

    const filePath = path.join(__dirname, "protected", filename);

    if (!fs.existsSync(filePath)) {

        return res.status(404).json({
            success: false,
            message: "Protected PDF not found."
        });

    }

    res.sendFile(filePath);

});

//Delete Protected PDFs
app.delete("/protected/:filename", (req, res) => {

    const filename = req.params.filename;

    const filePath = path.join(__dirname, "protected", filename);

    if (!fs.existsSync(filePath)) {

        return res.status(404).json({
            success: false,
            message: "PDF not found."
        });

    }

    fs.unlink(filePath, (err) => {

        if (err) {

            return res.status(500).json({
                success: false,
                message: "Unable to delete PDF."
            });

        }

        res.json({
            success: true,
            message: "PDF deleted successfully."
        });

    });

});
//Search PDFs
app.get("/pdfs/search", (req, res) => {

    const query = req.query.q?.toLowerCase() || "";

    const uploadFolder = path.join(__dirname, "uploads");

    fs.readdir(uploadFolder, (err, files) => {

        if (err) {

            return res.status(500).json({
                success: false,
                message: "Unable to search PDFs."
            });

        }

        const results = files.filter(file =>
            file.toLowerCase().includes(query) &&
            file.toLowerCase().endsWith(".pdf")
        );

        res.json({
            success: true,
            total: results.length,
            files: results
        });

    });

});
//Rename PDFs
app.patch("/pdf/:filename", (req, res) => {

    const oldFilename = req.params.filename;

    const newFilename = req.query.newName;

    if (!newFilename) {
        return res.status(400).json({
            success: false,
            message: "New filename is required."
        });
    }

    const oldPath = path.join(__dirname, "uploads", oldFilename);

    const newPath = path.join(__dirname, "uploads", newFilename);

    if (!fs.existsSync(oldPath)) {
        return res.status(404).json({
            success: false,
            message: "PDF not found."
        });
    }

    fs.rename(oldPath, newPath, (err) => {

        if (err) {
            return res.status(500).json({
                success: false,
                message: "Unable to rename PDF."
            });
        }

        res.json({
            success: true,
            message: "PDF renamed successfully."
        });

    });

});
//document information API
app.get("/pdf/:filename/info", (req, res) => {

    const filename = req.params.filename;

    const filePath = path.join(__dirname, "uploads", filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({
            success: false,
            message: "PDF not found."
        });
    }

    fs.stat(filePath, (err, stats) => {

        if (err) {
            return res.status(500).json({
                success: false,
                message: "Unable to read file information."
            });
        }

        res.json({
            success: true,
            info: {
                filename: filename,
                extension: path.extname(filename),
                size: stats.size,
                created: stats.birthtime,
                modified: stats.mtime,
                location: filePath
            }
        });

    });

});
//PDF encryption API
app.post("/pdf/protect", (req, res) => {

    const { filename, password } = req.body;

    if (!filename || !password) {
        return res.status(400).json({
            success: false,
            message: "Filename and password are required."
        });
    }

    const input = path.join(__dirname, "uploads", filename);

    const protectedDir = path.join(__dirname, "protected");
    const output = path.join(
        protectedDir,
        filename.replace(".pdf", "_protected.pdf")
    );

    if (!fs.existsSync(input)) {
        return res.status(404).json({
            success: false,
            message: "PDF not found."
        });
    }

    fs.mkdirSync(protectedDir, { recursive: true });

    const ownerPassword = "NeuroCoreOfficeOwner123";

    execFile(
        "qpdf",
        [
            "--encrypt",
            password,
            ownerPassword,
            "256",
            "--print=full",
            "--modify=all",
            "--extract=y",
            "--",
            input,
            output
        ],
        (error, stdout, stderr) => {

            if (error) {
                return res.status(500).json({
                    success: false,
                    message: stderr || error.message
                });
            }

            res.json({
                success: true,
                message: "PDF encrypted successfully. Saved to protected folder.",
                file: path.basename(output)
            });

        }
    );

});

// Remove password / decrypt protected PDF API
app.post("/pdf/unprotect", (req, res) => {

    const { filename, password } = req.body;

    if (!filename || !password) {
        return res.status(400).json({
            success: false,
            message: "Filename and password are required."
        });
    }

    const protectedPath = path.join(__dirname, "protected", filename);

    if (!fs.existsSync(protectedPath)) {
        return res.status(404).json({
            success: false,
            message: "Protected PDF not found."
        });
    }

    const uploadsDir = path.join(__dirname, "uploads");
    fs.mkdirSync(uploadsDir, { recursive: true });

    // Strip the _protected suffix if present so we restore original name
    const baseName = filename.endsWith("_protected.pdf")
        ? filename.replace("_protected.pdf", ".pdf")
        : filename;

    const outputPath = path.join(uploadsDir, baseName);

    execFile(
        "qpdf",
        [
            "--password=" + password,
            "--decrypt",
            protectedPath,
            outputPath
        ],
        (error, stdout, stderr) => {

            if (error) {
                const message =
                    stderr && stderr.toLowerCase().includes("incorrect password")
                        ? "Invalid Password please try again later"
                        : stderr || error.message;

                return res.status(400).json({
                    success: false,
                    message
                });
            }

            fs.unlink(protectedPath, (unlinkError) => {

                if (unlinkError) {
                    return res.status(500).json({
                        success: false,
                        message: "File decrypted, but protected copy could not be removed."
                    });
                }

                res.json({
                    success: true,
                    message: "Password removed. File moved to uploads and removed from protected folder.",
                    file: path.basename(outputPath)
                });

            });

        }
    );

});
//Start the server
const PORT = 3000;

app.listen(PORT, () => {
  console.log(`🚀 NeuroCore Office running at http://localhost:${PORT}`);
});