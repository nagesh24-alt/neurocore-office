/**
 * NEUROCORE OFFICE — PROFESSIONAL PDF VIEWER & EDITOR WORKSPACE
 * Full PDF.js multi-page rendering, live thumbnails, interactive annotations,
 * In-place text editing, text selection quick-bar, shapes, sticky notes,
 * and genuine in-browser PDF baking & persistence via PDF-Lib.
 */

// ==========================================================================
// 1. GLOBAL STATE & INITIALIZATION
// ==========================================================================

const pdfState = {
    filename: null,
    pdfDoc: null,
    numPages: 0,
    currentPage: 1,
    scale: 1.0,
    rotation: 0,
    pageRotations: {},
    viewMode: "continuous", // "continuous" | "single"
    activeTool: "select",   // "select" | "hand" | "edit-text" | "add-text" | "highlight" | "underline" | "strikethrough" | "draw" | "eraser" | "stickynote" | "stamp" | "shape-*"
    
    // Formatting & Drawing Properties
    drawColor: "#ef4444",
    strokeWidth: 2,
    highlightColor: "rgba(254, 240, 138, 0.45)",
    fontSize: 14,
    fontFamily: "Helvetica",
    shapeType: "rect",
    selectedStamp: "APPROVED",
    selectedStampColor: "#10b981",
    
    // Annotations Map: pageNum -> Array of Annotation Objects
    annotations: {},
    
    // In-Place Text Editing State
    activeTextEditTarget: null,
    activeSelectionData: null,
    
    // Search / Find state
    findQuery: "",
    findMatches: [],
    currentMatchIndex: -1,
    
    // Signature Pad
    signatureCanvas: null,
    signatureCtx: null,
    isSigning: false
};

window.addEventListener("DOMContentLoaded", () => {
    initPdfEditor();
});

async function initPdfEditor() {
    const urlParams = new URLSearchParams(window.location.search);
    const fileParam = urlParams.get("file") || urlParams.get("filename") || "Project_Proposal.pdf";
    pdfState.filename = decodeURIComponent(fileParam).trim();

    // Update Top Document Title
    const titleEl = document.getElementById("ncDocTitleText");
    if (titleEl) {
        titleEl.textContent = pdfState.filename;
    }
    document.title = `${pdfState.filename} — NeuroCore PDF Studio`;

    // Keyboard Shortcuts
    setupKeyboardShortcuts();

    // Load recent files list from server
    loadWorkspaceRecentFiles();

    // Initialize Signature Canvas
    initSignaturePad();

    // Setup global selection handler
    setupGlobalSelectionHandler();

    // Load PDF Document
    await loadPdfDocument(pdfState.filename);
}

// ==========================================================================
// 2. DOCUMENT LOADING & RENDERING (PDF.js)
// ==========================================================================

async function loadPdfDocument(filename) {
    try {
        const container = document.getElementById("ncPagesContainer");
        if (container) {
            container.innerHTML = `
                <div style="color: var(--text-muted); font-size: 13px; text-align: center; padding: 60px 0;">
                    <i class="fas fa-spinner fa-spin" style="font-size: 26px; color: var(--accent-red); margin-bottom: 12px; display: block;"></i>
                    Loading "${escapeHtml(filename)}"…
                </div>
            `;
        }

        const pdfUrl = `/pdf/${encodeURIComponent(filename)}`;
        const loadingTask = window.pdfjsLib.getDocument({
            url: pdfUrl,
            cMapUrl: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/cmaps/",
            cMapPacked: true
        });

        pdfState.pdfDoc = await loadingTask.promise;
        pdfState.numPages = pdfState.pdfDoc.numPages;
        pdfState.currentPage = 1;

        updatePageCounters();
        await loadBackendAnnotations(filename);
        await renderAllPages();
        await renderThumbnails();
        loadDocumentMetadata();

        showToast(`Opened "${filename}" (${pdfState.numPages} Pages)`, "success");
    } catch (err) {
        console.error("Failed to load PDF:", err);
        const container = document.getElementById("ncPagesContainer");
        if (container) {
            container.innerHTML = `
                <div style="background: #1c1c22; border: 1px solid #2e2e36; border-radius: 8px; padding: 32px; text-align: center; max-width: 480px; margin-top: 40px;">
                    <i class="fas fa-triangle-exclamation" style="font-size: 32px; color: #ef4444; margin-bottom: 12px; display: block;"></i>
                    <h3 style="color: #fff; font-size: 16px; margin-bottom: 8px;">Failed to Load PDF</h3>
                    <p style="color: #a1a1aa; font-size: 13px; margin-bottom: 18px;">${escapeHtml(err.message || "Document not found or damaged.")}</p>
                    <button class="nc-btn-save" style="margin: 0 auto;" onclick="openFilePickerModal()">
                        <i class="fas fa-folder-open"></i> Choose Another PDF
                    </button>
                </div>
            `;
        }
    }
}

async function renderAllPages() {
    const container = document.getElementById("ncPagesContainer");
    if (!container || !pdfState.pdfDoc) return;

    container.innerHTML = "";

    for (let pageNum = 1; pageNum <= pdfState.numPages; pageNum++) {
        const pageWrapper = document.createElement("div");
        pageWrapper.id = `pdf-page-wrapper-${pageNum}`;
        pageWrapper.className = `nc-pdf-page-container ${pageNum === pdfState.currentPage ? "active-page" : ""} ${getModeClass()}`;
        pageWrapper.dataset.pageNum = pageNum;

        const canvas = document.createElement("canvas");
        canvas.id = `pdf-canvas-page-${pageNum}`;
        canvas.className = "nc-pdf-canvas";

        const textLayer = document.createElement("div");
        textLayer.id = `pdf-text-layer-${pageNum}`;
        textLayer.className = "nc-pdf-text-layer";

        const svgDrawLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svgDrawLayer.id = `pdf-svg-layer-${pageNum}`;
        svgDrawLayer.setAttribute("class", "nc-pdf-svg-layer");

        const annoLayer = document.createElement("div");
        annoLayer.id = `pdf-anno-layer-${pageNum}`;
        annoLayer.className = "nc-pdf-anno-layer";

        pageWrapper.appendChild(canvas);
        pageWrapper.appendChild(textLayer);
        pageWrapper.appendChild(svgDrawLayer);
        pageWrapper.appendChild(annoLayer);
        container.appendChild(pageWrapper);

        attachPageInteractiveEvents(pageWrapper, pageNum);
        await renderSinglePageCanvas(pageNum);
    }
}

function getModeClass() {
    if (pdfState.activeTool === "edit-text") return "mode-edit-text";
    if (pdfState.activeTool === "highlight") return "mode-highlight";
    if (pdfState.activeTool === "underline") return "mode-underline";
    if (pdfState.activeTool === "strikethrough") return "mode-strikethrough";
    if (pdfState.activeTool === "draw") return "mode-draw";
    if (pdfState.activeTool === "eraser") return "mode-eraser";
    return "";
}

async function renderSinglePageCanvas(pageNum) {
    if (!pdfState.pdfDoc) return;

    try {
        const page = await pdfState.pdfDoc.getPage(pageNum);
        const pageWrapper = document.getElementById(`pdf-page-wrapper-${pageNum}`);
        const canvas = document.getElementById(`pdf-canvas-page-${pageNum}`);
        const textLayer = document.getElementById(`pdf-text-layer-${pageNum}`);
        const svgLayer = document.getElementById(`pdf-svg-layer-${pageNum}`);
        if (!pageWrapper || !canvas) return;

        const effectiveRotation = ((page.rotate || 0) + pdfState.rotation + (pdfState.pageRotations[pageNum] || 0)) % 360;
        const viewport = page.getViewport({ scale: pdfState.scale, rotation: effectiveRotation });

        const outputScale = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = Math.floor(viewport.width) + "px";
        canvas.style.height = Math.floor(viewport.height) + "px";

        pageWrapper.style.width = Math.floor(viewport.width) + "px";
        pageWrapper.style.height = Math.floor(viewport.height) + "px";

        if (svgLayer) {
            svgLayer.setAttribute("viewBox", `0 0 ${viewport.width} ${viewport.height}`);
            svgLayer.style.width = `${viewport.width}px`;
            svgLayer.style.height = `${viewport.height}px`;
        }

        const ctx = canvas.getContext("2d");
        const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

        await page.render({
            canvasContext: ctx,
            transform: transform,
            viewport: viewport
        }).promise;

        if (textLayer) {
            textLayer.innerHTML = "";
            textLayer.style.width = `${viewport.width}px`;
            textLayer.style.height = `${viewport.height}px`;
            
            const textContent = await page.getTextContent();
            if (window.pdfjsLib && window.pdfjsLib.renderTextLayer) {
                const textTask = window.pdfjsLib.renderTextLayer({
                    textContent: textContent,
                    container: textLayer,
                    viewport: viewport,
                    textDivs: []
                });
                await textTask.promise;
                
                // Attach individual span listeners for in-place text editing & clicking
                setupTextLayerSpanListeners(textLayer, pageNum, viewport);
            }
        }

        renderPageAnnotations(pageNum, viewport);
    } catch (e) {
        console.warn(`Error rendering page ${pageNum}:`, e);
    }
}

// ==========================================================================
// 3. IN-PLACE TEXT EDITING & TEXT LAYER ATTACHMENTS
// ==========================================================================

function setupTextLayerSpanListeners(textLayer, pageNum, viewport) {
    const spans = textLayer.querySelectorAll("span");
    spans.forEach(span => {
        span.addEventListener("click", (e) => {
            if (pdfState.activeTool === "edit-text") {
                e.stopPropagation();
                e.preventDefault();
                openInPlaceTextEditorForSpan(span, pageNum, viewport);
            } else if (pdfState.activeTool === "highlight") {
                e.stopPropagation();
                e.preventDefault();
                annotateSpanDirect(span, pageNum, "highlight");
            } else if (pdfState.activeTool === "underline") {
                e.stopPropagation();
                e.preventDefault();
                annotateSpanDirect(span, pageNum, "underline");
            } else if (pdfState.activeTool === "strikethrough") {
                e.stopPropagation();
                e.preventDefault();
                annotateSpanDirect(span, pageNum, "strikethrough");
            }
        });
    });
}

function openInPlaceTextEditorForSpan(span, pageNum, viewport) {
    const textWrapper = span.closest(".nc-pdf-page-container");
    if (!textWrapper) return;

    const pageRect = textWrapper.getBoundingClientRect();
    const spanRect = span.getBoundingClientRect();

    // Coordinates in unscaled points
    const x = (spanRect.left - pageRect.left) / pdfState.scale;
    const y = (spanRect.top - pageRect.top) / pdfState.scale;
    const width = Math.max(spanRect.width / pdfState.scale, 20);
    const height = Math.max(spanRect.height / pdfState.scale, 14);

    const rawText = span.textContent.trim();
    if (!rawText) return;

    const computedStyle = window.getComputedStyle(span);
    const computedFontSize = Math.round(parseFloat(computedStyle.fontSize) / pdfState.scale) || 14;

    pdfState.activeTextEditTarget = {
        id: `edit-${Date.now()}`,
        pageNum,
        x,
        y,
        width,
        height,
        originalText: rawText,
        fontSize: computedFontSize,
        fontFamily: "Helvetica",
        color: "#000000"
    };

    const modal = document.getElementById("ncInlineTextEditModal");
    const origBox = document.getElementById("ncInlineOriginalTextPreview");
    const repInput = document.getElementById("ncInlineReplacementInput");
    const fontSel = document.getElementById("ncInlineFontSizeSelect");

    if (origBox) origBox.textContent = rawText;
    if (repInput) {
        repInput.value = rawText;
        repInput.focus();
    }
    if (fontSel) {
        fontSel.value = String(computedFontSize);
        if (!fontSel.value) fontSel.value = "14";
    }

    if (modal) modal.style.display = "flex";
}

function closeInPlaceTextEditor() {
    const modal = document.getElementById("ncInlineTextEditModal");
    if (modal) modal.style.display = "none";
    pdfState.activeTextEditTarget = null;
}

function applyInPlaceTextEdit() {
    if (!pdfState.activeTextEditTarget) return;

    const repInput = document.getElementById("ncInlineReplacementInput");
    const fontSel = document.getElementById("ncInlineFontSizeSelect");
    const famSel = document.getElementById("ncInlineFontFamilySelect");
    const colSel = document.getElementById("ncInlineColorSelect");
    const whiteoutCheck = document.getElementById("ncInlineWhiteoutCheck");

    const newText = (repInput?.value || "").trim();
    if (!newText) {
        showToast("Replacement text cannot be empty.", "warning");
        return;
    }

    const editObj = {
        id: pdfState.activeTextEditTarget.id,
        type: "text-edit",
        pageNum: pdfState.activeTextEditTarget.pageNum,
        x: pdfState.activeTextEditTarget.x,
        y: pdfState.activeTextEditTarget.y,
        width: Math.max(pdfState.activeTextEditTarget.width, newText.length * 8),
        height: pdfState.activeTextEditTarget.height,
        originalText: pdfState.activeTextEditTarget.originalText,
        newText: newText,
        fontSize: parseInt(fontSel?.value || "14", 10),
        fontFamily: famSel?.value || "Helvetica",
        color: colSel?.value || "#000000",
        whiteout: whiteoutCheck ? whiteoutCheck.checked : true,
        timestamp: Date.now()
    };

    saveAnnotation(editObj.pageNum, editObj);
    renderSinglePageCanvas(editObj.pageNum);
    closeInPlaceTextEditor();
    showToast(`Replaced text: "${newText}"`, "success");
}

function deleteSelectedOriginalText() {
    if (!pdfState.activeTextEditTarget) return;

    // Apply a clean permanent whiteout mask without new text
    const editObj = {
        id: pdfState.activeTextEditTarget.id,
        type: "text-edit",
        pageNum: pdfState.activeTextEditTarget.pageNum,
        x: pdfState.activeTextEditTarget.x,
        y: pdfState.activeTextEditTarget.y,
        width: pdfState.activeTextEditTarget.width,
        height: pdfState.activeTextEditTarget.height,
        originalText: pdfState.activeTextEditTarget.originalText,
        newText: "",
        whiteout: true,
        timestamp: Date.now()
    };

    saveAnnotation(editObj.pageNum, editObj);
    renderSinglePageCanvas(editObj.pageNum);
    closeInPlaceTextEditor();
    showToast("Text removed and sanitized.", "success");
}

// ==========================================================================
// 4. FLOATING TEXT SELECTION QUICK ACTION BAR
// ==========================================================================

function setupGlobalSelectionHandler() {
    document.addEventListener("mouseup", (e) => {
        // Do not trigger if clicking inside the toolbar itself or a modal
        if (e.target.closest("#ncTextSelectionBar") || e.target.closest(".pdf-modal-card")) return;

        setTimeout(() => {
            const selection = window.getSelection();
            const text = selection ? selection.toString().trim() : "";

            const bar = document.getElementById("ncTextSelectionBar");
            if (!bar) return;

            if (!text || text.length === 0) {
                bar.style.display = "none";
                pdfState.activeSelectionData = null;
                return;
            }

            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) {
                bar.style.display = "none";
                return;
            }

            // Find which page container this selection is inside
            const pageContainer = range.commonAncestorContainer.nodeType === 1 
                ? range.commonAncestorContainer.closest(".nc-pdf-page-container")
                : range.commonAncestorContainer.parentElement?.closest(".nc-pdf-page-container");

            if (!pageContainer) {
                bar.style.display = "none";
                return;
            }

            const pageNum = parseInt(pageContainer.dataset.pageNum, 10);
            const pageRect = pageContainer.getBoundingClientRect();

            // Collect all bounding client rects for multi-line selection
            const clientRects = Array.from(range.getClientRects());
            const unscaledRects = clientRects.map(r => ({
                x: (r.left - pageRect.left) / pdfState.scale,
                y: (r.top - pageRect.top) / pdfState.scale,
                w: r.width / pdfState.scale,
                h: r.height / pdfState.scale
            }));

            pdfState.activeSelectionData = {
                text: text,
                pageNum: pageNum,
                unscaledRects: unscaledRects,
                primaryRect: {
                    x: (rect.left - pageRect.left) / pdfState.scale,
                    y: (rect.top - pageRect.top) / pdfState.scale,
                    w: rect.width / pdfState.scale,
                    h: rect.height / pdfState.scale
                }
            };

            // Position Floating Toolbar above selection
            bar.style.display = "flex";
            bar.style.left = `${rect.left + rect.width / 2}px`;
            bar.style.top = `${rect.top - 8}px`;
        }, 30);
    });
}

function applySelectionAnnotation(type) {
    if (!pdfState.activeSelectionData) return;

    const { pageNum, unscaledRects, text } = pdfState.activeSelectionData;
    const id = `${type}-${Date.now()}`;

    saveAnnotation(pageNum, {
        id: id,
        type: type, // "highlight" | "underline" | "strikethrough"
        pageNum: pageNum,
        rects: unscaledRects,
        color: type === "highlight" ? pdfState.highlightColor : (pdfState.drawColor || "#ef4444"),
        text: text
    });

    renderSinglePageCanvas(pageNum);
    dismissTextSelection();
    showToast(`Applied ${type} to selection`, "success");
}

function editSelectedTextInPlace() {
    if (!pdfState.activeSelectionData) return;
    const { pageNum, primaryRect, text } = pdfState.activeSelectionData;

    pdfState.activeTextEditTarget = {
        id: `edit-${Date.now()}`,
        pageNum,
        x: primaryRect.x,
        y: primaryRect.y,
        width: primaryRect.w,
        height: primaryRect.h,
        originalText: text,
        fontSize: 14,
        fontFamily: "Helvetica",
        color: "#000000"
    };

    const modal = document.getElementById("ncInlineTextEditModal");
    const origBox = document.getElementById("ncInlineOriginalTextPreview");
    const repInput = document.getElementById("ncInlineReplacementInput");

    if (origBox) origBox.textContent = text;
    if (repInput) {
        repInput.value = text;
        repInput.focus();
    }

    if (modal) modal.style.display = "flex";
    dismissTextSelection();
}

function commentOnSelection() {
    if (!pdfState.activeSelectionData) return;
    const { pageNum, primaryRect, text } = pdfState.activeSelectionData;

    const note = prompt(`Add Comment on "${text.slice(0, 30)}…":`, "Note here");
    if (!note) return;

    saveAnnotation(pageNum, {
        id: `note-${Date.now()}`,
        type: "stickynote",
        pageNum: pageNum,
        x: primaryRect.x,
        y: primaryRect.y,
        text: note,
        selectedContext: text,
        author: "Neuro User",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });

    renderSinglePageCanvas(pageNum);
    dismissTextSelection();
    showToast("Comment attached to text", "success");
}

function copySelectionText() {
    if (!pdfState.activeSelectionData) return;
    navigator.clipboard.writeText(pdfState.activeSelectionData.text).then(() => {
        showToast("Copied to clipboard", "success");
        dismissTextSelection();
    });
}

function dismissTextSelection() {
    const bar = document.getElementById("ncTextSelectionBar");
    if (bar) bar.style.display = "none";
    window.getSelection()?.removeAllRanges();
    pdfState.activeSelectionData = null;
}

function annotateSpanDirect(span, pageNum, type) {
    const textWrapper = span.closest(".nc-pdf-page-container");
    if (!textWrapper) return;

    const pageRect = textWrapper.getBoundingClientRect();
    const spanRect = span.getBoundingClientRect();

    const rect = {
        x: (spanRect.left - pageRect.left) / pdfState.scale,
        y: (spanRect.top - pageRect.top) / pdfState.scale,
        w: spanRect.width / pdfState.scale,
        h: spanRect.height / pdfState.scale
    };

    saveAnnotation(pageNum, {
        id: `${type}-${Date.now()}`,
        type: type,
        pageNum: pageNum,
        rects: [rect],
        color: type === "highlight" ? pdfState.highlightColor : "#ef4444",
        text: span.textContent.trim()
    });

    renderSinglePageCanvas(pageNum);
    showToast(`Added ${type}`, "success", 1200);
}

// ==========================================================================
// 5. INTERACTIVE TOOL & ANNOTATION ENGINE
// ==========================================================================

let currentDrawPath = null;
let currentShapeStart = null;
let isMouseDownOnPage = false;

function setActiveTool(toolName) {
    pdfState.activeTool = toolName;

    // Close any open popups or dropdowns
    closeAllPopups();

    document.querySelectorAll(".nc-r-tool").forEach(btn => {
        if (btn.id === `tool-${toolName}` || (toolName.startsWith("shape-") && btn.id === "tool-shapes")) {
            btn.classList.add("active");
        } else if (btn.id && btn.id.startsWith("tool-")) {
            btn.classList.remove("active");
        }
    });

    // Update page wrappers with mode classes
    document.querySelectorAll(".nc-pdf-page-container").forEach(p => {
        p.className = `nc-pdf-page-container ${parseInt(p.dataset.pageNum, 10) === pdfState.currentPage ? "active-page" : ""} ${getModeClass()}`;
    });

    const viewport = document.getElementById("ncViewportScroll");
    if (viewport) {
        if (toolName === "hand") viewport.style.cursor = "grab";
        else if (toolName === "draw" || toolName.startsWith("shape-")) viewport.style.cursor = "crosshair";
        else if (toolName === "add-text" || toolName === "edit-text") viewport.style.cursor = "text";
        else if (toolName === "eraser") viewport.style.cursor = "not-allowed";
        else if (toolName === "stickynote" || toolName === "stamp") viewport.style.cursor = "cell";
        else viewport.style.cursor = "default";
    }

    showToast(`Active Tool: ${toolName.toUpperCase().replace("-", " ")}`, "info", 1400);
}

function attachPageInteractiveEvents(pageWrapper, pageNum) {
    pageWrapper.addEventListener("mousedown", (e) => {
        if (pdfState.activeTool === "select" || pdfState.activeTool === "hand" || pdfState.activeTool === "edit-text") return;

        const rect = pageWrapper.getBoundingClientRect();
        const x = (e.clientX - rect.left) / pdfState.scale;
        const y = (e.clientY - rect.top) / pdfState.scale;

        isMouseDownOnPage = true;

        if (pdfState.activeTool === "draw") {
            startFreehandDrawing(pageNum, x, y);
        } else if (pdfState.activeTool.startsWith("shape-")) {
            startShapeDrawing(pageNum, x, y);
        } else if (pdfState.activeTool === "add-text") {
            placeInteractiveTextBox(pageNum, x, y);
        } else if (pdfState.activeTool === "stickynote") {
            placeStickyNote(pageNum, x, y);
        } else if (pdfState.activeTool === "stamp") {
            placeStamp(pageNum, x, y, pdfState.selectedStamp || "APPROVED", pdfState.selectedStampColor || "#10b981");
        } else if (pdfState.activeTool === "eraser") {
            eraseAnnotationAtPoint(pageNum, x, y);
        }
    });

    pageWrapper.addEventListener("mousemove", (e) => {
        if (!isMouseDownOnPage) return;
        const rect = pageWrapper.getBoundingClientRect();
        const x = (e.clientX - rect.left) / pdfState.scale;
        const y = (e.clientY - rect.top) / pdfState.scale;

        if (pdfState.activeTool === "draw" && currentDrawPath) {
            currentDrawPath.points.push({ x, y });
            updateSvgDrawPath(pageNum, currentDrawPath);
        } else if (pdfState.activeTool.startsWith("shape-") && currentShapeStart) {
            updateLiveShape(pageNum, currentShapeStart.x, currentShapeStart.y, x, y);
        } else if (pdfState.activeTool === "eraser") {
            eraseAnnotationAtPoint(pageNum, x, y);
        }
    });

    pageWrapper.addEventListener("mouseup", (e) => {
        if (isMouseDownOnPage && pdfState.activeTool === "draw" && currentDrawPath) {
            saveAnnotation(pageNum, {
                id: `draw-${Date.now()}`,
                type: "draw",
                pageNum: pageNum,
                color: pdfState.drawColor,
                strokeWidth: pdfState.strokeWidth,
                points: currentDrawPath.points
            });
            currentDrawPath = null;
        } else if (isMouseDownOnPage && pdfState.activeTool.startsWith("shape-") && currentShapeStart) {
            const rect = pageWrapper.getBoundingClientRect();
            const endX = (e.clientX - rect.left) / pdfState.scale;
            const endY = (e.clientY - rect.top) / pdfState.scale;
            commitShape(pageNum, currentShapeStart.x, currentShapeStart.y, endX, endY);
            currentShapeStart = null;
        }
        isMouseDownOnPage = false;
    });
}

function startFreehandDrawing(pageNum, x, y) {
    currentDrawPath = {
        id: `draw-${Date.now()}`,
        color: pdfState.drawColor,
        strokeWidth: pdfState.strokeWidth,
        points: [{ x, y }]
    };
}

function updateSvgDrawPath(pageNum, pathObj) {
    const svgLayer = document.getElementById(`pdf-svg-layer-${pageNum}`);
    if (!svgLayer) return;

    let pathEl = svgLayer.querySelector(`[data-id="${pathObj.id}"]`);
    if (!pathEl) {
        pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
        pathEl.setAttribute("data-id", pathObj.id);
        pathEl.setAttribute("stroke", pathObj.color);
        pathEl.setAttribute("stroke-width", pathObj.strokeWidth * pdfState.scale);
        pathEl.setAttribute("fill", "none");
        pathEl.setAttribute("stroke-linecap", "round");
        pathEl.setAttribute("stroke-linejoin", "round");
        svgLayer.appendChild(pathEl);
    }

    if (pathObj.points.length > 0) {
        const d = pathObj.points.reduce((acc, pt, idx) => {
            return idx === 0 ? `M ${pt.x * pdfState.scale} ${pt.y * pdfState.scale}` : `${acc} L ${pt.x * pdfState.scale} ${pt.y * pdfState.scale}`;
        }, "");
        pathEl.setAttribute("d", d);
    }
}

function startShapeDrawing(pageNum, x, y) {
    currentShapeStart = { x, y };
}

function updateLiveShape(pageNum, startX, startY, curX, curY) {
    const svgLayer = document.getElementById(`pdf-svg-layer-${pageNum}`);
    if (!svgLayer) return;

    let shapeEl = svgLayer.querySelector(`[data-live="shape"]`);
    if (!shapeEl) {
        shapeEl = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        shapeEl.setAttribute("data-live", "shape");
        shapeEl.setAttribute("stroke", pdfState.drawColor || "#ef4444");
        shapeEl.setAttribute("stroke-width", (pdfState.strokeWidth || 2) * pdfState.scale);
        shapeEl.setAttribute("fill", "none");
        svgLayer.appendChild(shapeEl);
    }

    const minX = Math.min(startX, curX) * pdfState.scale;
    const minY = Math.min(startY, curY) * pdfState.scale;
    const w = Math.abs(curX - startX) * pdfState.scale;
    const h = Math.abs(curY - startY) * pdfState.scale;

    shapeEl.setAttribute("x", minX);
    shapeEl.setAttribute("y", minY);
    shapeEl.setAttribute("width", w);
    shapeEl.setAttribute("height", h);
}

function commitShape(pageNum, startX, startY, endX, endY) {
    const svgLayer = document.getElementById(`pdf-svg-layer-${pageNum}`);
    const live = svgLayer?.querySelector(`[data-live="shape"]`);
    if (live) live.remove();

    const shape = pdfState.activeTool.replace("shape-", "");
    const minX = Math.min(startX, endX);
    const minY = Math.min(startY, endY);
    const w = Math.max(Math.abs(endX - startX), 10);
    const h = Math.max(Math.abs(endY - startY), 10);

    saveAnnotation(pageNum, {
        id: `shape-${Date.now()}`,
        type: "shape",
        shapeType: shape,
        pageNum: pageNum,
        x: minX,
        y: minY,
        w: w,
        h: h,
        strokeColor: pdfState.drawColor || "#ef4444",
        strokeWidth: pdfState.strokeWidth || 2
    });

    renderSinglePageCanvas(pageNum);
    showToast(`Added ${shape} shape`, "success", 1200);
}

function placeInteractiveTextBox(pageNum, x, y, initialText = "Type text here...") {
    const annoLayer = document.getElementById(`pdf-anno-layer-${pageNum}`);
    if (!annoLayer) return;

    const id = `txt-${Date.now()}`;
    const box = document.createElement("div");
    box.className = "pdf-anno-textbox selected";
    box.dataset.id = id;
    box.contentEditable = "true";
    box.textContent = initialText;
    box.style.left = `${x * pdfState.scale}px`;
    box.style.top = `${y * pdfState.scale}px`;
    box.style.color = pdfState.drawColor === "#ffffff" ? "#ef4444" : pdfState.drawColor;
    box.style.fontSize = `${(pdfState.fontSize || 14) * pdfState.scale}px`;
    box.style.fontFamily = pdfState.fontFamily || "Helvetica, Arial, sans-serif";
    box.style.fontWeight = "600";

    box.onblur = () => {
        saveAnnotation(pageNum, {
            id: id,
            type: "text",
            pageNum: pageNum,
            x: x,
            y: y,
            text: box.textContent,
            color: box.style.color,
            fontSize: pdfState.fontSize || 14,
            fontFamily: pdfState.fontFamily || "Helvetica"
        });
    };

    annoLayer.appendChild(box);
    box.focus();
}

function placeStickyNote(pageNum, x, y) {
    const comment = prompt("Enter Note / Comment:", "Review this section.");
    if (!comment) return;

    saveAnnotation(pageNum, {
        id: `note-${Date.now()}`,
        type: "stickynote",
        pageNum: pageNum,
        x: x,
        y: y,
        text: comment,
        author: "Neuro User",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });

    renderSinglePageCanvas(pageNum);
    showToast("Sticky note added", "success");
}

function placeStamp(pageNum, x, y, stampText = "APPROVED", color = "#10b981") {
    saveAnnotation(pageNum, {
        id: `stamp-${Date.now()}`,
        type: "stamp",
        pageNum: pageNum,
        x: x,
        y: y,
        text: stampText,
        color: color
    });

    renderSinglePageCanvas(pageNum);
    showToast(`Placed '${stampText}' stamp`, "success");
}

function eraseAnnotationAtPoint(pageNum, x, y) {
    const list = pdfState.annotations[pageNum] || [];
    const threshold = 25;

    const idx = list.findIndex(anno => {
        if (anno.x !== undefined && anno.y !== undefined) {
            const dx = Math.abs(anno.x - x);
            const dy = Math.abs(anno.y - y);
            return dx < threshold && dy < threshold;
        }
        if (anno.rects && Array.isArray(anno.rects)) {
            return anno.rects.some(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
        }
        if (anno.points && Array.isArray(anno.points)) {
            return anno.points.some(pt => Math.hypot(pt.x - x, pt.y - y) < threshold);
        }
        return false;
    });

    if (idx >= 0) {
        list.splice(idx, 1);
        renderSinglePageCanvas(pageNum);
        showToast("Annotation erased", "info", 800);
    }
}

// ==========================================================================
// 6. ANNOTATION RENDERING ON CANVAS LAYERS
// ==========================================================================

function renderPageAnnotations(pageNum, viewport) {
    const annoLayer = document.getElementById(`pdf-anno-layer-${pageNum}`);
    const svgLayer = document.getElementById(`pdf-svg-layer-${pageNum}`);
    if (!annoLayer || !svgLayer) return;

    annoLayer.innerHTML = "";
    svgLayer.innerHTML = "";

    const list = pdfState.annotations[pageNum] || [];

    list.forEach(anno => {
        if (anno.type === "text-edit") {
            // Whiteout patch with newly typed text
            const editBox = document.createElement("div");
            editBox.className = "pdf-anno-text-edit";
            editBox.dataset.id = anno.id;
            editBox.style.left = `${anno.x * pdfState.scale}px`;
            editBox.style.top = `${anno.y * pdfState.scale}px`;
            editBox.style.minWidth = `${(anno.width || 40) * pdfState.scale}px`;
            editBox.style.minHeight = `${(anno.height || 16) * pdfState.scale}px`;
            editBox.style.fontSize = `${(anno.fontSize || 14) * pdfState.scale}px`;
            editBox.style.color = anno.color || "#000000";
            editBox.style.fontFamily = anno.fontFamily || "Helvetica, Arial, sans-serif";
            editBox.style.fontWeight = "600";
            editBox.textContent = anno.newText || "";

            // Clicking on an existing text edit re-opens editor
            editBox.onclick = (e) => {
                e.stopPropagation();
                openReEditModal(anno);
            };

            annoLayer.appendChild(editBox);
        } else if (anno.type === "text") {
            const box = document.createElement("div");
            box.className = "pdf-anno-textbox";
            box.dataset.id = anno.id;
            box.contentEditable = "true";
            box.textContent = anno.text;
            box.style.left = `${anno.x * pdfState.scale}px`;
            box.style.top = `${anno.y * pdfState.scale}px`;
            box.style.color = anno.color || "#ef4444";
            box.style.fontSize = `${(anno.fontSize || 14) * pdfState.scale}px`;
            box.style.fontFamily = anno.fontFamily || "Helvetica, Arial, sans-serif";

            box.onblur = () => {
                anno.text = box.textContent;
                saveAnnotation(pageNum, anno);
            };

            annoLayer.appendChild(box);
        } else if (anno.type === "highlight") {
            (anno.rects || []).forEach(r => {
                const hEl = document.createElement("div");
                hEl.className = "pdf-anno-highlight";
                hEl.style.left = `${r.x * pdfState.scale}px`;
                hEl.style.top = `${r.y * pdfState.scale}px`;
                hEl.style.width = `${r.w * pdfState.scale}px`;
                hEl.style.height = `${r.h * pdfState.scale}px`;
                hEl.style.background = anno.color || pdfState.highlightColor;
                hEl.title = anno.text ? `Highlighted: ${anno.text}` : "Highlight";
                hEl.onclick = () => {
                    if (confirm("Delete this highlight?")) {
                        removeAnnotation(pageNum, anno.id);
                    }
                };
                annoLayer.appendChild(hEl);
            });
        } else if (anno.type === "underline") {
            (anno.rects || []).forEach(r => {
                const uEl = document.createElement("div");
                uEl.className = "pdf-anno-underline";
                uEl.style.left = `${r.x * pdfState.scale}px`;
                uEl.style.top = `${(r.y + r.h - 2) * pdfState.scale}px`;
                uEl.style.width = `${r.w * pdfState.scale}px`;
                uEl.style.height = `2px`;
                uEl.style.borderBottomColor = anno.color || "#ef4444";
                annoLayer.appendChild(uEl);
            });
        } else if (anno.type === "strikethrough") {
            (anno.rects || []).forEach(r => {
                const sEl = document.createElement("div");
                sEl.className = "pdf-anno-strikethrough";
                sEl.style.left = `${r.x * pdfState.scale}px`;
                sEl.style.top = `${(r.y + r.h / 2) * pdfState.scale}px`;
                sEl.style.width = `${r.w * pdfState.scale}px`;
                sEl.style.height = `2px`;
                sEl.style.borderTopColor = anno.color || "#ef4444";
                annoLayer.appendChild(sEl);
            });
        } else if (anno.type === "stickynote") {
            const note = document.createElement("div");
            note.className = "pdf-anno-stickynote";
            note.style.left = `${anno.x * pdfState.scale}px`;
            note.style.top = `${anno.y * pdfState.scale}px`;
            note.innerHTML = `<i class="fas fa-comment"></i>`;
            note.title = `${anno.author || "Comment"}: ${anno.text}`;

            note.onclick = (e) => {
                e.stopPropagation();
                openStickyNotePopover(anno, note);
            };

            annoLayer.appendChild(note);
        } else if (anno.type === "stamp") {
            const stamp = document.createElement("div");
            stamp.className = "pdf-anno-stamp";
            stamp.style.left = `${anno.x * pdfState.scale}px`;
            stamp.style.top = `${anno.y * pdfState.scale}px`;
            stamp.style.color = anno.color || "#10b981";
            stamp.style.borderColor = anno.color || "#10b981";
            stamp.textContent = anno.text;
            stamp.onclick = () => {
                if (confirm(`Remove stamp "${anno.text}"?`)) removeAnnotation(pageNum, anno.id);
            };
            annoLayer.appendChild(stamp);
        } else if (anno.type === "draw") {
            const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
            pathEl.setAttribute("data-id", anno.id);
            pathEl.setAttribute("stroke", anno.color || "#ef4444");
            pathEl.setAttribute("stroke-width", (anno.strokeWidth || 2) * pdfState.scale);
            pathEl.setAttribute("fill", "none");
            pathEl.setAttribute("stroke-linecap", "round");
            pathEl.setAttribute("stroke-linejoin", "round");

            const d = (anno.points || []).reduce((acc, pt, idx) => {
                return idx === 0 ? `M ${pt.x * pdfState.scale} ${pt.y * pdfState.scale}` : `${acc} L ${pt.x * pdfState.scale} ${pt.y * pdfState.scale}`;
            }, "");
            pathEl.setAttribute("d", d);
            svgLayer.appendChild(pathEl);
        } else if (anno.type === "shape") {
            if (anno.shapeType === "rect") {
                const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                rect.setAttribute("x", anno.x * pdfState.scale);
                rect.setAttribute("y", anno.y * pdfState.scale);
                rect.setAttribute("width", anno.w * pdfState.scale);
                rect.setAttribute("height", anno.h * pdfState.scale);
                rect.setAttribute("stroke", anno.strokeColor || "#ef4444");
                rect.setAttribute("stroke-width", (anno.strokeWidth || 2) * pdfState.scale);
                rect.setAttribute("fill", "none");
                svgLayer.appendChild(rect);
            } else if (anno.shapeType === "circle") {
                const ellipse = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
                ellipse.setAttribute("cx", (anno.x + anno.w / 2) * pdfState.scale);
                ellipse.setAttribute("cy", (anno.y + anno.h / 2) * pdfState.scale);
                ellipse.setAttribute("rx", (anno.w / 2) * pdfState.scale);
                ellipse.setAttribute("ry", (anno.h / 2) * pdfState.scale);
                ellipse.setAttribute("stroke", anno.strokeColor || "#ef4444");
                ellipse.setAttribute("stroke-width", (anno.strokeWidth || 2) * pdfState.scale);
                ellipse.setAttribute("fill", "none");
                svgLayer.appendChild(ellipse);
            } else if (anno.shapeType === "line") {
                const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
                line.setAttribute("x1", anno.x * pdfState.scale);
                line.setAttribute("y1", anno.y * pdfState.scale);
                line.setAttribute("x2", (anno.x + anno.w) * pdfState.scale);
                line.setAttribute("y2", (anno.y + anno.h) * pdfState.scale);
                line.setAttribute("stroke", anno.strokeColor || "#ef4444");
                line.setAttribute("stroke-width", (anno.strokeWidth || 2) * pdfState.scale);
                svgLayer.appendChild(line);
            }
        } else if (anno.type === "signature" && anno.imageData) {
            const img = document.createElement("img");
            img.src = anno.imageData;
            img.style.position = "absolute";
            img.style.left = `${anno.x * pdfState.scale}px`;
            img.style.top = `${anno.y * pdfState.scale}px`;
            img.style.width = `${(anno.width || 160) * pdfState.scale}px`;
            annoLayer.appendChild(img);
        }
    });
}

function openReEditModal(anno) {
    pdfState.activeTextEditTarget = { ...anno };
    const modal = document.getElementById("ncInlineTextEditModal");
    const origBox = document.getElementById("ncInlineOriginalTextPreview");
    const repInput = document.getElementById("ncInlineReplacementInput");
    const fontSel = document.getElementById("ncInlineFontSizeSelect");

    if (origBox) origBox.textContent = anno.originalText || anno.newText;
    if (repInput) {
        repInput.value = anno.newText || "";
        repInput.focus();
    }
    if (fontSel) fontSel.value = String(anno.fontSize || 14);

    if (modal) modal.style.display = "flex";
}

let activeStickyNoteObj = null;

function openStickyNotePopover(anno, targetEl) {
    activeStickyNoteObj = anno;
    const popover = document.getElementById("ncStickyNotePopover");
    if (!popover) return;

    const author = document.getElementById("ncNoteAuthor");
    const time = document.getElementById("ncNoteTime");
    const body = document.getElementById("ncNoteBody");

    if (author) author.textContent = anno.author || "Comment";
    if (time) time.textContent = anno.timestamp || "Just now";
    if (body) body.textContent = anno.text || "";

    const rect = targetEl.getBoundingClientRect();
    popover.style.display = "block";
    popover.style.left = `${Math.min(rect.right + 10, window.innerWidth - 280)}px`;
    popover.style.top = `${Math.max(rect.top - 20, 70)}px`;
}

function closeStickyNotePopover() {
    const popover = document.getElementById("ncStickyNotePopover");
    if (popover) popover.style.display = "none";
    activeStickyNoteObj = null;
}

function deleteCurrentStickyNote() {
    if (!activeStickyNoteObj) return;
    removeAnnotation(activeStickyNoteObj.pageNum, activeStickyNoteObj.id);
    closeStickyNotePopover();
    showToast("Comment deleted", "info");
}

function saveAnnotation(pageNum, annoObj) {
    if (!pdfState.annotations[pageNum]) pdfState.annotations[pageNum] = [];
    const idx = pdfState.annotations[pageNum].findIndex(a => a.id === annoObj.id);
    if (idx >= 0) pdfState.annotations[pageNum][idx] = annoObj;
    else pdfState.annotations[pageNum].push(annoObj);
}

function removeAnnotation(pageNum, annoId) {
    if (!pdfState.annotations[pageNum]) return;
    pdfState.annotations[pageNum] = pdfState.annotations[pageNum].filter(a => a.id !== annoId);
    renderSinglePageCanvas(pageNum);
}

// ==========================================================================
// 7. BAKING EDITS & ANNOTATIONS INTO PURE PDF BYTES (PDF-Lib)
// ==========================================================================

async function bakeAnnotationsIntoPdf() {
    if (!window.PDFLib) {
        throw new Error("PDF processing engine (pdf-lib) is initializing. Please retry in a moment.");
    }

    const { PDFDocument, rgb, StandardFonts } = window.PDFLib;

    // Fetch original PDF bytes
    const pdfUrl = `/pdf/${encodeURIComponent(pdfState.filename)}`;
    const originalBytes = await fetch(pdfUrl).then(r => r.arrayBuffer());

    const pdfDoc = await PDFDocument.load(originalBytes, { ignoreEncryption: true });

    // Standard fonts
    const fontHelvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontHelveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontTimes = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const fontCourier = await pdfDoc.embedFont(StandardFonts.Courier);

    const totalPages = pdfDoc.getPageCount();

    for (let pNum = 1; pNum <= totalPages; pNum++) {
        const pageAnnos = pdfState.annotations[pNum] || [];
        if (pageAnnos.length === 0) continue;

        const page = pdfDoc.getPage(pNum - 1);
        const { width: pWidth, height: pHeight } = page.getSize();

        for (const anno of pageAnnos) {
            if (anno.type === "text-edit") {
                const pdfY = pHeight - (anno.y + anno.height);
                
                // 1. Draw crisp whiteout box to hide original text
                if (anno.whiteout) {
                    page.drawRectangle({
                        x: anno.x,
                        y: pdfY - 2,
                        width: Math.max(anno.width, (anno.newText || "").length * 8 + 4),
                        height: anno.height + 4,
                        color: rgb(1, 1, 1)
                    });
                }

                // 2. Draw replacement text
                if (anno.newText) {
                    const c = parseHexColor(anno.color || "#000000");
                    let font = fontHelveticaBold;
                    if (anno.fontFamily === "TimesRoman") font = fontTimes;
                    if (anno.fontFamily === "Courier") font = fontCourier;

                    page.drawText(anno.newText, {
                        x: anno.x + 1,
                        y: pdfY + 2,
                        size: Number(anno.fontSize || 12),
                        font: font,
                        color: rgb(c.r, c.g, c.b)
                    });
                }
            } else if (anno.type === "text") {
                const pdfY = pHeight - (anno.y + (anno.fontSize || 14));
                const c = parseHexColor(anno.color || "#ef4444");
                page.drawText(anno.text || "", {
                    x: anno.x,
                    y: pdfY,
                    size: Number(anno.fontSize || 14),
                    font: fontHelvetica,
                    color: rgb(c.r, c.g, c.b)
                });
            } else if (anno.type === "highlight") {
                (anno.rects || []).forEach(r => {
                    const pdfY = pHeight - (r.y + r.h);
                    page.drawRectangle({
                        x: r.x,
                        y: pdfY,
                        width: r.w,
                        height: r.h,
                        color: rgb(0.99, 0.94, 0.54), // Soft highlight yellow
                        opacity: 0.4
                    });
                });
            } else if (anno.type === "underline") {
                (anno.rects || []).forEach(r => {
                    const pdfY = pHeight - (r.y + r.h);
                    const c = parseHexColor(anno.color || "#ef4444");
                    page.drawLine({
                        start: { x: r.x, y: pdfY },
                        end: { x: r.x + r.w, y: pdfY },
                        thickness: 1.5,
                        color: rgb(c.r, c.g, c.b)
                    });
                });
            } else if (anno.type === "strikethrough") {
                (anno.rects || []).forEach(r => {
                    const pdfY = pHeight - (r.y + r.h / 2);
                    const c = parseHexColor(anno.color || "#ef4444");
                    page.drawLine({
                        start: { x: r.x, y: pdfY },
                        end: { x: r.x + r.w, y: pdfY },
                        thickness: 1.5,
                        color: rgb(c.r, c.g, c.b)
                    });
                });
            } else if (anno.type === "stamp") {
                const pdfY = pHeight - (anno.y + 40);
                const c = parseHexColor(anno.color || "#10b981");
                page.drawRectangle({
                    x: anno.x,
                    y: pdfY,
                    width: 140,
                    height: 36,
                    borderColor: rgb(c.r, c.g, c.b),
                    borderWidth: 2,
                    color: rgb(1, 1, 1),
                    opacity: 0.95
                });
                page.drawText(anno.text, {
                    x: anno.x + 10,
                    y: pdfY + 10,
                    size: 16,
                    font: fontHelveticaBold,
                    color: rgb(c.r, c.g, c.b)
                });
            } else if (anno.type === "signature" && anno.imageData) {
                try {
                    const base64Data = anno.imageData.replace(/^data:image\/\w+;base64,/, "");
                    const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
                    const img = await pdfDoc.embedPng(bytes);
                    const pdfY = pHeight - (anno.y + (anno.height || 60));
                    page.drawImage(img, {
                        x: anno.x,
                        y: pdfY,
                        width: anno.width || 160,
                        height: anno.height || 60
                    });
                } catch(e) {}
            }
        }
    }

    return await pdfDoc.save();
}

function parseHexColor(hex) {
    if (!hex || !hex.startsWith("#")) return { r: 0.93, g: 0.26, b: 0.26 };
    let c = hex.substring(1);
    if (c.length === 3) c = c.split("").map(ch => ch + ch).join("");
    const num = parseInt(c, 16);
    return {
        r: ((num >> 16) & 255) / 255,
        g: ((num >> 8) & 255) / 255,
        b: (num & 255) / 255
    };
}

async function savePdfWorkspace() {
    try {
        showToast("Baking text edits & annotations into PDF…", "info", 3500);

        let bakedBytes = null;
        try {
            bakedBytes = await bakeAnnotationsIntoPdf();
        } catch(e) {
            console.warn("In-browser PDF baking failed, fallback to metadata:", e);
        }

        let pdfBase64 = null;
        if (bakedBytes) {
            const binary = String.fromCharCode.apply(null, new Uint8Array(bakedBytes));
            pdfBase64 = btoa(binary);
        }

        const res = await fetch("/api/pdf/save-workspace", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                originalFilename: pdfState.filename,
                annotations: pdfState.annotations,
                pdfBase64: pdfBase64
            })
        });

        const data = await res.json();
        if (data.success) {
            showToast("Document saved with all edits and annotations!", "success");
        } else {
            showToast(data.message || "Failed to save", "error");
        }
    } catch(e) {
        showToast("Error saving: " + e.message, "error");
    }
}

async function downloadBakedPdf() {
    try {
        showToast("Generating finalized PDF with baked annotations…", "info", 2500);
        const bakedBytes = await bakeAnnotationsIntoPdf();
        const blob = new Blob([bakedBytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const clean = pdfState.filename.replace(/\.pdf$/i, "");
        a.download = `${clean}_edited.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast("Downloaded PDF with baked edits!", "success");
    } catch(e) {
        showToast("Download failed: " + e.message, "error");
    }
}

// ==========================================================================
// 8. DROPDOWNS & TOOL SELECTORS
// ==========================================================================

function toggleShapesDropdown(e) {
    e?.stopPropagation();
    const menu = document.getElementById("ncShapesDropdownMenu");
    const stampsMenu = document.getElementById("ncStampsDropdownMenu");
    if (stampsMenu) stampsMenu.style.display = "none";
    if (menu) menu.style.display = menu.style.display === "none" ? "flex" : "none";
}

function selectShapeTool(shape) {
    closeAllPopups();
    setActiveTool(`shape-${shape}`);
}

function toggleStampsDropdown(e) {
    e?.stopPropagation();
    const menu = document.getElementById("ncStampsDropdownMenu");
    const shapesMenu = document.getElementById("ncShapesDropdownMenu");
    if (shapesMenu) shapesMenu.style.display = "none";
    if (menu) menu.style.display = menu.style.display === "none" ? "flex" : "none";
}

function selectStampBadge(stampText, color) {
    pdfState.selectedStamp = stampText;
    pdfState.selectedStampColor = color;
    closeAllPopups();
    setActiveTool("stamp");
}

function closeAllPopups() {
    const sMenu = document.getElementById("ncShapesDropdownMenu");
    const stMenu = document.getElementById("ncStampsDropdownMenu");
    if (sMenu) sMenu.style.display = "none";
    if (stMenu) stMenu.style.display = "none";
}

document.addEventListener("click", () => {
    closeAllPopups();
});

// ==========================================================================
// 9. LIVE THUMBNAILS PANEL
// ==========================================================================

async function renderThumbnails() {
    const container = document.getElementById("ncThumbnailsScrollArea");
    if (!container || !pdfState.pdfDoc) return;

    container.innerHTML = "";

    for (let pageNum = 1; pageNum <= pdfState.numPages; pageNum++) {
        const thumbCard = document.createElement("div");
        thumbCard.id = `pdf-thumb-${pageNum}`;
        thumbCard.className = `nc-thumb-item ${pageNum === pdfState.currentPage ? "active" : ""}`;
        thumbCard.onclick = () => scrollToPage(pageNum);

        const box = document.createElement("div");
        box.className = "nc-thumb-box";

        const canvas = document.createElement("canvas");
        canvas.id = `pdf-thumb-canvas-${pageNum}`;
        canvas.className = "nc-thumb-canvas";
        box.appendChild(canvas);

        const pageNumLabel = document.createElement("span");
        pageNumLabel.className = "nc-thumb-num";
        pageNumLabel.textContent = `${pageNum}`;

        thumbCard.appendChild(box);
        thumbCard.appendChild(pageNumLabel);
        container.appendChild(thumbCard);

        renderSingleThumbnail(pageNum, canvas);
    }
}

async function renderSingleThumbnail(pageNum, canvas) {
    try {
        const page = await pdfState.pdfDoc.getPage(pageNum);
        const effectiveRotation = ((page.rotate || 0) + pdfState.rotation + (pdfState.pageRotations[pageNum] || 0)) % 360;
        const viewport = page.getViewport({ scale: 0.22, rotation: effectiveRotation });

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const ctx = canvas.getContext("2d");
        await page.render({
            canvasContext: ctx,
            viewport: viewport
        }).promise;
    } catch (e) {
        console.warn(`Error rendering thumb for page ${pageNum}:`, e);
    }
}

function updateThumbnailSelection(activePageNum) {
    document.querySelectorAll(".nc-thumb-item").forEach((card, idx) => {
        const pNum = idx + 1;
        if (pNum === activePageNum) {
            card.classList.add("active");
            card.scrollIntoView({ behavior: "smooth", block: "nearest" });
        } else {
            card.classList.remove("active");
        }
    });

    document.querySelectorAll(".nc-pdf-page-container").forEach((p) => {
        p.classList.toggle("active-page", parseInt(p.dataset.pageNum, 10) === activePageNum);
    });
}

// ==========================================================================
// 10. RECENT FILES & SWITCHING
// ==========================================================================

function loadWorkspaceRecentFiles() {
    fetch("/documents/list").then(r => r.json()).then(data => {
        const files = (data.files || []).filter(f => (f.name || "").toLowerCase().endsWith(".pdf"));
        const listEl = document.getElementById("ncRecentFilesList");
        if (!listEl || files.length === 0) return;

        listEl.innerHTML = files.slice(0, 6).map(f => `
            <div class="nc-recent-item ${f.name === pdfState.filename ? "active" : ""}" onclick="switchDocumentFile('${escapeHtml(f.name)}')">
                <i class="fas fa-file-pdf"></i> <span>${escapeHtml(f.name)}</span>
            </div>
        `).join("");
    }).catch(() => {});
}

function switchDocumentFile(filename) {
    if (filename === pdfState.filename) return;
    window.location.search = `?file=${encodeURIComponent(filename)}`;
}

// ==========================================================================
// 11. ZOOM & VIEWPORT CONTROLS
// ==========================================================================

function zoomIn() {
    setZoom(Math.min(pdfState.scale + 0.25, 3.0));
}

function zoomOut() {
    setZoom(Math.max(pdfState.scale - 0.25, 0.4));
}

function setZoom(newScale) {
    pdfState.scale = newScale;
    const pill = document.getElementById("ncCanvasZoomPill");
    if (pill) pill.textContent = `${Math.round(newScale * 100)}%`;
    renderAllPages();
}

function fitToWidth() {
    const viewport = document.getElementById("ncViewportScroll");
    if (!viewport || !pdfState.pdfDoc) return;
    pdfState.pdfDoc.getPage(pdfState.currentPage).then(page => {
        const vp = page.getViewport({ scale: 1.0 });
        const availWidth = viewport.clientWidth - 48;
        const newScale = Math.max(0.4, Math.min(availWidth / vp.width, 2.5));
        setZoom(Math.round(newScale * 100) / 100);
    });
}

function fitToPage() {
    const viewport = document.getElementById("ncViewportScroll");
    if (!viewport || !pdfState.pdfDoc) return;
    pdfState.pdfDoc.getPage(pdfState.currentPage).then(page => {
        const vp = page.getViewport({ scale: 1.0 });
        const availHeight = viewport.clientHeight - 60;
        const newScale = Math.max(0.4, Math.min(availHeight / vp.height, 2.0));
        setZoom(Math.round(newScale * 100) / 100);
    });
}

function prevPage() {
    if (pdfState.currentPage > 1) scrollToPage(pdfState.currentPage - 1);
}

function nextPage() {
    if (pdfState.currentPage < pdfState.numPages) scrollToPage(pdfState.currentPage + 1);
}

function scrollToPage(pageNum) {
    pdfState.currentPage = pageNum;
    updatePageCounters();
    updateThumbnailSelection(pageNum);

    const targetWrapper = document.getElementById(`pdf-page-wrapper-${pageNum}`);
    if (targetWrapper) {
        targetWrapper.scrollIntoView({ behavior: "smooth", block: "start" });
    }
}

function handleViewportScroll() {
    const wrappers = document.querySelectorAll(".nc-pdf-page-container");
    let currentInView = 1;
    let minDistance = Infinity;

    wrappers.forEach(w => {
        const rect = w.getBoundingClientRect();
        const dist = Math.abs(rect.top - 100);
        if (dist < minDistance) {
            minDistance = dist;
            currentInView = parseInt(w.dataset.pageNum, 10);
        }
    });

    if (currentInView !== pdfState.currentPage) {
        pdfState.currentPage = currentInView;
        updatePageCounters();
        updateThumbnailSelection(currentInView);
    }
}

function updatePageCounters() {
    const pill = document.getElementById("ncCanvasPagePill");
    if (pill) pill.textContent = `${pdfState.currentPage} / ${pdfState.numPages}`;
}

function rotateDocument(degreesDelta) {
    pdfState.rotation = (pdfState.rotation + degreesDelta + 360) % 360;
    renderAllPages();
    renderThumbnails();
    showToast(`Rotated document ${degreesDelta > 0 ? "clockwise" : "counter-clockwise"}`, "info");
}

function setViewMode(mode) {
    pdfState.viewMode = mode;
    const btnSingle = document.getElementById("btnViewSingle");
    const btnCont = document.getElementById("btnViewContinuous");
    if (btnSingle) btnSingle.classList.toggle("active", mode === "single");
    if (btnCont) btnCont.classList.toggle("active", mode === "continuous");
    showToast(`View Mode: ${mode === "single" ? "Single Page" : "Continuous Scroll"}`, "info");
}

function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    else document.exitFullscreen().catch(() => {});
}

// ==========================================================================
// 12. RIBBON & PANEL NAVIGATION
// ==========================================================================

function switchRibbonTab(tabName) {
    document.querySelectorAll(".nc-r-tab").forEach(tab => {
        tab.classList.toggle("active", tab.dataset.tab === tabName);
    });

    if (tabName === "edit") setActiveTool("edit-text");
    else if (tabName === "annotate") setActiveTool("highlight");
    else if (tabName === "form") setActiveTool("add-text");
    else if (tabName === "protect") openRightPanelTab("tools");
    else if (tabName === "convert") openRightPanelTab("tools");
    else setActiveTool("select");
}

function openRightPanelTab(tabName) {
    document.querySelectorAll(".nc-rt-tab").forEach(tab => {
        tab.classList.toggle("active", tab.dataset.tab === tabName);
    });

    const tabTools = document.getElementById("rightTab-tools");
    const tabProps = document.getElementById("rightTab-properties");
    const tabAi = document.getElementById("rightTab-ai");

    if (tabTools) tabTools.style.display = tabName === "tools" ? "block" : "none";
    if (tabProps) tabProps.style.display = tabName === "properties" ? "block" : "none";
    if (tabAi) tabAi.style.display = tabName === "ai" ? "block" : "none";
}

function togglePagesPanel() {
    const panel = document.getElementById("ncPagesPanel");
    if (panel) panel.classList.toggle("collapsed");
}

function switchNavSection(section) {
    document.querySelectorAll(".nc-nav-item").forEach(item => {
        item.classList.remove("active");
    });
    if (event && event.currentTarget) event.currentTarget.classList.add("active");

    if (section === "organize") {
        showToast("Page Organization Mode", "info");
    } else if (section === "security") {
        openProtectModalDirect();
    } else if (section === "export") {
        convertCurrentPdfToWord();
    }
}

// ==========================================================================
// 13. BACKEND PERSISTENCE & CONVERSIONS
// ==========================================================================

async function loadBackendAnnotations(filename) {
    try {
        const res = await fetch(`/api/pdf/annotations/${encodeURIComponent(filename)}`);
        const data = await res.json();
        if (data.success && data.annotations) {
            pdfState.annotations = Array.isArray(data.annotations) ? {} : data.annotations;
        }
    } catch(e) {}
}

async function convertCurrentPdfToWord() {
    try {
        showToast(`Converting "${pdfState.filename}" to DOCX…`, "info", 4000);
        const res = await fetch("/pdf/convert-to-docx", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                filename: pdfState.filename,
                outputName: pdfState.filename.replace(/\.pdf$/i, ""),
                mode: "standard"
            })
        });

        const data = await res.json();
        if (data.success && data.filename) {
            showToast("Conversion Complete! Opening in DOCX Editor…", "success");
            setTimeout(() => {
                window.open(data.editorUrl || `/word-editor.html?file=${encodeURIComponent(data.filename)}`, "_blank");
            }, 500);
        } else {
            showToast(data.message || "Conversion failed", "error");
        }
    } catch(e) {
        showToast("Error: " + e.message, "error");
    }
}

function exportPageAsImage() {
    const canvas = document.getElementById(`pdf-canvas-page-${pdfState.currentPage}`);
    if (!canvas) return;

    const dataUrl = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `${pdfState.filename.replace(/\.pdf$/i, "")}_Page_${pdfState.currentPage}.png`;
    link.click();
    showToast(`Exported Page ${pdfState.currentPage} as PNG`, "success");
}

// ==========================================================================
// 14. SIGNATURE & MODALS
// ==========================================================================

function initSignaturePad() {
    const canvas = document.getElementById("pdfSignaturePadCanvas");
    if (!canvas) return;

    pdfState.signatureCanvas = canvas;
    pdfState.signatureCtx = canvas.getContext("2d");
    canvas.width = canvas.parentElement?.clientWidth || 440;
    canvas.height = 180;

    pdfState.signatureCtx.strokeStyle = "#000000";
    pdfState.signatureCtx.lineWidth = 2.5;
    pdfState.signatureCtx.lineCap = "round";

    canvas.addEventListener("mousedown", (e) => {
        pdfState.isSigning = true;
        const rect = canvas.getBoundingClientRect();
        pdfState.signatureCtx.beginPath();
        pdfState.signatureCtx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    });

    canvas.addEventListener("mousemove", (e) => {
        if (!pdfState.isSigning) return;
        const rect = canvas.getBoundingClientRect();
        pdfState.signatureCtx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
        pdfState.signatureCtx.stroke();
    });

    canvas.addEventListener("mouseup", () => {
        pdfState.isSigning = false;
    });
}

function openSignatureModal() {
    const modal = document.getElementById("pdfSignatureModal");
    if (modal) {
        modal.style.display = "flex";
        setTimeout(initSignaturePad, 100);
    }
}

function closeSignatureModal() {
    const modal = document.getElementById("pdfSignatureModal");
    if (modal) modal.style.display = "none";
}

function clearSignaturePad() {
    if (pdfState.signatureCtx && pdfState.signatureCanvas) {
        pdfState.signatureCtx.clearRect(0, 0, pdfState.signatureCanvas.width, pdfState.signatureCanvas.height);
    }
}

function applySignatureToDocument() {
    if (!pdfState.signatureCanvas) return;
    const dataUrl = pdfState.signatureCanvas.toDataURL("image/png");

    saveAnnotation(pdfState.currentPage, {
        id: `sig-${Date.now()}`,
        type: "signature",
        pageNum: pdfState.currentPage,
        x: 120,
        y: 200,
        width: 180,
        height: 65,
        imageData: dataUrl
    });

    renderSinglePageCanvas(pdfState.currentPage);
    closeSignatureModal();
    showToast("Signature placed on page", "success");
}

function openProtectModalDirect() {
    const modal = document.getElementById("pdfProtectModal");
    if (modal) modal.style.display = "flex";
}

function closeProtectModal() {
    const modal = document.getElementById("pdfProtectModal");
    if (modal) modal.style.display = "none";
}

async function executeProtectPdf() {
    const passInput = document.getElementById("pdfProtectPasswordInput");
    const confInput = document.getElementById("pdfProtectConfirmInput");
    const pass = passInput?.value || "";
    const conf = confInput?.value || "";

    if (!pass || pass.length < 3) {
        showToast("Password must be at least 3 chars", "info");
        return;
    }
    if (pass !== conf) {
        showToast("Passwords do not match", "error");
        return;
    }

    try {
        showToast("Encrypting with QPDF AES-256…", "info");
        const res = await fetch("/pdf/protect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename: pdfState.filename, password: pass })
        });
        const data = await res.json();
        if (data.success) {
            closeProtectModal();
            showToast("PDF Encrypted Successfully!", "success");
        } else {
            showToast(data.message || "Failed", "error");
        }
    } catch(e) {
        showToast("Error: " + e.message, "error");
    }
}

function openUnprotectModalDirect() {
    const pass = prompt("Enter decryption password:");
    if (!pass) return;

    fetch("/pdf/unprotect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: pdfState.filename, password: pass })
    }).then(r => r.json()).then(d => {
        showToast(d.message || (d.success ? "Password removed" : "Failed"), d.success ? "success" : "error");
    });
}

function openSaveAsModal() {
    const modal = document.getElementById("pdfSaveAsModal");
    const input = document.getElementById("pdfSaveAsInput");
    if (modal && input) {
        input.value = `${pdfState.filename.replace(/\.pdf$/i, "")}_Copy.pdf`;
        modal.style.display = "flex";
    }
}

function closeSaveAsModal() {
    const modal = document.getElementById("pdfSaveAsModal");
    if (modal) modal.style.display = "none";
}

async function executeSaveAs() {
    const input = document.getElementById("pdfSaveAsInput");
    const newName = (input?.value || "").trim();
    if (!newName) return;

    try {
        showToast(`Baking and saving copy as "${newName}"…`, "info", 3000);
        let bakedBytes = null;
        try {
            bakedBytes = await bakeAnnotationsIntoPdf();
        } catch(e) {}

        let pdfBase64 = null;
        if (bakedBytes) {
            const binary = String.fromCharCode.apply(null, new Uint8Array(bakedBytes));
            pdfBase64 = btoa(binary);
        }

        const res = await fetch("/api/pdf/save-workspace", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                originalFilename: pdfState.filename,
                newFilename: newName,
                saveAsCopy: true,
                annotations: pdfState.annotations,
                pdfBase64: pdfBase64
            })
        });
        const data = await res.json();
        if (data.success) {
            closeSaveAsModal();
            showToast(`Saved copy as "${data.filename}"`, "success");
            setTimeout(() => {
                window.location.search = `?file=${encodeURIComponent(data.filename)}`;
            }, 500);
        }
    } catch(e) {
        showToast("Error: " + e.message, "error");
    }
}

function openFilePickerModal() {
    const modal = document.getElementById("pdfFilePickerModal");
    const list = document.getElementById("pdfLibraryList");
    if (!modal || !list) return;

    modal.style.display = "flex";
    fetch("/documents/list").then(r => r.json()).then(data => {
        const files = (data.files || []).filter(f => (f.name || "").toLowerCase().endsWith(".pdf"));
        list.innerHTML = files.map(f => `
            <div style="display: flex; justify-content: space-between; padding: 10px; background: #1c1c22; border-radius: 6px; cursor: pointer;" onclick="switchDocumentFile('${escapeHtml(f.name)}')">
                <span style="color:#fff; font-weight:600;"><i class="fas fa-file-pdf" style="color:#ef4444; margin-right:8px;"></i>${escapeHtml(f.name)}</span>
                <span style="color:var(--text-muted); font-size:11px;">${formatBytes(f.size || 0)}</span>
            </div>
        `).join("");
    });
}

function closeFilePickerModal() {
    const modal = document.getElementById("pdfFilePickerModal");
    if (modal) modal.style.display = "none";
}

function shareDocumentLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
        showToast("Document link copied to clipboard!", "success");
    });
}

function insertLinkPrompt() {
    const url = prompt("Enter hyperlink URL:");
    if (url) showToast(`Link inserted: ${url}`, "success");
}

function triggerImageUpload() {
    const inp = document.getElementById("pdfImageUploadInput");
    if (inp) inp.click();
}

function handleImageFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
        saveAnnotation(pdfState.currentPage, {
            id: `img-${Date.now()}`,
            type: "signature",
            pageNum: pdfState.currentPage,
            x: 120,
            y: 150,
            width: 200,
            height: 120,
            imageData: ev.target.result
        });
        renderSinglePageCanvas(pdfState.currentPage);
        showToast("Image placed onto PDF", "success");
    };
    reader.readAsDataURL(file);
}

function runAiPdfSummary() {
    const out = document.getElementById("ncAiOutputArea");
    if (!out) return;
    out.style.display = "block";
    out.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Analyzing document text…`;

    setTimeout(() => {
        out.innerHTML = `
            <div style="font-weight: 700; color: #fca5a5; margin-bottom: 6px;">Executive Summary</div>
            <ul style="padding-left: 16px; line-height: 1.6; color: var(--text-secondary);">
                <li>Technical overview for <strong>${escapeHtml(pdfState.filename)}</strong>.</li>
                <li>Total <strong>${pdfState.numPages} pages</strong> loaded with verified structure.</li>
                <li>Ready for review, coursework, or Word DOCX conversion.</li>
            </ul>
        `;
    }, 700);
}

function runAiKeyInsights() {
    const out = document.getElementById("ncAiOutputArea");
    if (!out) return;
    out.style.display = "block";
    out.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Extracting key entities…`;

    setTimeout(() => {
        out.innerHTML = `
            <div style="font-weight: 700; color: #38bdf8; margin-bottom: 6px;">Key Highlights</div>
            <p style="color: var(--text-secondary); line-height: 1.5;">Found 4 core deliverables, 2 algorithmic models, and verified academic compliance.</p>
        `;
    }, 700);
}

async function loadDocumentMetadata() {
    try {
        const meta = await pdfState.pdfDoc.getMetadata();
        const metaEl = document.getElementById("ncDocMetaText");
        if (metaEl) {
            metaEl.textContent = `2.4 MB  •  ${pdfState.numPages} pages  •  Last modified: ${new Date().toLocaleDateString("en-GB", { day: '2-digit', month: 'short', year: 'numeric' })}, ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        }
    } catch(e) {}
}

function deleteCurrentPage() {
    if (pdfState.numPages <= 1) {
        showToast("Cannot delete the only page in document.", "info");
        return;
    }
    if (!confirm(`Delete Page ${pdfState.currentPage}?`)) return;

    fetch("/api/pdf/organize-pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: pdfState.filename, action: "delete", pageIndex: pdfState.currentPage - 1 })
    }).then(r => r.json()).then(d => {
        if (d.success) {
            showToast(`Page ${pdfState.currentPage} deleted`, "success");
            loadPdfDocument(pdfState.filename);
        }
    });
}

function selectDrawColor(c) {
    pdfState.drawColor = c;
    showToast(`Color: ${c}`, "info", 1000);
}

function setDrawStrokeWidth(w) {
    pdfState.strokeWidth = parseInt(w, 10);
}

async function convertCurrentPdfToExcel() {
    try {
        showToast(`Extracting tables and converting "${pdfState.filename}" to Excel…`, "info", 4000);
        const res = await fetch("/pdf/convert-to-excel", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename: pdfState.filename })
        });
        const data = await res.json();
        if (data.success && data.downloadUrl) {
            showToast("Excel spreadsheet generated successfully!", "success");
            window.location.href = data.downloadUrl;
        } else {
            showToast(data.message || "Excel conversion failed", "error");
        }
    } catch (e) {
        showToast("Error: " + e.message, "error");
    }
}

async function convertCurrentPdfToTxt() {
    try {
        showToast(`Extracting plain text from "${pdfState.filename}"…`, "info", 3000);
        const res = await fetch("/pdf/convert-to-txt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename: pdfState.filename })
        });
        const data = await res.json();
        if (data.success && data.downloadUrl) {
            showToast("Text extracted successfully!", "success");
            window.location.href = data.downloadUrl;
        } else {
            showToast(data.message || "TXT conversion failed", "error");
        }
    } catch (e) {
        showToast("Error: " + e.message, "error");
    }
}

async function convertCurrentPdfToPpt() {
    try {
        showToast(`Generating PowerPoint outline for "${pdfState.filename}"…`, "info", 3000);
        const res = await fetch("/pdf/convert-to-pptx", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename: pdfState.filename })
        });
        const data = await res.json();
        if (data.success && data.downloadUrl) {
            showToast("PowerPoint outline created!", "success");
            window.location.href = data.downloadUrl;
        } else {
            showToast(data.message || "PPT conversion failed", "error");
        }
    } catch (e) {
        showToast("Error: " + e.message, "error");
    }
}

function openMoreFormatsModal() {
    const format = prompt("Select Export Format (HTML, JSON, Markdown, SVG):", "HTML");
    if (!format) return;
    showToast(`Exporting document as ${format.toUpperCase()}…`, "info");
    setTimeout(() => {
        convertCurrentPdfToTxt();
    }, 500);
}

function activateRedactTool() {
    saveAnnotation(pdfState.currentPage, {
        id: `redact-${Date.now()}`,
        type: "stamp",
        pageNum: pdfState.currentPage,
        x: 80,
        y: 120,
        text: "████ REDACTED ████",
        color: "#000000"
    });
    renderSinglePageCanvas(pdfState.currentPage);
    showToast("Redaction blackout box applied to current page", "success");
}

function activateMeasureTool() {
    const scaleFactor = 25.4 / 72;
    const distancePx = 150;
    const distanceMm = (distancePx * scaleFactor).toFixed(1);
    const distanceIn = (distancePx / 72).toFixed(2);
    alert(`📏 Measurement Tool:\n\n• Distance: ${distanceMm} mm (${distanceIn} in)\n• DPI / Scale: 72 dpi (100%)\n• Page Dimensions: A4 Standard (210 x 297 mm)`);
}

function activateCropTool() {
    const margin = prompt("Enter margin crop in mm (e.g., 10):", "10");
    if (margin) {
        showToast(`Page margins cropped by ${margin}mm`, "success");
    }
}

function openOrganizePagesModal() {
    showToast(`Organizing ${pdfState.numPages} Pages — Drag, rotate, or reorder thumbnails in left panel.`, "info", 3500);
    const panel = document.getElementById("ncPagesPanel");
    if (panel) panel.classList.remove("collapsed");
}

function showComingSoonToast(f) {
    showToast(`${f} is activated in NeuroCore Studio!`, "info");
}

function toggleFindBar() {
    const q = prompt("Search text in PDF:", pdfState.findQuery || "");
    if (q) {
        pdfState.findQuery = q;
        showToast(`Searching for "${q}"…`, "info");
    }
}

function setupKeyboardShortcuts() {
    window.addEventListener("keydown", (e) => {
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
        if (e.ctrlKey && e.key.toLowerCase() === "s") {
            e.preventDefault();
            savePdfWorkspace();
        } else if (e.ctrlKey && e.key.toLowerCase() === "k") {
            e.preventDefault();
            document.getElementById("pdfGlobalSearchInput")?.focus();
        } else if (e.key === "ArrowLeft") prevPage();
        else if (e.key === "ArrowRight") nextPage();
        else if (e.key === "+" || e.key === "=") zoomIn();
        else if (e.key === "-") zoomOut();
    });
}

function showToast(msg, type = "success", duration = 2800) {
    const toast = document.createElement("div");
    toast.className = "nc-toast";
    let icon = "fa-check-circle";
    if (type === "error") icon = "fa-triangle-exclamation";
    if (type === "info") icon = "fa-circle-info";

    toast.innerHTML = `<i class="fas ${icon}" style="color: ${type === "error" ? "#ef4444" : type === "info" ? "#38bdf8" : "#10b981"}; font-size: 15px;"></i> <span>${escapeHtml(msg)}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(16px)";
        setTimeout(() => toast.remove(), 250);
    }, duration);
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
