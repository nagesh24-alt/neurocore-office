# AI Office Software - SDLC Structure

## 1. Project Overview

AI Office Software is a Node.js and Express based office productivity application with a browser frontend built using HTML, CSS, and JavaScript.

The application supports file upload, file management, multi-format file preview, AI text tools, a rich text editor, a PDF viewer, and a dashboard interface.

## 2. SDLC Model

Recommended model: Agile Iterative SDLC

Reason:
- The application has multiple modules that can be built and improved independently.
- Features such as AI tools, document preview, upload, editor, and dashboard can be developed in short iterations.
- Bugs and UI improvements can be handled continuously without waiting for a large release.

Suggested sprint length: 1 to 2 weeks.

## 3. Requirement Analysis

### Functional Requirements

- Upload files from the browser.
- Store uploaded files on the server.
- Display uploaded files in a file manager.
- Preview supported file types such as PDF, DOCX, XLSX, text, and images.
- Open PDF files in the PDF viewer.
- Edit text or document content in the rich text editor.
- Run AI actions such as summarize, rewrite, and grammar correction.
- Download files.
- Delete files.
- Search files in the dashboard.
- Show empty and error states without breaking the UI.

### Non-Functional Requirements

- The UI should remain stable even if an API request fails.
- JavaScript errors should be handled gracefully.
- File operations should validate user input.
- The application should use a clear folder structure.
- The backend should return consistent JSON responses.
- The app should be easy to test, debug, and maintain.

## 4. Feasibility Study

### Technical Feasibility

The project is technically feasible using:
- Node.js
- Express
- Multer for file upload
- Mammoth for DOCX preview
- XLSX for spreadsheet preview
- HTML, CSS, and JavaScript for frontend

### Operational Feasibility

The software is useful for small office workflows where users need file upload, preview, editing, and AI assistance in one place.

### Economic Feasibility

The current technology stack uses open-source packages, making the project cost-effective for development and learning.

## 5. System Design

### High-Level Architecture

Frontend:
- public/index.html
- public/style.css
- public/script.js

Backend:
- server.js
- Express routes for upload, read, save, files, delete, download, and AI editing

Storage:
- uploads/ directory for uploaded files

### Main Modules

- Dashboard Module
- File Upload Module
- File Manager Module
- File Preview Module
- Rich Text Editor Module
- AI Tools Module
- PDF Viewer Module
- Server API Module
- Storage Module

## 6. Recommended Project Folder Structure

```text
ai-office/
  server.js
  package.json
  package-lock.json
  .gitignore

  public/
    index.html
    style.css
    script.js
    assets/
      icons/
      images/

  uploads/
    .gitkeep

  docs/
    SDLC.md
    AI-Office-SDLC.pdf
    requirements.md
    test-plan.md
    user-manual.md

  tests/
    api/
    frontend/

  scripts/
    generate-sdlc-pdf.js
```

## 7. Implementation Plan

### Phase 1: Core Setup

- Initialize Node.js project.
- Configure Express server.
- Serve static frontend files.
- Create upload directory.
- Add base dashboard UI.

### Phase 2: File Upload and Manager

- Add upload endpoint.
- Add file listing endpoint.
- Render file list in dashboard.
- Add empty state and error state.
- Add download and delete actions.

### Phase 3: Multi-Format Preview

- Preview text files.
- Preview images.
- Preview PDF files in PDF viewer.
- Convert DOCX to HTML for preview.
- Convert XLSX sheet data into HTML tables.

### Phase 4: Rich Text Editor

- Add contenteditable editor.
- Add formatting toolbar.
- Support basic formatting actions.
- Add save functionality.

### Phase 5: AI Tools

- Add AI action selector.
- Add input and output areas.
- Add summarize, rewrite, and grammar actions.
- Add apply-to-editor workflow.

### Phase 6: UI Stability and Error Handling

- Add null checks before DOM updates.
- Wrap async functions in try-catch.
- Show safe fallback UI when APIs fail.
- Add useful console logs for debugging.
- Keep layout stable with flex and grid.

### Phase 7: Testing and Release

- Test upload, preview, delete, download, and AI tools.
- Test unsupported file types.
- Test empty uploads folder.
- Test API failure states.
- Fix bugs before release.

## 8. Testing Strategy

### Unit Testing

Recommended targets:
- File type detection.
- HTML escaping.
- AI action logic.
- File list rendering helpers.

### Integration Testing

Recommended targets:
- POST /upload
- GET /files
- GET /read/:filename
- POST /save
- DELETE /delete/:filename
- GET /download/:filename

### UI Testing

Recommended checks:
- Dashboard loads without console crashes.
- File list shows uploaded files.
- Empty file list shows "No files available".
- Upload modal opens and closes.
- File actions work from the dashboard.
- Editor and AI tabs remain usable.
- PDF viewer opens for PDF files.

### Manual Test Cases

| Test Case | Expected Result |
|---|---|
| Open dashboard with no files | Shows "No files available" |
| Upload image | Image appears in file list |
| Open image | Image preview opens |
| Upload PDF | PDF appears in file list |
| Open PDF | PDF viewer displays the file |
| Delete file | File is removed from list |
| API failure | UI shows safe error state |
| Missing DOM element | Error is logged, UI does not crash |

## 9. Deployment Plan

### Local Deployment

```bash
npm install
node server.js
```

Open:

```text
http://localhost:3000
```

### Production Recommendations

- Use environment variables for configuration.
- Add file size and file type validation.
- Store uploads outside the public folder or use cloud storage.
- Add authentication before exposing user files.
- Add logging and monitoring.
- Use a process manager such as PM2.
- Serve behind Nginx or another reverse proxy.

## 10. Maintenance Plan

### Corrective Maintenance

- Fix bugs in upload, preview, editor, AI tools, or dashboard.
- Improve handling for broken files or unsupported formats.

### Adaptive Maintenance

- Update dependencies.
- Add support for more file formats.
- Integrate real AI APIs.
- Add database-backed file metadata.

### Perfective Maintenance

- Improve dashboard design.
- Add folders, tags, sorting, and filters.
- Add document templates.
- Add collaboration features.

### Preventive Maintenance

- Add automated tests.
- Refactor large JavaScript functions into modules.
- Add linting and formatting.
- Improve error logging.

## 11. Risk Management

| Risk | Impact | Mitigation |
|---|---|---|
| File upload vulnerability | High | Validate file type, size, and filename |
| JavaScript crash | Medium | Add null checks and try-catch blocks |
| Unsupported file preview | Medium | Show fallback preview message |
| Large file upload | Medium | Enforce file size limits |
| Data loss on delete | High | Add confirmation and later add recycle bin |
| AI output quality issue | Medium | Add user review before applying output |

## 12. Version Roadmap

### Version 1.0

- File upload
- File manager
- Basic preview
- Dashboard
- AI text tools
- Rich text editor

### Version 1.1

- Better error handling
- Search and filter files
- Improved PDF viewer
- Better responsive UI

### Version 1.2

- Authentication
- User-specific file storage
- Database metadata
- Activity history

### Version 2.0

- Real AI API integration
- Collaboration
- Cloud storage
- Templates
- Advanced document editing

## 13. Coding Standards

- Keep HTML IDs consistent with JavaScript selectors.
- Always check if a DOM element exists before updating it.
- Wrap API calls in try-catch blocks.
- Use clear function names.
- Keep frontend rendering functions separate from API functions.
- Escape user-controlled text before inserting it into HTML.
- Do not let API failures break the dashboard layout.

## 14. Deliverables

- Source code
- SDLC document
- Test plan
- User manual
- Deployment instructions
- Bug list and issue tracker
- Release notes

## 15. Conclusion

This SDLC structure gives the AI Office Software a clear development path from requirements to maintenance. It supports iterative development, safer releases, better debugging, and long-term scalability.
