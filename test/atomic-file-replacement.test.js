const assert = require("node:assert/strict");
const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { replaceFileAtomically } = require("../utils/atomicFileReplace");

test("replaces a file without leaving a temporary file", async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "neurocore-atomic-replace-"));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));

    const targetPath = path.join(directory, "document.pdf");
    await fs.writeFile(targetPath, "original PDF");

    replaceFileAtomically(targetPath, Buffer.from("updated PDF"));

    assert.equal(await fs.readFile(targetPath, "utf8"), "updated PDF");
    assert.deepEqual(await fs.readdir(directory), ["document.pdf"]);
});

test("preserves the target and removes the temporary file when replacement fails", async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "neurocore-atomic-replace-"));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));

    const targetPath = path.join(directory, "target-directory");
    await fs.mkdir(targetPath);

    assert.throws(() => replaceFileAtomically(targetPath, Buffer.from("replacement")));
    assert.deepEqual(await fs.readdir(directory), ["target-directory"]);
    assert.deepEqual(await fs.readdir(targetPath), []);
});
