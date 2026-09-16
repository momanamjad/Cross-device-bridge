"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.filesRouter = void 0;
const express_1 = require("express");
const multer_1 = require("multer");
const path_1 = require("path");
const fs_1 = require("fs");
const socketService_1 = require("../services/socketService");
const database_1 = require("../config/database");
const filesRouter = (0, express_1.Router)();
exports.filesRouter = filesRouter;
// Resolve uploads directory safely inside app storage
const getUploadDir = () => {
    if (process.env.STORAGE_DIR) {
        return (0, path_1.join)(process.env.STORAGE_DIR, "uploads");
    }
    return (0, path_1.join)(process.cwd(), "uploads");
};
const uploadDir = getUploadDir();
try {
    if (!(0, fs_1.existsSync)(uploadDir)) {
        (0, fs_1.mkdirSync)(uploadDir, { recursive: true });
    }
}
catch (err) {
    console.warn(`[WARN] Could not create uploads directory at ${uploadDir}: ${err?.message}`);
}
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        try {
            if (!(0, fs_1.existsSync)(uploadDir)) {
                (0, fs_1.mkdirSync)(uploadDir, { recursive: true });
            }
        }
        catch (_) { }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Generate a unique filename or use original
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + "-" + file.originalname);
    }
});
const upload = (0, multer_1.default)({ storage });
filesRouter.post("/", upload.single("file"), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
    }
    // Construct download URL
    const downloadUrl = `/uploads/${req.file.filename}`;
    const targetExternalId = req.body.targetDeviceId;
    if (targetExternalId) {
        const device = await database_1.prisma.device.findUnique({
            where: { externalId: targetExternalId }
        });
        if (device) {
            (0, socketService_1.emitToDeviceRaw)(device.id, "file:received", {
                url: downloadUrl,
                filename: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size
            });
        }
    }
    return res.json({
        message: "File uploaded successfully",
        url: downloadUrl,
        filename: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
    });
});
