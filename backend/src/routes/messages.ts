import { Router } from "express";
import { requireDeviceAuth } from "../middleware/auth";
import {
  confirmCall,
  confirmMessage,
  createCall,
  createSms,
  listCalls,
  listMessages,
} from "../controllers/messagesController";

export const messagesRouter = Router();
messagesRouter.use(requireDeviceAuth);
messagesRouter.post("/sms", createSms);
messagesRouter.post("/call", createCall);
messagesRouter.get("/", listMessages);
messagesRouter.post("/:id/confirm", confirmMessage);

export const callsRouter = Router();
callsRouter.use(requireDeviceAuth);
callsRouter.get("/", listCalls);
callsRouter.post("/:id/confirm", confirmCall);
