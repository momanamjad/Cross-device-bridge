"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.contactsRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const contactsController_1 = require("../controllers/contactsController");
const environment_1 = require("../config/environment");
// Allow either Bearer token or x-register-secret for contacts
function contactsAuth(req, res, next) {
    const secret = req.header("x-register-secret");
    if (secret && secret === environment_1.env.registerSecret) {
        return next();
    }
    return (0, auth_1.requireDeviceAuth)(req, res, next);
}
exports.contactsRouter = (0, express_1.Router)();
exports.contactsRouter.post("/sync", contactsAuth, contactsController_1.syncContacts);
exports.contactsRouter.get("/", auth_1.requireDeviceAuth, contactsController_1.getContacts);
exports.contactsRouter.get("/resolve", auth_1.requireDeviceAuth, contactsController_1.resolveContact);
//# sourceMappingURL=contacts.js.map