import { Router } from "express";
import { registerDevice } from "../controllers/devicesController";

export const devicesRouter = Router();
devicesRouter.post("/register", registerDevice);
