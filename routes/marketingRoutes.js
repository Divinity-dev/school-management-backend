import express from "express";
import multer from "multer";

import {
  getMarketingOverview,
  listMarketingContacts,
  createMarketingContact,
  updateMarketingContact,
  archiveMarketingContact,
  importMarketingContacts,
  listMarketingCampaigns,
  createMarketingCampaign,
  getMarketingCampaign,
  sendMarketingCampaignBatch,
  scheduleMarketingCampaignBatch,
  cancelScheduledMarketingCampaignBatch,
  listMarketingInbox,
  getMarketingInboxMessage,
  replyToMarketingMessage,
  listMarketingSuppressions,
  listMarketingActivities,
  unsubscribeMarketingEmail,
  handleResendMarketingWebhook,
} from "../controllers/marketingController.js";

import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    const allowed = /\.(csv|xlsx|xls)$/i.test(file.originalname || "");
    if (!allowed) return callback(new Error("Only CSV and Excel files are supported."));
    return callback(null, true);
  },
});

// Public provider callbacks and unsubscribe links.
router.post("/webhooks/resend", handleResendMarketingWebhook);
router.get("/unsubscribe/:token", unsubscribeMarketingEmail);
router.post("/unsubscribe/:token", express.urlencoded({ extended: false }), unsubscribeMarketingEmail);

// All dashboard operations are restricted to platform super administrators.
router.use(protect, authorize("superAdmin"));

router.get("/overview", getMarketingOverview);

router.route("/contacts")
  .get(listMarketingContacts)
  .post(createMarketingContact);

router.post("/contacts/import", upload.single("file"), importMarketingContacts);
router.patch("/contacts/:id", updateMarketingContact);
router.delete("/contacts/:id", archiveMarketingContact);

router.route("/campaigns")
  .get(listMarketingCampaigns)
  .post(createMarketingCampaign);

router.get("/campaigns/:id", getMarketingCampaign);
router.post("/campaigns/:id/send", sendMarketingCampaignBatch);
router.post("/campaigns/:id/schedule", scheduleMarketingCampaignBatch);
router.post("/campaigns/:id/cancel-scheduled", cancelScheduledMarketingCampaignBatch);

router.get("/inbox", listMarketingInbox);
router.get("/inbox/:id", getMarketingInboxMessage);
router.post("/inbox/:id/reply", replyToMarketingMessage);

router.get("/suppressions", listMarketingSuppressions);
router.get("/activity", listMarketingActivities);

export default router;
