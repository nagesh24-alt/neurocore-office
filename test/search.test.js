const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const scriptPath = path.join(__dirname, "..", "public", "script.js");
const source = fs.readFileSync(scriptPath, "utf8");

function extractSection(startMarker, endMarker) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start);

    assert.notEqual(start, -1, `Could not find ${startMarker} in ${scriptPath}`);
    assert.notEqual(end, -1, `Could not find ${endMarker} in ${scriptPath}`);
    return source.slice(start, end);
}

const searchHelpers = extractSection(
    "let selectionMode = false;",
    "function setProtectedStatusMessage"
);
const globalSearchHandler = extractSection(
    "function handleGlobalSearch(val)",
    "async function loadDocxFiles"
);

function loadSearchContext(masterFiles = []) {
    const dashboardCalls = [];
    const renderCalls = [];
    const context = vm.createContext({
        __masterFiles: masterFiles,
        __dashboardCalls: dashboardCalls,
        __renderCalls: renderCalls,
        pdfPageState: { currentPage: 4 },
        displayDashboard: files => dashboardCalls.push(files),
        renderPdfSectionData: () => renderCalls.push("pdf"),
        renderDocxFilesTable: () => renderCalls.push("docx")
    });

    vm.runInContext(
        `${searchHelpers}\n${globalSearchHandler}\n` +
        "currentDashboardFiles = __masterFiles;\n" +
        "globalThis.__searchState = () => ({ query: globalDocumentSearchQuery, page: pdfPageState.currentPage });",
        context,
        { filename: scriptPath }
    );

    return { context, dashboardCalls, renderCalls };
}

function createMasterFiles() {
    return Object.freeze([
        Object.freeze({
            name: "1786068716298-R_Programming.pdf",
            cleanName: "R Programming.pdf",
            type: "pdf",
            folder: "Root",
            path: "/Root/1786068716298-R_Programming.pdf",
            addedBy: "Nagesh",
            tags: Object.freeze(["DerivedOnly"]),
            searchTags: Object.freeze(["Uploaded", "PDF"])
        }),
        Object.freeze({
            name: "1793601089123-Project_Report.docx",
            cleanName: "Project Report.docx",
            type: "docx",
            folder: "College",
            folderName: "College Library",
            path: "/College/1793601089123-Project_Report.docx",
            addedBy: "Nagesh",
            tags: Object.freeze(["Research", "Draft"])
        }),
        Object.freeze({
            name: "Meeting-Minutes.docx",
            type: "docx",
            folder: "Meetings",
            tags: Object.freeze(["Minutes"])
        })
    ]);
}

test("normalizes case, separators, and repeated whitespace", () => {
    const { context } = loadSearchContext();

    assert.equal(
        context.normalizeDocumentSearchQuery("  PROJECT_Report--2026   "),
        "project report 2026"
    );
});

test("matches all tokens across names, folders, paths, authors, and tags", () => {
    const { context } = loadSearchContext();
    const [pdf, docx] = createMasterFiles();

    assert.equal(context.matchesDocumentSearch(pdf, "r programming"), true);
    assert.equal(context.matchesDocumentSearch(pdf, "uploaded root"), true);
    assert.equal(context.matchesDocumentSearch(pdf, "derivedonly"), false);
    assert.equal(context.matchesDocumentSearch(docx, "project_report college draft"), true);
    assert.equal(context.matchesDocumentSearch(docx, "college library research"), true);
    assert.equal(context.matchesDocumentSearch(docx, "missing"), false);
    assert.equal(context.matchesDocumentSearch(docx, "   "), true);
});

test("filters PDF and DOCX results without mutating master data, and clearing restores all", () => {
    const { context } = loadSearchContext();
    const masterFiles = createMasterFiles();
    const originalMetadata = masterFiles.map(file => [
        file.name,
        file.folder,
        file.folderName,
        file.path,
        [...file.tags]
    ]);

    const uploaded = Array.from(context.filterDocumentsBySearch(masterFiles, "uploaded"));
    const college = Array.from(context.filterDocumentsBySearch(masterFiles, "college"));
    const all = Array.from(context.filterDocumentsBySearch(masterFiles, ""));

    assert.deepEqual(uploaded.map(file => file.name), ["1786068716298-R_Programming.pdf"]);
    assert.deepEqual(college.map(file => file.name), ["1793601089123-Project_Report.docx"]);
    assert.deepEqual(
        uploaded.filter(file => file.type === "pdf").map(file => file.name),
        ["1786068716298-R_Programming.pdf"]
    );
    assert.deepEqual(
        college.filter(file => file.type === "docx").map(file => file.name),
        ["1793601089123-Project_Report.docx"]
    );
    assert.deepEqual(all, Array.from(masterFiles));
    assert.deepEqual(
        masterFiles.map(file => [
            file.name,
            file.folder,
            file.folderName,
            file.path,
            [...file.tags]
        ]),
        originalMetadata
    );
    assert.deepEqual(Array.from(context.filterDocumentsBySearch(null, "anything")), []);
});

test("global search dispatches to all views using the unchanged master list and resets on clear", () => {
    const masterFiles = createMasterFiles();
    const { context, dashboardCalls, renderCalls } = loadSearchContext(masterFiles);

    context.handleGlobalSearch(" Project_Report ");

    assert.equal(context.__searchState().query, "project report");
    assert.equal(context.__searchState().page, 1);
    assert.equal(dashboardCalls[0], masterFiles);
    assert.deepEqual(renderCalls, ["pdf", "docx"]);

    context.handleGlobalSearch("");

    assert.equal(context.__searchState().query, "");
    assert.equal(context.__searchState().page, 1);
    assert.equal(dashboardCalls[1], masterFiles);
    assert.deepEqual(renderCalls, ["pdf", "docx", "pdf", "docx"]);
    assert.deepEqual(
        Array.from(context.filterDocumentsBySearch(masterFiles, context.__searchState().query)),
        Array.from(masterFiles)
    );
});

test("dashboard, PDF, and DOCX renderers all apply the shared search logic", () => {
    assert.match(
        source,
        /const renderFiles = filterDocumentsBySearch\(files, globalDocumentSearchQuery\)/
    );
    assert.match(
        source,
        /filterDocumentsBySearch\(docxState\.files, globalDocumentSearchQuery\)/
    );
    assert.match(
        source,
        /const searchQuery = `\$\{globalDocumentSearchQuery\} \$\{pdfPageState\.searchQuery\}`;\s*filtered = filtered\.filter\(file => matchesDocumentSearch\(file, searchQuery\)\);/
    );
});
