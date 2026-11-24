const fs = require("node:fs");
const fsPromises = require("node:fs/promises");
const path = require("node:path");

const MAX_COPY_NAME_ATTEMPTS = 1000;

function isValidDocxFilename(filename) {
    if (
        typeof filename !== "string" ||
        filename.length === 0 ||
        filename !== filename.trim() ||
        filename.includes("/") ||
        filename.includes("\\") ||
        filename.includes("\0") ||
        path.basename(filename) !== filename
    ) {
        return false;
    }

    const extension = path.extname(filename);
    if (extension.toLowerCase() !== ".docx") {
        return false;
    }

    const stem = filename.slice(0, -extension.length);
    if (
        stem.length === 0 ||
        /[<>:"|?*\x00-\x1F]/.test(filename) ||
        /[. ]$/.test(filename) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem)
    ) {
        return false;
    }

    return true;
}

function createDocxCopyHandler(uploadsDir, {
    fileSystem = fsPromises,
    maxNameAttempts = MAX_COPY_NAME_ATTEMPTS,
    logger = console
} = {}) {
    if (!Number.isSafeInteger(maxNameAttempts) || maxNameAttempts < 1) {
        throw new RangeError("maxNameAttempts must be a positive safe integer.");
    }

    return async (req, res) => {
        const filename = req.body && req.body.filename;
        if (!isValidDocxFilename(filename)) {
            return res.status(400).json({
                success: false,
                message: "A valid DOCX filename is required."
            });
        }

        const sourcePath = path.join(uploadsDir, filename);
        try {
            const sourceStats = await fileSystem.lstat(sourcePath);
            if (!sourceStats.isFile()) {
                return res.status(404).json({
                    success: false,
                    message: "Original DOCX file was not found"
                });
            }
        } catch (error) {
            if (error.code === "ENOENT") {
                return res.status(404).json({
                    success: false,
                    message: "Original DOCX file was not found"
                });
            }

            logger.error("Failed to inspect original DOCX file:", error);
            return res.status(500).json({
                success: false,
                message: "Unable to copy DOCX file"
            });
        }

        const { name, ext } = path.parse(filename);
        for (let attempt = 1; attempt <= maxNameAttempts; attempt += 1) {
            const suffix = attempt === 1 ? "_copy" : `_copy_${attempt}`;
            const copied = `${name}${suffix}${ext}`;
            const destinationPath = path.join(uploadsDir, copied);

            try {
                await fileSystem.copyFile(sourcePath, destinationPath, fs.constants.COPYFILE_EXCL);
                return res.json({
                    success: true,
                    message: "DOCX copied successfully",
                    original: filename,
                    copied
                });
            } catch (error) {
                if (error.code === "EEXIST") {
                    continue;
                }

                if (error.code === "ENOENT") {
                    return res.status(404).json({
                        success: false,
                        message: "Original DOCX file was not found"
                    });
                }

                logger.error("Failed to copy DOCX file:", error);
                return res.status(500).json({
                    success: false,
                    message: "Unable to copy DOCX file"
                });
            }
        }

        return res.status(409).json({
            success: false,
            message: "No unique destination name could be allocated"
        });
    };
}

function registerDocxCopyRoute(app, uploadsDir, options) {
    app.post("/documents/copy", createDocxCopyHandler(uploadsDir, options));
}

module.exports = {
    createDocxCopyHandler,
    registerDocxCopyRoute
};
