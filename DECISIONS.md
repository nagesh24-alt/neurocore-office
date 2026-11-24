# NeuroCore Office — Technical Decision Register

## 1. Document governance

### Purpose and scope

This register records the verified architectural baseline and the decisions that guide future changes to NeuroCore Office. It covers the backend, browser client, document processing, storage, metadata, APIs, database integration, security, testing, performance, user experience, and planned PPTX work.

The implementation descriptions below are based on the repository as inspected on **2026-11-24**. They describe what the source currently does; they do not imply that every behavior is complete, secure, or historically approved. “Accepted” means an implementation pattern is present and is recorded as the current baseline. It does not claim that a named committee previously ratified it. Original approval dates and approvers are **Needs verification**.

Proposals are recommendations for future work, not descriptions of implemented behavior. Where repository evidence is insufficient, the entry says **Needs verification** rather than assuming an answer.

### Proposing, approving, and reviewing decisions

- Any contributor may propose a decision by opening a change that includes the context, alternatives, consequences, security impact, and test plan.
- A project maintainer or designated technical lead should approve significant architectural decisions after reviewing implementation feasibility, compatibility, security, and tests. The names and formal approval process are **Needs verification**.
- Review a decision when its assumptions change, when a significant feature or dependency is proposed, and during API, database, storage, security, or testing changes. Revisit proposed decisions before implementation.
- Amend an accepted decision only with a documented rationale. If the underlying choice changes, preserve the old record as **Superseded** or **Deprecated**, add a new ADR, and link the two. Do not silently rewrite history.
- Every significant architecture change must update this register in the same change as the implementation or migration plan.

### Status meanings

- **Proposed** — a direction recommended for future implementation; not yet adopted.
- **Accepted** — a verified current implementation pattern recorded as the baseline, or an explicitly approved future decision. Historical approval for baseline entries is **Needs verification**.
- **Deprecated** — no longer recommended, but may remain for compatibility.
- **Superseded** — replaced by a later ADR, which must be linked.

## 2. Verified project architecture

### Current implementation

- **Application and routes:** The root application is CommonJS Node.js with Express 5. The root [server.js](server.js) is the entry point and contains most route registration and application logic inline. [routes/mongoRoutes.js](routes/mongoRoutes.js) provides a MongoDB router, and [routes/docxCopy.js](routes/docxCopy.js) provides the DOCX copy route. The `controllers` directory exists, but [controllers/pdfController.js](controllers/pdfController.js) is empty; it is not an active PDF controller. A second application tree exists under [neurocore-office](neurocore-office); its relationship to the root application as a deployment or canonical source is **Needs verification**.
- **Middleware:** [middleware/uploadMiddleware.js](middleware/uploadMiddleware.js) configures Multer disk storage in `uploads`, generated filenames, and a 50 MB limit. [middleware/validationMiddleware.js](middleware/validationMiddleware.js) allows files based on MIME type **or** extension; it does not verify file signatures or parse file contents. The dedicated DOCX upload route has a separate 25 MB limit.
- **Frontend:** [public/index.html](public/index.html), [public/script.js](public/script.js), and [public/style.css](public/style.css) implement a static, same-origin browser application without a frontend framework or build pipeline. `script.js` is a large, shared vanilla JavaScript file. The PDF.js 2.16.105 script is loaded from a CDN. Separate editor/viewer pages and scripts exist for some workflows.
- **Node.js and Python:** Node invokes Python scripts with `child_process.execFile`, passing arguments and, in some flows, a JSON payload file. Python scripts provide DOCX parsing, creation, and transformation. Python environment selection uses `PYTHON_EXECUTABLE` when set, then a fallback executable. See [docx_engine.py](docx_engine.py), [python/docx_converter.py](python/docx_converter.py), [python/docx_processor.py](python/docx_processor.py), [python/docx_editor.py](python/docx_editor.py), and [python/requirements.txt](python/requirements.txt).
- **Document storage and metadata:** Document bytes are primarily stored on the local filesystem, especially in `uploads`, with other routes also using `documents`, `protected`, `unprotected`, and configured folder locations. Metadata is derived from file stats and maintained in local JSON files, including [data/tags.json](data/tags.json), descriptions, and starred-document state. Several file operations are synchronous. Exact backup, retention, and recovery guarantees are **Needs verification**.
- **PDF processing:** The Node server uses `pdf-lib` and `pdf-parse` where available, calls the external `qpdf` executable for some password operations, and serves PDF.js to the browser. The precise deployment requirements for `qpdf` and PDF.js CDN availability are **Needs verification**.
- **DOCX processing:** DOCX workflows use Node packages including `mammoth`, `adm-zip`, and `docx`, plus Python modules including `python-docx` and Mammoth. DOCX editing uses an edited copy in the save route; some Python helper operations also create a `.bak` file. DOCX preview and edit fidelity varies by workflow.
- **MongoDB:** [db/mongoManager.js](db/mongoManager.js) connects to a configured MongoDB URI or a local default, attempts an embedded `MongoMemoryServer` fallback, exposes status/management routes, and synchronizes metadata derived from local files and JSON metadata into MongoDB. The filesystem and JSON remain directly used by document routes. Whether MongoDB is intended as a durable source of truth or a secondary index/cache is **Needs verification**. A root-level [mongoManager.js](mongoManager.js) copy also exists.
- **PPTX:** Upload validation and generic document listing recognize `.pptx`; the UI has a presentation category, and `/pdf/convert-to-pptx` writes a minimal package containing presentation XML. The current UI’s PPTX preview action downloads the file. A dedicated PPTX workspace, complete presentation generation, slide parsing, slide count, thumbnails, and slide preview are **not verified**. The Presentation Builder navigation is marked as coming soon.
- **Tests:** The root [package.json](package.json) uses Node’s built-in test runner via `npm test` (`node --test`). Current tests cover shared search behavior and DOCX-copy route behavior in [test/search.test.js](test/search.test.js) and [test/docx-copy.test.js](test/docx-copy.test.js). A permanent Playwright suite is not established by the root package configuration.

### Known implementation caveats

- The project has duplicated root and nested application files. The DOCX-copy tests assert parity for those entrypoints and route modules, but the canonical deployment tree and general synchronization process are **Needs verification**.
- The upload allowlist is not content validation. A valid extension or MIME value is insufficient to establish that uploaded bytes form a safe, valid document.
- The global Express setup reviewed does not show a general authentication middleware. Because the server listens on `0.0.0.0`, deployment access controls and intended network exposure are **Needs verification**.
- Not all document transformations preserve originals: the PDF redaction handler writes modified bytes to the resolved input path. This conflicts with the future mandatory rule in Section 7 and must be addressed before representing all workflows as non-destructive.
- Some Python-backed endpoints return tool error text directly. Whether those messages expose sensitive filesystem details in all deployment configurations is **Needs verification**.

## 3. Architecture decision records

Dates below are register/review dates. For accepted baseline patterns, the original adoption date and formal approver are **Needs verification**.

### ADR-001 — Express backend and application structure

- **Decision ID:** ADR-001
- **Title:** Keep the existing Express application as the backend baseline
- **Date:** 2026-11-24 (baseline review; original adoption date: Needs verification)
- **Status:** Accepted
- **Context:** The root package starts `server.js`; most document APIs and helpers are registered in that file, with selected route modules.
- **Problem:** Future contributors need a truthful description of the current organization and must avoid assuming that controllers or a complete layered architecture already exist.
- **Decision:** Record Express 5 and the current mixed organization—inline routes plus focused route modules—as the implemented baseline. Do not describe the empty PDF controller as active. Extract new modules only when a change has a clear boundary; do not broaden this ADR into an unrequested rewrite.
- **Alternatives considered:** Claim a fully layered controller/service architecture; move all routes into modules immediately; leave the application structure undocumented.
- **Reasons for selection:** This matches the root entry point, route mounts, and current module contents.
- **Consequences:** `server.js` remains a large maintenance surface. The root versus nested app ownership and long-term module boundaries require verification before a structural migration.
- **Security implications:** Review authorization, path validation, input limits, and error exposure at each route boundary; Express structure alone does not provide these controls.
- **Testing requirements:** Existing route behavior must remain covered when extracting or changing handlers; add focused API tests for new modules.
- **Related files and modules:** [package.json](package.json), [server.js](server.js), [routes/mongoRoutes.js](routes/mongoRoutes.js), [routes/docxCopy.js](routes/docxCopy.js), [controllers/pdfController.js](controllers/pdfController.js), [neurocore-office](neurocore-office)

### ADR-002 — Static vanilla JavaScript frontend

- **Decision ID:** ADR-002
- **Title:** Preserve the existing static browser frontend
- **Date:** 2026-11-24 (baseline review; original adoption date: Needs verification)
- **Status:** Accepted
- **Context:** Express serves static assets from `public`; the main dashboard is composed of HTML, CSS, and a large vanilla JavaScript file.
- **Problem:** The frontend architecture must be documented without assuming a framework, client-side build, or separate API client layer.
- **Decision:** Treat the static same-origin frontend as the current baseline. Keep changes consistent with the existing DOM, fetch, and page-specific script patterns unless a separately reviewed migration is approved.
- **Alternatives considered:** Introduce a UI framework; add a bundler; keep the frontend structure undocumented.
- **Reasons for selection:** The current HTML directly loads static assets and `script.js`; the package build command is a placeholder rather than a frontend build.
- **Consequences:** Minimal tooling and direct browser behavior, but shared global state and a large script can make changes harder to isolate. Any framework or bundler addition requires a separate proposal and dependency review.
- **Security implications:** Escape or safely render document-derived values; do not insert untrusted document content as executable HTML. Protect external CDN use and review CSP/integrity needs.
- **Testing requirements:** Test shared state and renderers with focused Node tests where practical; cover user-critical browser flows with browser automation as specified in ADR-014.
- **Related files and modules:** [public/index.html](public/index.html), [public/script.js](public/script.js), [public/style.css](public/style.css), [package.json](package.json)

### ADR-003 — Local filesystem document storage

- **Decision ID:** ADR-003
- **Title:** Record local filesystem storage as the current document-byte store
- **Date:** 2026-11-24 (baseline review; original adoption date: Needs verification)
- **Status:** Accepted
- **Context:** Upload, listing, copy, download, move, and editing routes directly address local directories; metadata also uses JSON files.
- **Problem:** The system must distinguish where document bytes live from the MongoDB metadata synchronization.
- **Decision:** Treat the filesystem as the current document-byte store and local JSON as active metadata storage. Do not claim cloud storage, distributed object storage, or MongoDB-backed file content. Preserve existing data when changing storage and use an explicit migration plan.
- **Alternatives considered:** MongoDB GridFS as the current byte store; cloud/object storage; undocumented mixed storage.
- **Reasons for selection:** The inspected routes read and write `uploads`, `documents`, and other local directories directly.
- **Consequences:** Simple local operation, but backup, capacity, concurrency, and multi-instance behavior need explicit decisions. The long-term metadata authority remains **Needs verification**.
- **Security implications:** Resolve client names only beneath configured roots; enforce least-privilege filesystem permissions; never return absolute paths.
- **Testing requirements:** Test upload, listing, copy, move, delete, restart persistence, and migration/rollback behavior for any storage change.
- **Related files and modules:** [server.js](server.js), [middleware/uploadMiddleware.js](middleware/uploadMiddleware.js), [data/tags.json](data/tags.json), [routes/docxCopy.js](routes/docxCopy.js), [db/mongoManager.js](db/mongoManager.js)

### ADR-004 — PDF processing strategy

- **Decision ID:** ADR-004
- **Title:** Record the current mixed Node.js and browser PDF toolchain
- **Date:** 2026-11-24 (baseline review; original adoption date: Needs verification)
- **Status:** Accepted
- **Context:** PDF routes are implemented inline. The server uses `pdf-lib` and `pdf-parse` conditionally, some password operations invoke `qpdf`, and the dashboard loads PDF.js from a CDN.
- **Problem:** The project must describe current processing rather than imply one unified PDF engine or a dedicated controller.
- **Decision:** Document this existing toolchain as current behavior only. Do not expand its scope or select replacement libraries under this ADR.
- **Alternatives considered:** One server-side library for all PDF work; a dedicated PDF service; claim that `pdfController.js` owns the functionality.
- **Reasons for selection:** This is the dependency and route usage visible in source.
- **Consequences:** Different workflows have different runtime requirements and error behavior. Optional module loading and external executable/CDN availability must be checked in deployments.
- **Security implications:** Do not overwrite originals during transformations; validate input documents; keep passwords in protected configuration; avoid returning tool stderr or filesystem paths.
- **Testing requirements:** Add focused tests for PDF list/search, copy, page parsing, encryption/decryption, and transformation behavior; include malformed, encrypted, and oversized input cases where supported.
- **Related files and modules:** [server.js](server.js), [package.json](package.json), [public/index.html](public/index.html), [controllers/pdfController.js](controllers/pdfController.js)

### ADR-005 — DOCX processing strategy

- **Decision ID:** ADR-005
- **Title:** Record the existing hybrid Node.js and Python DOCX workflows
- **Date:** 2026-11-24 (baseline review; original adoption date: Needs verification)
- **Status:** Accepted
- **Context:** DOCX functionality combines Node packages (`mammoth`, `adm-zip`, `docx`) and Python helpers (`python-docx`, XML/ZIP handling, Mammoth).
- **Problem:** Preview, creation, transformation, and editing have different implementations and fidelity; documenting them as one engine would be misleading.
- **Decision:** Keep the hybrid processing approach as the current baseline. Treat its text-level editing limitations and workflow-specific output as part of the behavior; new changes must not imply full Word fidelity.
- **Alternatives considered:** Node-only DOCX processing; Python-only processing; a third-party document conversion service.
- **Reasons for selection:** Both Node and Python implementations are currently invoked from routes.
- **Consequences:** Python environment and dependency availability affect features. DOCX edit behavior requires careful regression checks, especially around formatting and embedded content.
- **Security implications:** Parse untrusted ZIP/XML content defensively, avoid unsafe extraction paths, and write to a new output file rather than an original.
- **Testing requirements:** Cover valid and malformed packages, preview conversion, text edits, preservation of untouched content, output validity, and failure cleanup.
- **Related files and modules:** [server.js](server.js), [docx_engine.py](docx_engine.py), [python/docx_converter.py](python/docx_converter.py), [python/docx_processor.py](python/docx_processor.py), [python/docx_editor.py](python/docx_editor.py), [python/requirements.txt](python/requirements.txt)

### ADR-006 — Node.js–Python communication

- **Decision ID:** ADR-006
- **Title:** Record subprocess-based Python integration
- **Date:** 2026-11-24 (baseline review; original adoption date: Needs verification)
- **Status:** Accepted
- **Context:** Node uses `child_process.execFile` with configured Python executables, script paths, and command-line arguments; some flows use temporary JSON payloads.
- **Problem:** Python integration should be accurately characterized and constrained without replacing it in this documentation task.
- **Decision:** Treat Python as a subprocess-based document-processing helper, not an in-process Node module or standalone network service. Future calls must use argument arrays rather than shell command concatenation and must define timeouts, output bounds, cleanup, and error translation.
- **Alternatives considered:** Shell command strings; a persistent Python service; rewriting the Python workflows in JavaScript.
- **Reasons for selection:** Existing call sites use `execFile` and explicit argument arrays.
- **Consequences:** Deployment requires compatible Python and packages. Some operations create temporary files and need cleanup/error-path review.
- **Security implications:** Do not execute user-supplied Python source in production. The existing `/docx/python/exec` route executes supplied code using Python `exec`; it is a significant security risk and its access controls are **Needs verification**.
- **Testing requirements:** Verify argument handling, timeouts, invalid outputs, process failures, temporary-file cleanup, and safe behavior for malformed inputs.
- **Related files and modules:** [server.js](server.js), [docx_engine.py](docx_engine.py), [python/docx_editor.py](python/docx_editor.py), [python/requirements.txt](python/requirements.txt)

### ADR-007 — Document metadata management

- **Decision ID:** ADR-007
- **Title:** Record filesystem-derived metadata and JSON sidecars as current practice
- **Date:** 2026-11-24 (baseline review; original adoption date: Needs verification)
- **Status:** Accepted
- **Context:** Listing derives type, size, and modified time from files and combines those values with local tag, description, and starred state. MongoDB syncs selected records.
- **Problem:** Metadata authority and migration behavior are not consistently described.
- **Decision:** Document file stats and local JSON sidecars as the metadata sources used by current filesystem-backed routes. Do not claim a normalized, transactional metadata database. Define source-of-truth and conflict policy before a migration.
- **Alternatives considered:** MongoDB as immediate sole authority; metadata embedded in each document; leave metadata ownership unspecified.
- **Reasons for selection:** The list and tag routes read filesystem state and JSON files directly.
- **Consequences:** Metadata can become inconsistent with renamed or deleted files unless operations update all related state. Current reconciliation semantics are **Needs verification**.
- **Security implications:** Validate metadata input, avoid trusting paths stored in metadata, and do not expose sensitive internal fields.
- **Testing requirements:** Test metadata survives search/filtering, rename/move/copy, reload, and database synchronization without mutating unrelated entries.
- **Related files and modules:** [server.js](server.js), [data/tags.json](data/tags.json), [db/mongoManager.js](db/mongoManager.js), [public/script.js](public/script.js)

### ADR-008 — Document tagging

- **Decision ID:** ADR-008
- **Title:** Record JSON-backed tags keyed by filename
- **Date:** 2026-11-24 (baseline review; original adoption date: Needs verification)
- **Status:** Accepted
- **Context:** `data/tags.json` stores filename-to-tag-array mappings; upload logic assigns default tags, and MongoDB sync imports tag records.
- **Problem:** Tag associations must remain aligned with file operations and search behavior.
- **Decision:** Keep the JSON-backed tag map as the current implementation baseline. A future stable document identifier or database migration requires its own ADR and explicit migration/rollback plan.
- **Alternatives considered:** Store tags only in MongoDB; store tags in filenames; introduce stable IDs immediately.
- **Reasons for selection:** The current tag read/write and upload flows use the JSON map.
- **Consequences:** Filename changes require coordinated tag migration; filename collisions and duplicate identity must be considered.
- **Security implications:** Treat tags as untrusted text when rendering and validate updates to prevent path or HTML injection.
- **Testing requirements:** Cover tag add/remove, default upload tags, rename/move preservation, filtering, and no mutation of the master document list during search.
- **Related files and modules:** [server.js](server.js), [data/tags.json](data/tags.json), [public/script.js](public/script.js), [test/search.test.js](test/search.test.js)

### ADR-009 — API response conventions

- **Decision ID:** ADR-009
- **Title:** Standardize response envelopes for new and changed APIs
- **Date:** 2026-11-24
- **Status:** Proposed
- **Context:** Existing APIs commonly use a `success` boolean, but response fields and error details vary between routes.
- **Problem:** Frontend callers need a predictable distinction between successful and failed operations without breaking existing routes.
- **Decision:** For new or materially changed JSON endpoints, return an appropriate HTTP status and a consistent `success` boolean. Errors must include a safe, user-facing `message`; success responses may include documented endpoint-specific fields. Do not expose stack traces, subprocess stderr, absolute paths, or secrets. Migrate existing APIs only with an explicit compatibility plan.
- **Alternatives considered:** A strict universal `{ data, error }` envelope; leave all endpoint-specific response shapes unchanged; version all APIs immediately.
- **Reasons for selection:** A gradual convention is compatible with current response patterns and avoids an unrequested breaking change.
- **Consequences:** Existing APIs remain inconsistent until migrated; frontend callers must continue to follow endpoint contracts during that period.
- **Security implications:** Sanitize messages and log internal details server-side with appropriate redaction.
- **Testing requirements:** Assert status codes, success/error shapes, and visible frontend error handling for each changed endpoint.
- **Related files and modules:** [server.js](server.js), [routes/mongoRoutes.js](routes/mongoRoutes.js), [routes/docxCopy.js](routes/docxCopy.js), [public/script.js](public/script.js)

### ADR-010 — Filename validation and path traversal protection

- **Decision ID:** ADR-010
- **Title:** Accept filenames, not client-selected filesystem paths
- **Date:** 2026-11-24 (baseline review; project-wide adoption date: Needs verification)
- **Status:** Accepted
- **Context:** A shared `isSafeFilename` helper checks for basename-only names; the DOCX copy handler applies stricter checks for path separators, extension, invalid characters, and reserved names.
- **Problem:** Client-controlled paths can escape storage roots or target unintended files.
- **Decision:** Preserve the filename-only constraint as a required baseline. Resolve paths under server-selected storage roots and validate each endpoint’s allowed type. This entry verifies the DOCX copy path and a shared helper; it does not claim that all existing routes use equivalent validation.
- **Alternatives considered:** Accept relative or absolute paths from clients; rely on `path.join` alone; use filename validation without a fixed root.
- **Reasons for selection:** Fixed-root resolution and leaf-name validation reduce path traversal risk and match the copy endpoint contract.
- **Consequences:** Different operations must maintain consistent validation; a centralized, comprehensive policy remains future work.
- **Security implications:** Reject traversal, separators, NUL bytes, invalid extensions, and invalid names. Verify resolved paths remain beneath the selected root. Also validate file content; extension/MIME checks alone are insufficient.
- **Testing requirements:** Test traversal attempts, platform-specific separators, malformed names, symlinks/non-files where relevant, and valid boundary cases.
- **Related files and modules:** [server.js](server.js), [routes/docxCopy.js](routes/docxCopy.js), [test/docx-copy.test.js](test/docx-copy.test.js), [middleware/validationMiddleware.js](middleware/validationMiddleware.js)

### ADR-011 — DOCX copy and duplicate naming

- **Decision ID:** ADR-011
- **Title:** Allocate collision-safe DOCX copy names
- **Date:** 2026-11-24 (baseline review; original adoption date: Needs verification)
- **Status:** Accepted
- **Context:** `POST /documents/copy` takes a filename and copies within `uploads`; the handler uses exclusive creation and a bounded name search.
- **Problem:** A copy operation must not overwrite an existing destination or trust a client-supplied path.
- **Decision:** Preserve the implemented sequence `<stem>_copy.docx`, then `<stem>_copy_2.docx`, and so on. Use `COPYFILE_EXCL`; return 409 if no destination is allocated within the configured attempt limit.
- **Alternatives considered:** Overwrite the prior copy; append timestamps; accept a client-selected destination path.
- **Reasons for selection:** The sequence is predictable, tested, and non-overwriting.
- **Consequences:** The bounded retry limit is part of the current contract; future changes must update tests and documentation.
- **Security implications:** Copy only a validated leaf filename from the fixed upload directory; do not follow a client-supplied path or silently overwrite.
- **Testing requirements:** Cover first and subsequent copies, unchanged source, invalid input, missing source, occupied destinations, and unexpected filesystem failures.
- **Related files and modules:** [routes/docxCopy.js](routes/docxCopy.js), [test/docx-copy.test.js](test/docx-copy.test.js), [server.js](server.js), [neurocore-office/routes/docxCopy.js](neurocore-office/routes/docxCopy.js)

### ADR-012 — Error handling and logging

- **Decision ID:** ADR-012
- **Title:** Separate safe client errors from diagnostic server logs
- **Date:** 2026-11-24
- **Status:** Proposed
- **Context:** Routes use local `try/catch` blocks and console logging, but error payloads vary and some subprocess-backed routes return raw error text.
- **Problem:** Inconsistent errors hinder users and tests; raw diagnostics may disclose internal details.
- **Decision:** For future and changed routes, return safe, actionable messages and appropriate status codes; log diagnostic detail on the server with secrets and sensitive document content redacted. Do not use broad catches that silently return success-shaped data.
- **Alternatives considered:** Return raw exception text; suppress errors; add a new logging framework immediately.
- **Reasons for selection:** This improves reliability and protects implementation details while remaining compatible with existing Node logging.
- **Consequences:** Existing routes need gradual review; adding a logging dependency is not implied and requires a separate justification.
- **Security implications:** Never return secret values, absolute paths, stack traces, or unfiltered tool stderr to clients.
- **Testing requirements:** Assert visible failure behavior, safe response bodies, and that failures do not leave partial or corrupted files.
- **Related files and modules:** [server.js](server.js), [routes/mongoRoutes.js](routes/mongoRoutes.js), [routes/docxCopy.js](routes/docxCopy.js), [public/script.js](public/script.js)

### ADR-013 — Node.js built-in test runner

- **Decision ID:** ADR-013
- **Title:** Use `node:test` as the current automated test foundation
- **Date:** 2026-11-24 (baseline review; original adoption date: Needs verification)
- **Status:** Accepted
- **Context:** `npm test` runs `node --test`; existing tests exercise search helper behavior and DOCX copy HTTP behavior.
- **Problem:** New tests should fit the existing infrastructure and run consistently without introducing unnecessary test dependencies.
- **Decision:** Use Node’s built-in test runner for unit and API integration tests as the starting point. Add another runner only when a concrete testing requirement cannot be met with current tooling.
- **Alternatives considered:** Jest or Mocha; no automated tests; use browser tests for all logic.
- **Reasons for selection:** The package test command and checked-in tests already use `node:test`.
- **Consequences:** Tests must manage temporary resources and cleanup explicitly. Current coverage does not establish full API, security, or end-to-end coverage.
- **Security implications:** Use isolated temporary directories and test fixtures; never mutate production uploads or real user documents during tests.
- **Testing requirements:** Every new behavior needs focused success, error, and boundary tests. Regression tests are required for changes to existing PDF/DOCX workflows.
- **Related files and modules:** [package.json](package.json), [test/search.test.js](test/search.test.js), [test/docx-copy.test.js](test/docx-copy.test.js)

### ADR-014 — Browser automation and regression testing

- **Decision ID:** ADR-014
- **Title:** Establish repeatable browser regression tests for critical workflows
- **Date:** 2026-11-24
- **Status:** Proposed
- **Context:** Browser-level verification has been performed manually, but no permanent Playwright suite is declared in the root package configuration.
- **Problem:** API/unit tests cannot establish dashboard rendering, user-visible errors, refresh behavior, keyboard interaction, or cross-workspace consistency.
- **Decision:** Add a maintained Playwright end-to-end suite when CI/runtime prerequisites and supported browser behavior are agreed. Keep test cases focused on high-value flows and use isolated fixtures or a disposable test data root.
- **Alternatives considered:** Manual-only browser verification; add Playwright immediately without CI or test isolation; rely on DOM unit tests only.
- **Reasons for selection:** Repeatable browser coverage complements existing Node tests, but setup and data isolation are not yet established.
- **Consequences:** Requires browser installation/configuration and a predictable server/test-data lifecycle. Browser test ownership and CI availability are **Needs verification**.
- **Security implications:** Tests must not use real user documents or credentials. Avoid exposing a test server on an unintended network interface.
- **Testing requirements:** Prioritize upload/list/search/clear, tags and folder metadata, PDF/DOCX view parity, copy/rename/delete, visible failures, and accessibility checks.
- **Related files and modules:** [package.json](package.json), [public/index.html](public/index.html), [public/script.js](public/script.js), [test/search.test.js](test/search.test.js)

### ADR-015 — MongoDB integration

- **Decision ID:** ADR-015
- **Title:** Record MongoDB as a local status and synchronization integration
- **Date:** 2026-11-24 (baseline review; original adoption date: Needs verification)
- **Status:** Accepted
- **Context:** `mongoManager` attempts a configured or local MongoDB connection, can start an embedded memory server, and syncs local files/JSON. The router is mounted under `/api/db` and `/mongodb`.
- **Problem:** The MongoDB feature must not be misrepresented as the exclusive source for document files or metadata.
- **Decision:** Record the current integration as a MongoDB management/status and local-metadata-to-database synchronization layer. Keep local filesystem behavior documented as primary for file bytes. Whether MongoDB is durable, optional in production, or authoritative for particular metadata fields is **Needs verification**.
- **Alternatives considered:** Treat MongoDB as the sole source of truth; remove MongoDB integration; claim the embedded server is durable storage.
- **Reasons for selection:** Startup and route code explicitly initializes MongoDB and synchronizes local disk data; document routes still access local paths.
- **Consequences:** Connection and fallback behavior affect diagnostics. Memory-server persistence, lifecycle, and data durability need explicit deployment documentation.
- **Security implications:** Protect connection URIs and database-management routes; avoid logging credentials; validate collection names and filters, and verify authorization before network exposure.
- **Testing requirements:** Test unavailable database behavior, fallback status, sync idempotency, migration preservation, and safe handling of invalid database requests.
- **Related files and modules:** [db/mongoManager.js](db/mongoManager.js), [mongoManager.js](mongoManager.js), [routes/mongoRoutes.js](routes/mongoRoutes.js), [server.js](server.js)

### ADR-016 — PDF and DOCX workspace separation

- **Decision ID:** ADR-016
- **Title:** Keep PDF and DOCX as distinct user workspaces over shared storage
- **Date:** 2026-11-24 (baseline review; original adoption date: Needs verification)
- **Status:** Accepted
- **Context:** The dashboard includes dedicated PDF and DOCX sections, while the root document list and upload directory are shared.
- **Problem:** Workspace-specific interactions must not create divergent document inventories or alter shared metadata merely by filtering.
- **Decision:** Preserve separate PDF and DOCX views as presentation/workflow boundaries over the shared file collection. Search and view filtering should derive results without mutating the master collection.
- **Alternatives considered:** Separate physical stores for PDF and DOCX; a single undifferentiated workspace; duplicate client-side master lists.
- **Reasons for selection:** Current UI sections share the document listing and search state while applying type-specific rendering.
- **Consequences:** Shared operations require consistent refresh and metadata handling across views. Dedicated workspace behaviors remain separately testable.
- **Security implications:** Apply the same authorization and filename checks regardless of the workspace through which an operation is invoked.
- **Testing requirements:** Verify workspace lists, search, clearing filters, folder/tag retention, and document operation visibility across PDF and DOCX views.
- **Related files and modules:** [public/index.html](public/index.html), [public/script.js](public/script.js), [server.js](server.js), [test/search.test.js](test/search.test.js)

### ADR-017 — PPTX upload and integration architecture

- **Decision ID:** ADR-017
- **Title:** Define safe PPTX ingestion before adding presentation features
- **Date:** 2026-11-24
- **Status:** Proposed
- **Context:** Generic upload validation and listing recognize `.pptx`, the UI can categorize and download presentations, and `/pdf/convert-to-pptx` creates only a minimal package. There is no verified slide-processing pipeline.
- **Problem:** Generic extension support must not be confused with a complete PPTX product or secure validation.
- **Decision:** Before implementing PPTX workflows, define validation for the Open XML ZIP container and expected package parts; enforce upload size/resource limits; store originals under the existing configured local root initially unless a storage ADR changes it. Do not select a parser, renderer, or library until compatibility and requirements are researched.
- **Alternatives considered:** Treat extension recognition as full support; immediately add a guessed PPTX dependency; build a cloud conversion service without requirements.
- **Reasons for selection:** The current source establishes generic intake/list behavior but not a complete PPTX processing architecture.
- **Consequences:** PPTX remains a generic downloadable file until a compatible processing approach and explicit support statement are agreed. The existing minimal conversion route should not be represented as slide conversion.
- **Security implications:** Validate archive structure and content, defend against ZIP bombs and path traversal during extraction, and never trust MIME or extension alone.
- **Testing requirements:** Include real and malformed presentations, MIME/extension mismatch, oversized archives, and preservation of the uploaded original.
- **Related files and modules:** [server.js](server.js), [middleware/uploadMiddleware.js](middleware/uploadMiddleware.js), [middleware/validationMiddleware.js](middleware/validationMiddleware.js), [public/script.js](public/script.js), [package.json](package.json)

### ADR-018 — PPTX metadata and text extraction

- **Decision ID:** ADR-018
- **Title:** Research presentation metadata and text extraction requirements
- **Date:** 2026-11-24
- **Status:** Proposed
- **Context:** No verified slide-count, metadata, or slide-text extractor is present in the current package configuration or processing routes.
- **Problem:** Presentation metadata, extracted text, and search need a defined fidelity and compatibility contract.
- **Decision:** Research supported PPTX variants and expected metadata before choosing an implementation. Specify extraction behavior for slide count, presentation properties, slide order, text and notes (if required), and partial/corrupt documents. Do not promise full PowerPoint fidelity or select a library in advance.
- **Alternatives considered:** Parse Open XML directly; use a Node or Python library; invoke an office suite or external service; omit extraction.
- **Reasons for selection:** The repository provides no evidence that one option is compatible with its deployment and security requirements.
- **Consequences:** PPTX metadata/search features remain uncommitted until research and representative fixtures establish a support matrix.
- **Security implications:** Treat XML and ZIP contents as untrusted; limit decompressed size, CPU, memory, and processing time; avoid unsafe XML features and archive extraction.
- **Testing requirements:** Validate slide counts and extracted text against known fixtures, including blank slides, tables, unusual Unicode, notes, encrypted files, and corrupted archives where support is defined.
- **Related files and modules:** [server.js](server.js), [package.json](package.json), [python/requirements.txt](python/requirements.txt), [test](test)

### ADR-019 — PPTX preview and thumbnail strategy

- **Decision ID:** ADR-019
- **Title:** Select presentation preview only after compatibility evaluation
- **Date:** 2026-11-24
- **Status:** Proposed
- **Context:** PPTX capability metadata advertises preview, but the current frontend action downloads the file; the Presentation Builder is shown as coming soon.
- **Problem:** Slide preview may require rendering infrastructure, external software, or conversion, each with compatibility and resource implications.
- **Decision:** Compare browser-native, server-rendered, and download-only approaches against supported browsers, fidelity, privacy, accessibility, operational dependencies, and load limits before implementation. Until then, label behavior accurately and do not claim a working slide preview.
- **Alternatives considered:** Browser preview library; server-side rendering/conversion; download-only support; external hosted viewer.
- **Reasons for selection:** No current source evidence establishes a complete or supported preview engine.
- **Consequences:** Visual presentation workflows remain deferred; any chosen renderer needs operational and licensing review.
- **Security implications:** Avoid sending private presentations to third-party viewers without explicit approval; isolate renderers and constrain resource use.
- **Testing requirements:** Compare representative slides and layouts across supported PowerPoint versions and browsers; test error states, keyboard navigation, and screen-reader labels.
- **Related files and modules:** [server.js](server.js), [public/index.html](public/index.html), [public/script.js](public/script.js), [package.json](package.json)

### ADR-020 — PPTX storage, management, and search

- **Decision ID:** ADR-020
- **Title:** Extend shared document management only after PPTX contracts are defined
- **Date:** 2026-11-24
- **Status:** Proposed
- **Context:** Generic listing, category counts, and download already recognize PPTX, but a dedicated PPTX search/management contract and slide-level indexing are not verified.
- **Problem:** PPTX support must integrate without breaking existing document operations or implying unsupported capabilities.
- **Decision:** Reuse the shared document inventory for basic file operations where existing generic contracts are sufficient. Before adding PPTX-specific APIs, define filename/ID semantics, metadata shape, search scope (filename/tags versus slide text), pagination, error contract, and backward compatibility. Handle large files asynchronously or with explicit limits only after measurement; define corrupt-file reporting without discarding the original.
- **Alternatives considered:** Build a parallel PPTX-only inventory; expose slide-text search without size limits; claim the generic PDF conversion route is a full PPTX management API.
- **Reasons for selection:** Existing generic document list/download paths can support basic file management, while extraction, preview, and search requirements remain unsettled.
- **Consequences:** Basic upload/list/download is distinct from presentation-aware management. Limits and performance targets require benchmarks and representative files.
- **Security implications:** Preserve originals, avoid overwrite on copy, validate every API input, constrain decompression/rendering, and keep server paths and secrets out of responses.
- **Testing requirements:** Test generic list/search compatibility, tag/folder metadata, duplicate naming, large and corrupted files, extraction limits, and regression behavior across PDF/DOCX.
- **Related files and modules:** [server.js](server.js), [routes/docxCopy.js](routes/docxCopy.js), [public/script.js](public/script.js), [middleware/validationMiddleware.js](middleware/validationMiddleware.js), [test/search.test.js](test/search.test.js)

## 4. PPTX architecture decisions — future work

This section expands the proposed ADRs above. It does not authorize implementation or a dependency choice.

| Concern | Current evidence | Future decision required |
|---|---|---|
| Upload and validation | Generic upload accepts `.pptx` by extension or MIME type; no signature validation is shown. | Validate actual Open XML package content, limits, encrypted inputs, and failure behavior. |
| File storage | Generic uploads are written to local `uploads`; generic listing/download recognizes PPTX. | Decide whether local storage remains sufficient for large decks, backups, and concurrent operation. |
| Slide count and presentation metadata | No dedicated extraction implementation was verified. | Define required properties, slide-count semantics, and handling of malformed/missing package parts. |
| Slide text and search | No verified slide-text index exists. | Decide whether to index slide text, notes, tables, or only filenames/tags; define refresh and deletion behavior. |
| Thumbnails and slide preview | Current PPTX UI action downloads the file; no thumbnail renderer was verified. | Evaluate fidelity, privacy, operational dependencies, accessibility, and resource isolation before selecting a renderer. |
| PowerPoint compatibility | No supported-version matrix was found. | Define representative desktop/web versions and fixtures before promising compatibility. |
| Node.js versus Python | Both runtimes are used for other document workflows; no PPTX assignment exists. | Compare library compatibility, runtime cost, security, packaging, and maintenance; do not assume one language is preferred. |
| Large presentations | Upload middleware has a 50 MB limit, but processing limits/benchmarks for PPTX are not defined. | Measure representative sizes; bound memory, CPU, decompressed bytes, and time; determine whether background jobs are needed. |
| Corrupted or hostile packages | Generic extension/MIME validation is not sufficient. | Fail safely, report a non-sensitive error, preserve the original, and clean temporary artifacts. |
| Management APIs | Generic list/download exist; no complete PPTX-specific API contract was verified. | Reuse existing generic APIs where appropriate; document any presentation-specific endpoints and compatibility guarantees before release. |

No library, renderer, parser, service, or performance threshold is selected here. Research and compatibility results should be recorded in a follow-up ADR before implementation.

## 5. UI/UX decisions

- Preserve clear distinctions between PDF and DOCX workflows while keeping shared inventory and metadata consistent.
- Search and filtering are view state: clearing a query must restore the full current collection without mutating master file records, tags, or folders.
- Show operation failures visibly and preserve actionable messages; do not silently treat failed requests as success.
- Do not advertise a preview or editor capability that currently only downloads a file or opens a “coming soon” state.
- For document-derived text, use safe DOM rendering and accessible controls. Keyboard support, focus behavior, contrast, responsive behavior, and assistive-technology coverage should be tested for changed UI.
- These are engineering standards; a formal design system, accessibility target, and UX approval owner are **Needs verification**.

## 6. Performance and reliability standards

- Measure file listing, search, PDF parsing, Python subprocess, MongoDB sync, and preview costs before introducing optimization thresholds.
- Avoid loading or transforming unbounded documents in memory. Prefer bounded input sizes, pagination, streaming, or background processing when measurements justify them.
- Set explicit timeouts and output/resource limits for subprocess and archive-processing work; clean temporary artifacts on both success and failure.
- Preserve originals and make copy/transform outputs collision-safe. Never report success when the output is partial or invalid.
- Treat MongoDB connection failure, Python absence, external-tool absence, malformed documents, and filesystem errors as explicit states with safe client messages.
- Performance SLOs, supported maximum document sizes beyond existing upload limits, and production deployment topology are **Needs verification**.

## 7. Security and reliability rules

The following are mandatory rules for new code and for changes to existing document workflows:

1. Never overwrite original user documents during editing or transformation. Write a new output, verify it, and retain the original. **Known gap:** the current PDF redaction route writes to its resolved input file.
2. Never trust user-supplied filesystem paths. Accept validated leaf filenames or opaque identifiers, resolve beneath a fixed server-selected root, and verify containment.
3. Validate filenames and file extensions for each operation. Reject traversal, invalid names, unexpected extensions, and special filesystem entries.
4. Prevent path traversal on every route, not only DOCX copy. Do not rely on `path.join` or a basename check alone as the full policy.
5. Avoid overwriting existing files during copy or output allocation. Use exclusive creation or an equivalent collision-safe operation.
6. Use safe temporary files/directories with restrictive permissions, unique names, bounded lifetime, and guaranteed cleanup on errors.
7. Validate uploaded file content, not only extensions or client-provided MIME types. Apply format-specific archive/document checks and resource limits.
8. Handle malformed, encrypted, and corrupted documents safely. Fail explicitly, clean partial output, and preserve the original.
9. Never expose sensitive server paths, stack traces, secrets, credentials, or raw subprocess diagnostics in frontend responses.
10. Preserve existing user data during migrations. Provide backup, validation, rollback, and idempotency plans before changing storage or schema.
11. Require focused regression tests for changes to existing PDF/DOCX workflows and shared file-management behavior.
12. Verify authentication and authorization before exposing file, database, or code-execution routes on a network. The current authorization policy is **Needs verification**; `/docx/python/exec` must not be exposed to untrusted users.

These are required engineering rules, not a claim that every current route already complies.

## 8. Testing and quality standards

Use the existing `npm test` / `node --test` command as the starting point. Keep test fixtures isolated and never run destructive tests against user data.

### Unit tests

Test pure search, metadata, validation, duplicate-name, and transformation helpers at their boundaries. Assert that filtered results do not mutate master collections.

### API integration tests

Exercise Express routes with temporary directories and fixtures. Verify request method/body, success and failure status codes, response shape, filesystem effects, cleanup, and visible-safe messages.

### End-to-end tests

Establish Playwright automation as a proposed follow-up (ADR-014). Use an isolated app instance and test data. Cover core journeys rather than duplicating every unit case.

### Regression and security tests

Any change to existing document workflows must include regression coverage. Test path traversal, invalid extensions, MIME/content mismatch, collision/overwrite behavior, malformed files, oversized inputs, unauthorized access where applicable, and data-preserving migration behavior.

### Performance and accessibility tests

Benchmark representative document sizes before setting thresholds. Test responsive layouts, keyboard operation, focus order, semantic labels, contrast, and screen-reader error/status announcements on changed user flows.

### Format-specific expectations

- **PDF:** Validate list/search and page metadata; password behavior when configured; preserve source files for edits; cover malformed/encrypted inputs and external `qpdf` failures.
- **DOCX:** Validate upload, list, copy, preview, and edit behavior; verify originals and unaffected content remain intact; cover malformed packages, formatting limitations, Python failures, and temporary cleanup.
- **PPTX:** Before claiming feature support, test upload-content validation, package integrity, metadata/slide count/text against known fixtures, preview compatibility if implemented, resource limits, corruption handling, and compatibility with generic document APIs.

Current test coverage is focused and does not establish complete unit, API, browser, security, performance, or accessibility coverage.

## 9. Change management

- **New features:** State the user-facing scope, supported formats, error behavior, security boundary, test approach, and impact on shared file state.
- **Architecture changes:** Add or update an ADR before or alongside implementation. Record alternatives and why the selected option is appropriate.
- **API changes:** Document method, path, request, response, status codes, and frontend callers. Preserve compatibility or explicitly version/migrate breaking behavior.
- **Database changes:** Document schema, indexes, ownership, migration/backfill, rollback, and preservation of local data. Do not assume MongoDB is the source of truth without resolving ADR-015.
- **Storage changes:** Define data migration, integrity checks, backup/recovery, path policy, concurrency, and rollback before switching storage.
- **Dependency additions:** Explain why existing packages are insufficient; verify runtime, license, security, maintenance, size, and compatibility before adding dependencies. PPTX dependencies require ADR research first.
- **Deprecated functionality:** Mark the ADR Deprecated, document the replacement or removal schedule, and preserve compatibility where needed.
- **Backward compatibility:** Treat existing PDF/DOCX routes, files, metadata, and UI workflows as user data and public behavior. Add regression tests before changing them.
- **Documentation:** Update this register for every significant architecture change; update user-facing documentation when behavior or setup changes.

## 10. Decision history index

| ADR | Decision | Status | Date | Related module |
|---|---|---|---|---|
| ADR-001 | Express backend and application structure | Accepted | 2026-11-24 | `server.js`, `routes/` |
| ADR-002 | Static vanilla JavaScript frontend | Accepted | 2026-11-24 | `public/` |
| ADR-003 | Local filesystem document storage | Accepted | 2026-11-24 | `uploads/`, `data/` |
| ADR-004 | PDF processing strategy | Accepted | 2026-11-24 | PDF routes and viewer |
| ADR-005 | DOCX processing strategy | Accepted | 2026-11-24 | DOCX routes and Python helpers |
| ADR-006 | Node.js–Python communication | Accepted | 2026-11-24 | `server.js`, Python helpers |
| ADR-007 | Document metadata management | Accepted | 2026-11-24 | `data/`, document routes |
| ADR-008 | Document tagging | Accepted | 2026-11-24 | `data/tags.json` |
| ADR-009 | API response conventions | Proposed | 2026-11-24 | Express APIs |
| ADR-010 | Filename validation and path traversal protection | Accepted (limited baseline) | 2026-11-24 | File routes and upload middleware |
| ADR-011 | DOCX copy and duplicate naming | Accepted | 2026-11-24 | `routes/docxCopy.js` |
| ADR-012 | Error handling and logging | Proposed | 2026-11-24 | Express and subprocess routes |
| ADR-013 | Node.js built-in test runner | Accepted | 2026-11-24 | `test/`, `package.json` |
| ADR-014 | Browser automation and regression testing | Proposed | 2026-11-24 | Playwright / browser workflows |
| ADR-015 | MongoDB integration | Accepted | 2026-11-24 | `db/mongoManager.js`, `routes/mongoRoutes.js` |
| ADR-016 | PDF and DOCX workspace separation | Accepted | 2026-11-24 | `public/`, shared document APIs |
| ADR-017 | PPTX upload and integration architecture | Proposed | 2026-11-24 | Upload and document APIs |
| ADR-018 | PPTX metadata and text extraction | Proposed | 2026-11-24 | Future PPTX processing |
| ADR-019 | PPTX preview and thumbnail strategy | Proposed | 2026-11-24 | Future PPTX viewer |
| ADR-020 | PPTX storage, management, and search | Proposed | 2026-11-24 | Shared document APIs |

## 11. Unverified architecture questions

The following points require confirmation before they are treated as settled architecture:

- Which of the root and nested application trees is canonical for development and deployment, and how they are kept in sync.
- Whether MongoDB is optional, durable in production, or authoritative for any metadata; the persistence guarantees of the embedded memory-server fallback.
- The intended authentication/authorization model and whether any external deployment layer protects the server.
- Backup, restore, retention, and recovery requirements for local files and JSON metadata.
- Which routes consistently validate filenames and resolved paths, validate file contents, and avoid returning sensitive internal errors.
- Supported Node.js and Python runtime versions, operating systems, external `qpdf` availability, and offline/CDN expectations.
- The supported PowerPoint compatibility matrix and required PPTX upload, metadata, search, edit, and preview features.
- CI availability, browser test ownership, and production performance targets.

