/**
 * NeuroCore Office - MongoDB Management & Compass Router
 * Provides REST endpoints for MongoDB status, connection config,
 * collection browsing, data explorer, seed/sync, Compass query runner,
 * and JSON dump exports.
 */

const express = require("express");
const router = express.Router();
const path = require("path");
const { ObjectId } = require("mongodb");
const mongoManager = require("../db/mongoManager");

// GET /api/db/status - Get MongoDB status & diagnostics
router.get("/status", async (req, res) => {
    try {
        const status = await mongoManager.getStatus();
        res.json({ success: true, ...status });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/db/connect - Connect or switch MongoDB URI
router.post("/connect", async (req, res) => {
    try {
        let { uri } = req.body;
        if (!uri || !uri.trim()) {
            uri = "mongodb://127.0.0.1:27017/";
        }
        uri = uri.trim();
        console.log(`[MongoDB Route] Switching connection URI to: ${uri}`);
        await mongoManager.tryConnect(uri);
        await mongoManager.setupIndexes();
        const status = await mongoManager.getStatus();
        res.json({
            success: true,
            message: `Connected successfully to ${uri}`,
            status
        });
    } catch (err) {
        res.status(400).json({
            success: false,
            message: `Failed to connect: ${err.message}`
        });
    }
});

// POST /api/db/sync - Synchronize all local files & JSON databases into MongoDB
router.post("/sync", async (req, res) => {
    try {
        if (!mongoManager.isConnected) {
            await mongoManager.init();
        }
        const report = await mongoManager.syncAllData({
            uploadsDir: path.join(__dirname, "..", "uploads"),
            dataDir: path.join(__dirname, "..", "data"),
            allowedFolders: ["Books", "College", "Notes", "Projects", "Archive"]
        });
        const status = await mongoManager.getStatus();
        res.json({
            success: true,
            message: "Synchronization completed successfully.",
            report,
            status
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/db/collections - List all collections with stats
router.get("/collections", async (req, res) => {
    try {
        if (!mongoManager.isConnected || !mongoManager.db) {
            return res.json({ success: false, message: "MongoDB is not connected", collections: [] });
        }
        const collections = ["documents", "tags", "pdf_annotations", "versions", "collaboration", "audit_logs", "student_hub"];
        const details = [];
        for (const name of collections) {
            const col = mongoManager.db.collection(name);
            const count = await col.countDocuments();
            const sample = await col.findOne();
            details.push({
                name,
                count,
                sampleDoc: sample || null
            });
        }
        res.json({ success: true, collections: details });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/db/collection/:name - Browse collection with search/filter/pagination
router.get("/collection/:name", async (req, res) => {
    try {
        if (!mongoManager.isConnected || !mongoManager.db) {
            return res.status(503).json({ success: false, message: "MongoDB is not connected" });
        }
        const collectionName = req.params.name;
        const col = mongoManager.db.collection(collectionName);
        
        let filter = {};
        if (req.query.filter) {
            try {
                filter = JSON.parse(req.query.filter);
            } catch (_) {
                // If filter is simple text, search common string fields
                const text = req.query.filter.trim();
                filter = {
                    $or: [
                        { name: { $regex: text, $options: "i" } },
                        { filename: { $regex: text, $options: "i" } },
                        { action: { $regex: text, $options: "i" } },
                        { user: { $regex: text, $options: "i" } },
                        { category: { $regex: text, $options: "i" } }
                    ]
                };
            }
        }

        let sort = { _id: -1 };
        if (req.query.sort) {
            try { sort = JSON.parse(req.query.sort); } catch (_) {}
        }

        const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const skip = (page - 1) * limit;

        const total = await col.countDocuments(filter);
        const docs = await col.find(filter).sort(sort).skip(skip).limit(limit).toArray();

        res.json({
            success: true,
            collection: collectionName,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit) || 1,
            documents: docs
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/db/collection/:name - Insert a document into a collection
router.post("/collection/:name", async (req, res) => {
    try {
        if (!mongoManager.isConnected || !mongoManager.db) {
            return res.status(503).json({ success: false, message: "MongoDB is not connected" });
        }
        const collectionName = req.params.name;
        const col = mongoManager.db.collection(collectionName);
        const doc = req.body;
        doc.createdAt = new Date().toISOString();
        const result = await col.insertOne(doc);
        await mongoManager.logAudit("DB_INSERT", null, { collection: collectionName, id: result.insertedId });
        res.json({ success: true, message: "Document inserted successfully", id: result.insertedId });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// PUT /api/db/collection/:name/:id - Update document by _id
router.put("/collection/:name/:id", async (req, res) => {
    try {
        if (!mongoManager.isConnected || !mongoManager.db) {
            return res.status(503).json({ success: false, message: "MongoDB is not connected" });
        }
        const { name, id } = req.params;
        const col = mongoManager.db.collection(name);
        
        let query;
        try {
            query = { _id: new ObjectId(id) };
        } catch (_) {
            query = { _id: id };
        }

        const updateData = { ...req.body, updatedAt: new Date().toISOString() };
        delete updateData._id;

        const result = await col.updateOne(query, { $set: updateData });
        await mongoManager.logAudit("DB_UPDATE", null, { collection: name, id, modified: result.modifiedCount });
        res.json({ success: true, message: "Document updated", matched: result.matchedCount, modified: result.modifiedCount });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE /api/db/collection/:name/:id - Delete document by _id
router.delete("/collection/:name/:id", async (req, res) => {
    try {
        if (!mongoManager.isConnected || !mongoManager.db) {
            return res.status(503).json({ success: false, message: "MongoDB is not connected" });
        }
        const { name, id } = req.params;
        const col = mongoManager.db.collection(name);

        let query;
        try {
            query = { _id: new ObjectId(id) };
        } catch (_) {
            query = { _id: id };
        }

        const result = await col.deleteOne(query);
        await mongoManager.logAudit("DB_DELETE", null, { collection: name, id, deleted: result.deletedCount });
        res.json({ success: true, message: "Document deleted", count: result.deletedCount });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/db/compass/info - Connection guide and Compass queries
router.get("/compass/info", async (req, res) => {
    try {
        const status = await mongoManager.getStatus();
        res.json({
            success: true,
            compassConnectionString: "mongodb://127.0.0.1:27017/",
            databaseName: "neurocore_office",
            serverStatus: status.connected ? "ONLINE" : "STANDBY",
            collections: [
                {
                    name: "documents",
                    description: "Document records, sizes, paths, tags, MIME types, page counts, stars",
                    sampleQuery: '{ "type": "pdf" }',
                    compassFilter: '{ "starred": true }'
                },
                {
                    name: "tags",
                    description: "Global & per-document tags, categorization, and taxonomy",
                    sampleQuery: '{ "tags": "proposal" }'
                },
                {
                    name: "pdf_annotations",
                    description: "PDF in-place text edits, highlights, shapes, stamps, eSignatures",
                    sampleQuery: '{ "count": { "$gt": 0 } }'
                },
                {
                    name: "versions",
                    description: "Document revision histories, change logs, snapshots",
                    sampleQuery: '{ "version": { "$gte": 1 } }'
                },
                {
                    name: "collaboration",
                    description: "Document comments, shares, user permissions, and activity timeline",
                    sampleQuery: '{ "shares": { "$exists": true } }'
                },
                {
                    name: "audit_logs",
                    description: "Detailed system operations trail (merges, OCR, redactions, signatures)",
                    sampleQuery: '{ "action": "PDF_MERGE" }'
                },
                {
                    name: "student_hub",
                    description: "Academic syllabus, notes, flashcards, semesters, GPA records",
                    sampleQuery: '{ "category": "Notes" }'
                }
            ],
            sampleAggregations: [
                {
                    title: "Document Types Breakdown",
                    collection: "documents",
                    pipeline: [
                        { $group: { _id: "$type", count: { $sum: 1 }, totalSize: { $sum: "$size" } } },
                        { $sort: { count: -1 } }
                    ]
                },
                {
                    title: "Tag Cloud Frequency",
                    collection: "documents",
                    pipeline: [
                        { $unwind: "$tags" },
                        { $group: { _id: "$tags", count: { $sum: 1 } } },
                        { $sort: { count: -1 } }
                    ]
                },
                {
                    title: "Recent Audit Events Breakdown",
                    collection: "audit_logs",
                    pipeline: [
                        { $group: { _id: "$action", count: { $sum: 1 } } },
                        { $sort: { count: -1 } }
                    ]
                }
            ]
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/db/compass/export-all - Download all collections formatted for Compass JSON import
router.get("/compass/export-all", async (req, res) => {
    try {
        const dump = await mongoManager.exportCompassDump();
        res.setHeader("Content-Disposition", 'attachment; filename="neurocore_office_compass_dump.json"');
        res.setHeader("Content-Type", "application/json");
        res.send(JSON.stringify(dump, null, 2));
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/db/compass/export/:collection - Download single collection for Compass
router.get("/compass/export/:collection", async (req, res) => {
    try {
        const collectionName = req.params.collection;
        const col = mongoManager.db.collection(collectionName);
        const docs = await col.find({}).toArray();
        res.setHeader("Content-Disposition", `attachment; filename="${collectionName}.json"`);
        res.setHeader("Content-Type", "application/json");
        res.send(JSON.stringify(docs, null, 2));
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
