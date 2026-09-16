"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.devicesRouter = void 0;
const express_1 = require("express");
const devicesController_1 = require("../controllers/devicesController");
exports.devicesRouter = (0, express_1.Router)();
exports.devicesRouter.post("/register", devicesController_1.registerDevice);
