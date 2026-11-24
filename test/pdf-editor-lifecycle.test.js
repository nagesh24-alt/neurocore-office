const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

const editorSource = fs.readFileSync(
    path.join(__dirname, "..", "public", "pdf-editor.js"),
    "utf8"
);

function createEditorContext() {
    const container = { innerHTML: "" };
    const context = vm.createContext({
        window: { addEventListener() {} },
        btoa: binary => Buffer.from(binary, "binary").toString("base64"),
        document: {
            addEventListener() {},
            getElementById(id) {
                return id === "ncPagesContainer" ? container : null;
            }
        },
        console: { error() {}, warn() {} }
    });

    vm.runInContext(
        `${editorSource}\nglobalThis.__pdfEditorTest = { pdfState, loadPdfDocument, cleanupPdfDocument, awaitTrackedRenderTask, trackPdfOperation, bytesToBase64 };`,
        context
    );

    context.loadBackendAnnotations = async () => {};
    context.renderAllPages = async () => {};
    context.renderThumbnails = async () => {};
    context.loadDocumentMetadata = async () => {};
    context.updatePageCounters = () => {};
    context.showToast = () => {};

    return { context, container, api: context.__pdfEditorTest };
}

test("shows the existing error UI and skips the PDF request when PDF.js is unavailable", async () => {
    const { api, container } = createEditorContext();

    await api.loadPdfDocument("document.pdf");

    assert.match(container.innerHTML, /PDF\.js failed to load/);
});

test("encodes large PDF byte arrays without exceeding the call stack", () => {
    const { api } = createEditorContext();
    const bytes = Uint8Array.from({ length: 200000 }, (_, index) => index % 256);

    assert.equal(
        api.bytesToBase64(bytes),
        Buffer.from(bytes).toString("base64")
    );
});

test("a stale loading task cannot replace a newer document", async () => {
    const { context, api } = createEditorContext();
    const loads = [];

    context.window.pdfjsLib = {
        getDocument({ url }) {
            let resolve;
            const promise = new Promise(resolvePromise => {
                resolve = resolvePromise;
            });
            const task = {
                promise,
                destroy: async () => {}
            };
            loads.push({ url, resolve, task });
            return task;
        }
    };

    const firstLoad = api.loadPdfDocument("first.pdf");
    await new Promise(resolve => setImmediate(resolve));
    const secondLoad = api.loadPdfDocument("second.pdf");
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(loads.length, 2);
    const secondDocument = { numPages: 1, destroy: async () => {} };
    loads[1].resolve(secondDocument);
    await secondLoad;

    let staleDocumentDestroyed = false;
    loads[0].resolve({
        numPages: 9,
        async destroy() {
            staleDocumentDestroyed = true;
        }
    });
    await firstLoad;

    assert.equal(api.pdfState.pdfDoc, secondDocument);
    assert.equal(api.pdfState.loadingTask, null);
    assert.equal(staleDocumentDestroyed, true);
});

test("reload waits for active render tasks before destroying the current document", async () => {
    const { context, api } = createEditorContext();
    const events = [];
    let rejectRender;
    let resolveOperation;
    const oldDocument = {
        numPages: 1,
        async destroy() {
            events.push("destroy-document");
        }
    };
    const renderTask = {
        promise: new Promise((resolve, reject) => {
            rejectRender = reject;
        }),
        cancel() {
            events.push("cancel-render");
            rejectRender(new Error("Rendering cancelled"));
        }
    };
    const renderPromise = api.awaitTrackedRenderTask(renderTask).catch(() => {});
    const operationPromise = new Promise(resolve => {
        resolveOperation = resolve;
    });
    const trackedOperation = api.trackPdfOperation(operationPromise);
    api.pdfState.pdfDoc = oldDocument;
    api.pdfState.numPages = 1;
    api.pdfState.renderTasks.set(renderTask, renderTask);

    context.window.pdfjsLib = {
        getDocument() {
            events.push("load-document");
            return {
                promise: Promise.resolve({ numPages: 1, destroy: async () => {} }),
                destroy: async () => {}
            };
        }
    };

    const reload = api.loadPdfDocument("next.pdf");
    await new Promise(resolve => setImmediate(resolve));

    assert.deepEqual(events, ["cancel-render"]);

    resolveOperation();
    await Promise.all([reload, renderPromise, trackedOperation]);

    assert.deepEqual(events, ["cancel-render", "destroy-document", "load-document"]);
});
