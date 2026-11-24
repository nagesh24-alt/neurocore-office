const assert = require("node:assert/strict");
const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const express = require("express");
const { registerDocxCopyRoute } = require("../routes/docxCopy");

const serverSources = [
    path.join(__dirname, "..", "server.js"),
    path.join(__dirname, "..", "neurocore-office", "server.js")
].map(serverPath => fsSync.readFileSync(serverPath, "utf8"));
const rootRoutePath = path.join(__dirname, "..", "routes", "docxCopy.js");
const nestedRoutePath = path.join(__dirname, "..", "neurocore-office", "routes", "docxCopy.js");

async function createTestServer(t, options = {}) {
    const uploadsDir = await fs.mkdtemp(path.join(os.tmpdir(), "neurocore-docx-copy-"));
    const app = express();
    app.use(express.json());
    registerDocxCopyRoute(app, uploadsDir, options);

    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.once("listening", resolve);
    });

    t.after(async () => {
        await new Promise((resolve, reject) => {
            server.close(error => error ? reject(error) : resolve());
        });
        await fs.rm(uploadsDir, { recursive: true, force: true });
    });

    const { port } = server.address();
    return { uploadsDir, url: `http://127.0.0.1:${port}/documents/copy` };
}

async function postCopy(url, payload) {
    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    return { status: response.status, body: await response.json() };
}

test("mounts the DOCX copy route in both server entrypoints", () => {
    for (const source of serverSources) {
        assert.match(
            source,
            /registerDocxCopyRoute\(app,\s*path\.join\(__dirname,\s*["']uploads["']\)\)/
        );
    }
});

test("keeps the nested app's copy route implementation in sync", () => {
    assert.equal(
        fsSync.readFileSync(nestedRoutePath, "utf8"),
        fsSync.readFileSync(rootRoutePath, "utf8")
    );
});

test("copies DOCX files using the requested unique name sequence", async t => {
    const { uploadsDir, url } = await createTestServer(t);
    const filename = "Project_Report.docx";
    const contents = Buffer.from("DOCX fixture contents");
    await fs.writeFile(path.join(uploadsDir, filename), contents);

    for (const [index, copied] of [
        "Project_Report_copy.docx",
        "Project_Report_copy_2.docx",
        "Project_Report_copy_3.docx"
    ].entries()) {
        const result = await postCopy(url, { filename });

        assert.equal(result.status, 200);
        assert.deepEqual(result.body, {
            success: true,
            message: "DOCX copied successfully",
            original: filename,
            copied
        });
        assert.deepEqual(await fs.readFile(path.join(uploadsDir, copied)), contents);
    }
});

test("rejects missing, invalid, and path-based DOCX filenames", async t => {
    const { url } = await createTestServer(t);
    const invalidPayloads = [
        {},
        { filename: "" },
        { filename: "../Project_Report.docx" },
        { filename: "folder/Project_Report.docx" },
        { filename: "folder\\Project_Report.docx" },
        { filename: "Project_Report.pdf" },
        { filename: "CON.docx" },
        { filename: "Project_Report.docx " }
    ];

    for (const payload of invalidPayloads) {
        const result = await postCopy(url, payload);
        assert.equal(result.status, 400);
        assert.deepEqual(result.body, {
            success: false,
            message: "A valid DOCX filename is required."
        });
    }
});

test("returns 404 when the original DOCX file does not exist", async t => {
    const { url } = await createTestServer(t);
    const result = await postCopy(url, { filename: "Project_Report.docx" });

    assert.equal(result.status, 404);
    assert.deepEqual(result.body, {
        success: false,
        message: "Original DOCX file was not found"
    });
});

test("returns 409 when all bounded destination names are occupied", async t => {
    const { uploadsDir, url } = await createTestServer(t, { maxNameAttempts: 2 });
    await fs.writeFile(path.join(uploadsDir, "Project_Report.docx"), "original");
    await fs.writeFile(path.join(uploadsDir, "Project_Report_copy.docx"), "existing copy");
    await fs.writeFile(path.join(uploadsDir, "Project_Report_copy_2.docx"), "existing copy 2");

    const result = await postCopy(url, { filename: "Project_Report.docx" });

    assert.equal(result.status, 409);
    assert.deepEqual(result.body, {
        success: false,
        message: "No unique destination name could be allocated"
    });
    assert.equal(await fs.readFile(path.join(uploadsDir, "Project_Report_copy.docx"), "utf8"), "existing copy");
    assert.equal(await fs.readFile(path.join(uploadsDir, "Project_Report_copy_2.docx"), "utf8"), "existing copy 2");
});

test("returns a consistent 500 response for unexpected filesystem errors", async t => {
    const fileSystem = {
        lstat: filename => fs.lstat(filename),
        copyFile: async () => {
            const error = new Error("simulated filesystem failure");
            error.code = "EIO";
            throw error;
        }
    };
    const logger = { error() {} };
    const { uploadsDir, url } = await createTestServer(t, { fileSystem, logger });
    await fs.writeFile(path.join(uploadsDir, "Project_Report.docx"), "original");

    const result = await postCopy(url, { filename: "Project_Report.docx" });

    assert.equal(result.status, 500);
    assert.deepEqual(result.body, {
        success: false,
        message: "Unable to copy DOCX file"
    });
});
