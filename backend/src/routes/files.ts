import { Router, Request, Response } from "express";
import multer from "multer";
import { join } from "path";
import { mkdirSync, existsSync } from "fs";
import { emitToDeviceRaw } from "../services/socketService";
import { prisma } from "../config/database";

const filesRouter = Router();

// Create uploads directory if it doesn't exist
const uploadDir = join(process.cwd(), "uploads");
if (!existsSync(uploadDir)) {
  mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    cb(null, uploadDir);
  },
  filename: (req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    // Generate a unique filename or use original
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  }
});

const upload = multer({ storage });

filesRouter.post("/", upload.single("file"), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  // Construct download URL
  const downloadUrl = `/uploads/${req.file.filename}`;
  
  const targetExternalId = req.body.targetDeviceId;
  if (targetExternalId) {
    const device = await prisma.device.findUnique({
      where: { externalId: targetExternalId }
    });
    if (device) {
      emitToDeviceRaw(device.id, "file:received", {
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

export { filesRouter };
