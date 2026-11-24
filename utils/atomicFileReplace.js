const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

function replaceFileAtomically(filePath, data) {
    const temporaryPath = path.join(
        path.dirname(filePath),
        `.${path.basename(filePath)}.${randomUUID()}.tmp`
    );

    try {
        fs.writeFileSync(temporaryPath, data, { flag: "wx" });
        fs.renameSync(temporaryPath, filePath);
    } catch (error) {
        try {
            fs.unlinkSync(temporaryPath);
        } catch (cleanupError) {
            if (cleanupError.code !== "ENOENT") {
                console.error("Failed to remove temporary replacement file:", cleanupError);
            }
        }
        throw error;
    }
}

module.exports = { replaceFileAtomically };
