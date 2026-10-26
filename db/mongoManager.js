/**
 * NeuroCore Office - MongoDB Database Manager
 * Supports direct connection to MongoDB Compass at mongodb://127.0.0.1:27017/
 * Persists documents metadata, tags, PDF annotations, version history,
 * collaboration, student hub data, and system audit logs.
 */

const { MongoClient, ObjectId } = require("mongodb");
const { MongoMemoryServer } = require("mongodb-memory-server");
const fs = require("fs");
const path = require("path");

class MongoManager {
    constructor() {
        this.client = null;
        this.db = null;
        this.mongod = null;
        this.isConnected = false;
        this.isMemoryServer = false;
        this.connectionUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/";
        this.dbName = "neurocore_office";
        this.stats = {
            connectedAt: null,
            lastSyncAt: null,
            operationsCount: 0,
            activeUri: this.connectionUri
        };
    }

    /**
     * Initialize connection. Attempts connecting to 127.0.0.1:27017.
     * If no standalone server is running, launches MongoMemoryServer on 27017.
     */
    async init() {
        console.log(`[MongoDB] Initializing connection to ${this.connectionUri}...`);
        
        try {
            // First attempt to connect to the target URI directly
            await this.tryConnect(this.connectionUri);
            console.log(`[MongoDB] Successfully connected to existing MongoDB server at ${this.connectionUri}`);
        } catch (err) {
            console.log(`[MongoDB] No existing instance responding at ${this.connectionUri}. Starting embedded instance on 27017...`);
            try {
                this.mongod = await MongoMemoryServer.create({
                    instance: {
                        port: 27017,
                        ip: "127.0.0.1",
                        dbName: this.dbName
                    }
                });
                this.isMemoryServer = true;
                const memoryUri = this.mongod.getUri();
                this.connectionUri = "mongodb://127.0.0.1:27017/";
                await this.tryConnect(memoryUri);
                console.log(`[MongoDB] Embedded MongoMemoryServer successfully online at ${this.connectionUri}`);
            } catch (memErr) {
                console.error("[MongoDB] Failed to start embedded server:", memErr.message);
                // Try fallback dynamic port if 27017 was occupied
                try {
                    this.mongod = await MongoMemoryServer.create({
                        instance: { dbName: this.dbName }
                    });
                    this.isMemoryServer = true;
                    this.connectionUri = this.mongod.getUri();
                    await this.tryConnect(this.connectionUri);
                    console.log(`[MongoDB] Embedded server started on fallback URI: ${this.connectionUri}`);
                } catch (fallbackErr) {
                    console.error("[MongoDB] Complete initialization failure:", fallbackErr.message);
                    this.isConnected = false;
                    return false;
                }
            }
        }

        if (this.isConnected) {
            await this.setupIndexes();
            this.stats.connectedAt = new Date().toISOString();
            this.stats.activeUri = this.connectionUri;
            await this.logAudit("DATABASE_ONLINE", null, { uri: this.connectionUri, memoryServer: this.isMemoryServer });
        }
        return this.isConnected;
    }

    async tryConnect(uri) {
        if (this.client) {
            try { await this.client.close(); } catch (_) {}
        }
        this.client = new MongoClient(uri, {
            serverSelectionTimeoutMS: 3000,
            connectTimeoutMS: 3000
        });
        await this.client.connect();
        this.db = this.client.db(this.dbName);
        // Ping database
        await this.db.command({ ping: 1 });
        this.isConnected = true;
        this.connectionUri = uri;
    }

    async setupIndexes() {
        if (!this.isConnected || !this.db) return;
        try {
            const docsCol = this.db.collection("documents");
            await docsCol.createIndex({ name: 1 }, { unique: true });
            await docsCol.createIndex({ tags: 1 });
            await docsCol.createIndex({ type: 1 });
            await docsCol.createIndex({ modified: -1 });
            await docsCol.createIndex({ starred: 1 });

            const tagsCol = this.db.collection("tags");
            await tagsCol.createIndex({ filename: 1 }, { unique: true });

            const annoCol = this.db.collection("pdf_annotations");
            await annoCol.createIndex({ filename: 1 }, { unique: true });

            const verCol = this.db.collection("versions");
            await verCol.createIndex({ filename: 1 });
            await verCol.createIndex({ timestamp: -1 });

            const collabCol = this.db.collection("collaboration");
            await collabCol.createIndex({ filename: 1 }, { unique: true });

            const auditCol = this.db.collection("audit_logs");
            await auditCol.createIndex({ timestamp: -1 });
            await auditCol.createIndex({ action: 1 });

            const hubCol = this.db.collection("student_hub");
            await hubCol.createIndex({ id: 1 }, { unique: true });

            console.log("[MongoDB] Database indexes verified.");
        } catch (err) {
            console.warn("[MongoDB] Index setup warning:", err.message);
        }
    }

    /**
     * Get Database connection status & diagnostics
     */
    async getStatus() {
        let collectionsInfo = [];
        let dbStats = null;

        if (this.isConnected && this.db) {
            try {
                const cols = await this.db.listCollections().toArray();
                for (const c of cols) {
                    const count = await this.db.collection(c.name).countDocuments();
                    collectionsInfo.push({ name: c.name, count });
                }
                try {
                    dbStats = await this.db.stats();
                } catch (_) {}
            } catch (err) {
                console.error("[MongoDB] Error gathering status:", err.message);
            }
        }

        return {
            connected: this.isConnected,
            isMemoryServer: this.isMemoryServer,
            connectionUri: this.connectionUri,
            compassUri: "mongodb://127.0.0.1:27017/",
            databaseName: this.dbName,
            connectedAt: this.stats.connectedAt,
            lastSyncAt: this.stats.lastSyncAt,
            operationsCount: this.stats.operationsCount,
            collections: collectionsInfo,
            dbStats: dbStats ? {
                dataSize: dbStats.dataSize,
                storageSize: dbStats.storageSize,
                indexes: dbStats.indexes,
                objects: dbStats.objects
            } : null
        };
    }

    /**
     * Record an audit log event directly in MongoDB
     */
    async logAudit(action, filename = null, details = {}, user = "Neuro User") {
        this.stats.operationsCount++;
        if (!this.isConnected || !this.db) return null;
        try {
            const entry = {
                action,
                filename: filename ? path.basename(filename) : null,
                details,
                user,
                timestamp: new Date().toISOString(),
                ip: "127.0.0.1"
            };
            await this.db.collection("audit_logs").insertOne(entry);
            return entry;
        } catch (err) {
            console.warn("[MongoDB] Audit log error:", err.message);
            return null;
        }
    }

    // ==========================================
    // DOCUMENT MANAGEMENT (CRUD)
    // ==========================================

    async upsertDocument(docData) {
        if (!this.isConnected || !this.db) return false;
        try {
            const cleanName = path.basename(docData.name);
            const updateDoc = {
                ...docData,
                name: cleanName,
                updatedAt: new Date().toISOString()
            };
            if (!updateDoc.createdAt) {
                updateDoc.createdAt = updateDoc.updatedAt;
            }

            await this.db.collection("documents").updateOne(
                { name: cleanName },
                { $set: updateDoc },
                { upsert: true }
            );
            this.stats.operationsCount++;
            return true;
        } catch (err) {
            console.error("[MongoDB] upsertDocument error:", err.message);
            return false;
        }
    }

    async getDocument(filename) {
        if (!this.isConnected || !this.db) return null;
        try {
            const clean = path.basename(filename);
            return await this.db.collection("documents").findOne({ name: clean });
        } catch (err) {
            console.error("[MongoDB] getDocument error:", err.message);
            return null;
        }
    }

    async deleteDocument(filename) {
        if (!this.isConnected || !this.db) return false;
        try {
            const clean = path.basename(filename);
            await this.db.collection("documents").deleteOne({ name: clean });
            await this.db.collection("tags").deleteOne({ filename: clean });
            await this.db.collection("pdf_annotations").deleteOne({ filename: clean });
            await this.logAudit("DOCUMENT_DELETE", clean, { success: true });
            return true;
        } catch (err) {
            console.error("[MongoDB] deleteDocument error:", err.message);
            return false;
        }
    }

    async listDocuments(query = {}, sort = { modified: -1 }) {
        if (!this.isConnected || !this.db) return [];
        try {
            return await this.db.collection("documents").find(query).sort(sort).toArray();
        } catch (err) {
            console.error("[MongoDB] listDocuments error:", err.message);
            return [];
        }
    }

    // ==========================================
    // TAGS MANAGEMENT
    // ==========================================

    async saveTags(filename, tagsList) {
        if (!this.isConnected || !this.db) return false;
        try {
            const clean = path.basename(filename);
            const tags = Array.isArray(tagsList) ? tagsList : [];

            // Update in documents collection
            await this.db.collection("documents").updateOne(
                { name: clean },
                { $set: { tags: tags, updatedAt: new Date().toISOString() } },
                { upsert: false }
            );

            // Update in dedicated tags collection
            await this.db.collection("tags").updateOne(
                { filename: clean },
                { $set: { filename: clean, tags: tags, updatedAt: new Date().toISOString() } },
                { upsert: true }
            );

            await this.logAudit("TAGS_UPDATE", clean, { tagsCount: tags.length, tags });
            return true;
        } catch (err) {
            console.error("[MongoDB] saveTags error:", err.message);
            return false;
        }
    }

    async getAllTags() {
        if (!this.isConnected || !this.db) return {};
        try {
            const docs = await this.db.collection("tags").find({}).toArray();
            const map = {};
            docs.forEach(d => {
                if (d.filename) map[d.filename] = d.tags || [];
            });
            return map;
        } catch (err) {
            console.error("[MongoDB] getAllTags error:", err.message);
            return {};
        }
    }

    // ==========================================
    // PDF ANNOTATIONS & EDITS
    // ==========================================

    async savePdfAnnotations(filename, annotations) {
        if (!this.isConnected || !this.db) return false;
        try {
            const clean = path.basename(filename);
            const annoList = Array.isArray(annotations) ? annotations : [];
            await this.db.collection("pdf_annotations").updateOne(
                { filename: clean },
                {
                    $set: {
                        filename: clean,
                        annotations: annoList,
                        count: annoList.length,
                        updatedAt: new Date().toISOString()
                    }
                },
                { upsert: true }
            );

            // Reflect count in documents collection
            await this.db.collection("documents").updateOne(
                { name: clean },
                { $set: { annotationCount: annoList.length } }
            );

            await this.logAudit("PDF_ANNOTATIONS_SAVE", clean, { count: annoList.length });
            return true;
        } catch (err) {
            console.error("[MongoDB] savePdfAnnotations error:", err.message);
            return false;
        }
    }

    async getPdfAnnotations(filename) {
        if (!this.isConnected || !this.db) return [];
        try {
            const clean = path.basename(filename);
            const doc = await this.db.collection("pdf_annotations").findOne({ filename: clean });
            return doc && doc.annotations ? doc.annotations : [];
        } catch (err) {
            console.error("[MongoDB] getPdfAnnotations error:", err.message);
            return [];
        }
    }

    // ==========================================
    // VERSION HISTORY
    // ==========================================

    async addVersion(filename, versionData) {
        if (!this.isConnected || !this.db) return false;
        try {
            const clean = path.basename(filename);
            const entry = {
                filename: clean,
                version: versionData.version || 1,
                timestamp: versionData.timestamp || new Date().toISOString(),
                author: versionData.author || "Neuro User",
                action: versionData.action || "Modified",
                size: versionData.size || 0,
                backupFile: versionData.backupFile || null,
                summary: versionData.summary || ""
            };

            await this.db.collection("versions").insertOne(entry);
            await this.logAudit("VERSION_CREATED", clean, { version: entry.version, action: entry.action });
            return true;
        } catch (err) {
            console.error("[MongoDB] addVersion error:", err.message);
            return false;
        }
    }

    async getVersions(filename) {
        if (!this.isConnected || !this.db) return [];
        try {
            const clean = path.basename(filename);
            return await this.db.collection("versions").find({ filename: clean }).sort({ timestamp: -1 }).toArray();
        } catch (err) {
            console.error("[MongoDB] getVersions error:", err.message);
            return [];
        }
    }

    // ==========================================
    // COLLABORATION & ACTIVITY
    // ==========================================

    async saveCollaboration(filename, collabData) {
        if (!this.isConnected || !this.db) return false;
        try {
            const clean = path.basename(filename);
            await this.db.collection("collaboration").updateOne(
                { filename: clean },
                {
                    $set: {
                        filename: clean,
                        shares: collabData.shares || [],
                        comments: collabData.comments || [],
                        activity: collabData.activity || [],
                        updatedAt: new Date().toISOString()
                    }
                },
                { upsert: true }
            );
            return true;
        } catch (err) {
            console.error("[MongoDB] saveCollaboration error:", err.message);
            return false;
        }
    }

    async getCollaboration(filename) {
        if (!this.isConnected || !this.db) return { shares: [], comments: [], activity: [] };
        try {
            const clean = path.basename(filename);
            const doc = await this.db.collection("collaboration").findOne({ filename: clean });
            return doc || { shares: [], comments: [], activity: [] };
        } catch (err) {
            console.error("[MongoDB] getCollaboration error:", err.message);
            return { shares: [], comments: [], activity: [] };
        }
    }

    // ==========================================
    // SEED & SYNC FROM LOCAL DISK
    // ==========================================

    /**
     * Seeds and synchronizes all existing local files and data/*.json into MongoDB
     */
    async syncAllData({ uploadsDir, dataDir, allowedFolders = [] }) {
        if (!this.isConnected || !this.db) {
            throw new Error("MongoDB is not connected");
        }

        console.log("[MongoDB] Starting comprehensive disk-to-database synchronization...");
        const report = {
            documents: 0,
            tags: 0,
            annotations: 0,
            versions: 0,
            collaboration: 0,
            studentHub: 0
        };

        // 1. Sync tags.json
        try {
            const tagsPath = path.join(dataDir, "tags.json");
            if (fs.existsSync(tagsPath)) {
                const tagsData = JSON.parse(fs.readFileSync(tagsPath, "utf8") || "{}");
                for (const [file, tagArr] of Object.entries(tagsData)) {
                    if (Array.isArray(tagArr)) {
                        await this.db.collection("tags").updateOne(
                            { filename: file },
                            { $set: { filename: file, tags: tagArr, updatedAt: new Date().toISOString() } },
                            { upsert: true }
                        );
                        report.tags++;
                    }
                }
            }
        } catch (e) {
            console.warn("[MongoDB Sync] tags warning:", e.message);
        }

        // 2. Sync pdf_annotations.json
        try {
            const annoPath = path.join(dataDir, "pdf_annotations.json");
            if (fs.existsSync(annoPath)) {
                const annoData = JSON.parse(fs.readFileSync(annoPath, "utf8") || "{}");
                for (const [file, items] of Object.entries(annoData)) {
                    if (Array.isArray(items)) {
                        await this.db.collection("pdf_annotations").updateOne(
                            { filename: file },
                            { $set: { filename: file, annotations: items, count: items.length, updatedAt: new Date().toISOString() } },
                            { upsert: true }
                        );
                        report.annotations++;
                    }
                }
            }
        } catch (e) {
            console.warn("[MongoDB Sync] annotations warning:", e.message);
        }

        // 3. Sync versions.json
        try {
            const verPath = path.join(dataDir, "versions.json");
            if (fs.existsSync(verPath)) {
                const verData = JSON.parse(fs.readFileSync(verPath, "utf8") || "{}");
                for (const [file, vList] of Object.entries(verData)) {
                    if (Array.isArray(vList)) {
                        for (const v of vList) {
                            await this.db.collection("versions").updateOne(
                                { filename: file, version: v.version || 1 },
                                { $set: { ...v, filename: file } },
                                { upsert: true }
                            );
                            report.versions++;
                        }
                    }
                }
            }
        } catch (e) {
            console.warn("[MongoDB Sync] versions warning:", e.message);
        }

        // 4. Sync collaboration.json
        try {
            const colPath = path.join(dataDir, "collaboration.json");
            if (fs.existsSync(colPath)) {
                const colData = JSON.parse(fs.readFileSync(colPath, "utf8") || "{}");
                for (const [file, cData] of Object.entries(colData)) {
                    await this.db.collection("collaboration").updateOne(
                        { filename: file },
                        { $set: { filename: file, ...cData, updatedAt: new Date().toISOString() } },
                        { upsert: true }
                    );
                    report.collaboration++;
                }
            }
        } catch (e) {
            console.warn("[MongoDB Sync] collaboration warning:", e.message);
        }

        // 5. Sync student_hub.json
        try {
            const hubPath = path.join(dataDir, "student_hub.json");
            if (fs.existsSync(hubPath)) {
                const hubData = JSON.parse(fs.readFileSync(hubPath, "utf8") || "[]");
                if (Array.isArray(hubData)) {
                    for (const item of hubData) {
                        const id = item.id || `hub-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
                        await this.db.collection("student_hub").updateOne(
                            { id },
                            { $set: { ...item, id } },
                            { upsert: true }
                        );
                        report.studentHub++;
                    }
                }
            }
        } catch (e) {
            console.warn("[MongoDB Sync] student hub warning:", e.message);
        }

        // 6. Sync physical files in uploads and subfolders
        try {
            const tagsMap = await this.getAllTags();
            const scanDir = (dir, folderName = "") => {
                if (!fs.existsSync(dir)) return [];
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                let files = [];
                for (const ent of entries) {
                    if (ent.name.startsWith(".")) continue;
                    const full = path.join(dir, ent.name);
                    if (ent.isDirectory()) {
                        files = files.concat(scanDir(full, ent.name));
                    } else if (ent.isFile()) {
                        files.push({ name: ent.name, fullPath: full, folder: folderName });
                    }
                }
                return files;
            };

            const allFiles = scanDir(uploadsDir);
            for (const f of allFiles) {
                const stat = fs.statSync(f.fullPath);
                const ext = path.extname(f.name).toLowerCase();
                let type = "other";
                if (ext === ".pdf") type = "pdf";
                else if (ext === ".docx") type = "docx";
                else if (ext === ".xlsx") type = "xlsx";
                else if (ext === ".pptx") type = "pptx";
                else if (ext === ".txt") type = "txt";

                const docEntry = {
                    name: f.name,
                    folder: f.folder || "Root",
                    type,
                    size: stat.size,
                    modified: stat.mtime.toISOString(),
                    owner: "You",
                    status: "Normal",
                    starred: false,
                    tags: tagsMap[f.name] || (type === "pdf" ? ["PDF"] : ["Document"]),
                    path: f.fullPath,
                    updatedAt: new Date().toISOString()
                };

                await this.db.collection("documents").updateOne(
                    { name: f.name },
                    { $set: docEntry },
                    { upsert: true }
                );
                report.documents++;
            }
        } catch (e) {
            console.warn("[MongoDB Sync] files scan warning:", e.message);
        }

        this.stats.lastSyncAt = new Date().toISOString();
        await this.logAudit("DATABASE_SYNC", null, report);
        console.log("[MongoDB] Database synchronization completed:", report);
        return report;
    }

    // ==========================================
    // COMPASS EXPORT & QUERY EXPLORER
    // ==========================================

    /**
     * Export all collections formatted for MongoDB Compass JSON import
     */
    async exportCompassDump() {
        if (!this.isConnected || !this.db) {
            throw new Error("MongoDB is not connected");
        }

        const collections = ["documents", "tags", "pdf_annotations", "versions", "collaboration", "audit_logs", "student_hub"];
        const dump = {};

        for (const c of collections) {
            try {
                dump[c] = await this.db.collection(c).find({}).toArray();
            } catch (_) {
                dump[c] = [];
            }
        }

        return {
            database: this.dbName,
            exportedAt: new Date().toISOString(),
            compassUri: "mongodb://127.0.0.1:27017/",
            collections: dump
        };
    }

    /**
     * Execute arbitrary read query (with safety filters) for MongoDB Compass explorer UI
     */
    async executeCompassQuery(collectionName, filter = {}, sort = {}, limit = 50) {
        if (!this.isConnected || !this.db) {
            throw new Error("MongoDB is not connected");
        }
        const col = this.db.collection(collectionName);
        const docs = await col.find(filter).sort(sort).limit(Math.min(limit, 100)).toArray();
        const total = await col.countDocuments(filter);
        return { total, docs };
    }
}

// Singleton instance
const mongoManager = new MongoManager();

module.exports = mongoManager;
