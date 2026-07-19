# 🧠 NeuroCore Office

NeuroCore Office is a modern office document management application built with **Node.js**, **Express**, **HTML**, **CSS**, and **JavaScript**. It provides PDF management, document organization, metadata, and productivity features through a clean desktop-style interface.

---

## ✨ Features

### 📄 PDF Management
- Upload PDF documents
- View PDF list
- Open PDFs in browser
- Delete PDFs
- Move PDFs between folders
- Rename PDFs
- PDF metadata display

### 🏷️ PDF Tagging System
- Add tags to PDF documents
- Edit existing tags
- Delete tags
- Persistent tag storage using `data/tags.json`
- Dashboard displays tags for each PDF
- REST APIs for tag management

### 📊 Dashboard
- Recent PDF list
- File size
- Modified date
- Owner
- Status
- Tags
- Document actions

---

## 🛠️ Tech Stack

### Backend
- Node.js
- Express.js

### Frontend
- HTML5
- CSS3
- JavaScript (Vanilla)

### Libraries
- multer
- pdf-lib
- mammoth
- xlsx
- fs
- path

---

## 📁 Project Structure

```
neurocore-office/
│
├── data/
│   └── tags.json
│
├── uploads/
│
├── public/
│   ├── index.html
│   ├── style.css
│   └── script.js
│
├── server.js
├── package.json
└── README.md
```

---

## 🚀 Installation

Clone the repository:

```bash
git clone https://github.com/YOUR_USERNAME/neurocore-office.git
```

Go to the project folder:

```bash
cd neurocore-office
```

Install dependencies:

```bash
npm install
```

Start the server:

```bash
node server.js
```

Open your browser:

```
http://localhost:3000
```

---

## 📡 API Endpoints

### PDF

| Method | Endpoint | Description |
|---------|----------|-------------|
| GET | `/pdfs` | Get all PDFs |
| GET | `/pdf/:filename` | Open PDF |
| DELETE | `/pdf/:filename` | Delete PDF |

### Tags

| Method | Endpoint | Description |
|---------|----------|-------------|
| GET | `/pdf/:filename/tags` | Get tags |
| POST | `/pdf/:filename/tags` | Add tags |
| PATCH | `/pdf/:filename/tags` | Update tags |
| DELETE | `/pdf/:filename/tags` | Delete tags |

---

## 📌 Current Features

- ✅ PDF Upload
- ✅ PDF Viewer
- ✅ PDF Delete
- ✅ PDF Rename
- ✅ PDF Move
- ✅ Dashboard
- ✅ Metadata
- ✅ PDF Tagging System

---

## 🚧 Planned Features

- AI-powered document analysis
- Full-text search
- PDF annotations
- OCR support
- Document version history
- User authentication
- Folder management
- Favorites
- Recent activity
- Advanced filtering
- Cloud storage integration
- AI document assistant

---

## 📄 License

This project is for educational and personal development purposes.

---

**NeuroCore Office** — A modern office document management platform built with Node.js and Express.
