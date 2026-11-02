import crypto from "node:crypto";
import XLSX from "xlsx";

import MarketingContact from "../models/MarketingContact.js";
import MarketingCampaign from "../models/MarketingCampaign.js";
import MarketingCampaignRecipient from "../models/MarketingCampaignRecipient.js";
import MarketingMessage from "../models/MarketingMessage.js";
import MarketingSuppression from "../models/MarketingSuppression.js";
import MarketingWebhookEvent from "../models/MarketingWebhookEvent.js";
import MarketingActivity from "../models/MarketingActivity.js";

import {
  extractEmail,
  htmlToText,
  normalizeEmail,
  personalizeCampaignHtml,
  resendRequest,
} from "../utils/marketingEmail.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const verifyResendWebhookSignature = (rawBody, headers, secret) => {
  const id = String(headers["svix-id"] || "");
  const timestamp = String(headers["svix-timestamp"] || "");
  const signatureHeader = String(headers["svix-signature"] || "");
  const timestampNumber = Number(timestamp);

  if (
    !secret ||
    !id ||
    !timestamp ||
    !signatureHeader ||
    !Number.isFinite(timestampNumber) ||
    Math.abs(Date.now() / 1000 - timestampNumber) > 300
  ) {
    return false;
  }

  const encodedSecret = secret.replace(/^whsec_/, "");
  let key;
  try {
    key = Buffer.from(encodedSecret, "base64");
  } catch {
    return false;
  }
  if (!key.length) return false;

  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const expected = Buffer.from(
    crypto.createHmac("sha256", key).update(signedContent).digest("base64")
  );

  return signatureHeader.split(" ").some((versionedSignature) => {
    const [version, suppliedValue] = versionedSignature.split(",");
    if (version !== "v1" || !suppliedValue) return false;

    const supplied = Buffer.from(suppliedValue);
    return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
  });
};

const recordMarketingActivity = (req, activity) =>
  MarketingActivity.create({
    ...activity,
    actor: req?.user?._id || null,
  }).catch(() => null);

const sendError = (res, error, fallback = "The request could not be completed.") => {
  const status = Number(error?.status) >= 400 && Number(error?.status) < 600
    ? Number(error.status)
    : 500;

  return res.status(status).json({
    success: false,
    message: error?.message || fallback,
  });
};

const escapeHtml = (value = "") =>
  String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);

const getHeader = (headers = {}, name) => {
  const key = Object.keys(headers || {}).find(
    (item) => item.toLowerCase() === name.toLowerCase()
  );
  return key ? String(headers[key] || "") : "";
};

const refreshCampaignCounts = async (campaignId) => {
  const [sent, scheduled, delivered, bounced, failed, suppressed, queued, replies] = await Promise.all([
    MarketingCampaignRecipient.countDocuments({
      campaign: campaignId,
      status: { $in: ["sent", "delivered", "bounced", "complained"] },
    }),
    MarketingCampaignRecipient.countDocuments({ campaign: campaignId, status: "scheduled" }),
    MarketingCampaignRecipient.countDocuments({ campaign: campaignId, status: "delivered" }),
    MarketingCampaignRecipient.countDocuments({
      campaign: campaignId,
      status: { $in: ["bounced", "complained"] },
    }),
    MarketingCampaignRecipient.countDocuments({ campaign: campaignId, status: "failed" }),
    MarketingCampaignRecipient.countDocuments({ campaign: campaignId, status: "suppressed" }),
    MarketingCampaignRecipient.countDocuments({ campaign: campaignId, status: "queued" }),
    MarketingMessage.countDocuments({ campaign: campaignId, direction: "inbound" }),
  ]);

  const status = queued > 0
    ? (sent > 0 || scheduled > 0 ? "partial" : "draft")
    : (failed > 0 ? "partial" : scheduled > 0 ? "scheduled" : sent > 0 ? "sent" : suppressed > 0 ? "failed" : "sent");

  await MarketingCampaign.findByIdAndUpdate(campaignId, {
    sentCount: sent,
    scheduledCount: scheduled,
    queuedCount: queued,
    suppressedCount: suppressed,
    deliveredCount: delivered,
    bouncedCount: bounced,
    failedCount: failed,
    replyCount: replies,
    status,
    completedAt: queued === 0 && scheduled === 0 ? new Date() : null,
  });

  return { sent, scheduled, delivered, bounced, failed, suppressed, queued, replies, status };
};

export const getMarketingOverview = async (req, res) => {
  try {
    const [
      contacts,
      newContacts,
      contacted,
      replied,
      demos,
      campaigns,
      unreadMessages,
      suppressions,
    ] = await Promise.all([
      MarketingContact.countDocuments({ archivedAt: null }),
      MarketingContact.countDocuments({ status: "new", archivedAt: null }),
      MarketingContact.countDocuments({ status: "contacted", archivedAt: null }),
      MarketingContact.countDocuments({ status: "replied", archivedAt: null }),
      MarketingContact.countDocuments({ status: "demo_booked", archivedAt: null }),
      MarketingCampaign.countDocuments(),
      MarketingMessage.countDocuments({ direction: "inbound", readAt: null }),
      MarketingSuppression.countDocuments(),
    ]);

    return res.json({
      success: true,
      overview: { contacts, newContacts, contacted, replied, demos, campaigns, unreadMessages, suppressions },
    });
  } catch (error) {
    return sendError(res, error, "Failed to load marketing overview.");
  }
};

export const listMarketingContacts = async (req, res) => {
  try {
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 25, 1), 100);
    const filter = { archivedAt: null };

    if (req.query.status) filter.status = req.query.status;
    if (req.query.category) filter.category = req.query.category;
    if (req.query.q) {
      const q = [...String(req.query.q).trim()].map((character) => "\\.^$*+?{}()|[]".includes(character) ? "\\" + character : character).join("");
      filter.$or = [
        { schoolName: { $regex: q, $options: "i" } },
        { email: { $regex: q, $options: "i" } },
        { location: { $regex: q, $options: "i" } },
      ];");
      filter.$or = [
        { schoolName: { $regex: q, $options: "i" } },
        { email: { $regex: q, $options: "i" } },
        { location: { $regex: q, $options: "i" } },
      ];
    }

    const [contacts, total, categories] = await Promise.all([
      MarketingContact.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      MarketingContact.countDocuments(filter),
      MarketingContact.distinct("category", { archivedAt: null }),
    ]);

    return res.json({
      success: true,
      contacts,
      categories: categories.filter(Boolean).sort(),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return sendError(res, error, "Failed to load contacts.");
  }
};

export const createMarketingContact = async (req, res) => {
  try {
    const schoolName = String(req.body.schoolName || "").trim();
    const email = normalizeEmail(req.body.email);

    if (!schoolName || !EMAIL_PATTERN.test(email)) {
      return res.status(400).json({ success: false, message: "Enter a school name and a valid email address." });
    }

    const suppression = await MarketingSuppression.findOne({ email }).lean();
    const contact = await MarketingContact.create({
      schoolName,
      email,
      category: req.body.category || "",
      location: req.body.location || "",
      phone: req.body.phone || "",
      notes: req.body.notes || "",
      source: "manual",
      status: suppression ? "unsubscribed" : "new",
    });

    await recordMarketingActivity(req, {
      action: "contact.created",
      description: `Added ${contact.schoolName} to marketing contacts.`,
      contact: contact._id,
    });
    return res.status(201).json({ success: true, message: "Contact added successfully.", contact });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: "A contact with this email address already exists." });
    }
    return sendError(res, error, "Failed to add contact.");
  }
};

export const archiveMarketingContact = async (req, res) => {
  try {
    const contact = await MarketingContact.findOneAndUpdate(
      { _id: req.params.id, archivedAt: null },
      { $set: { archivedAt: new Date() } },
      { new: true }
    );
    if (!contact) return res.status(404).json({ success: false, message: "Contact not found." });
    await recordMarketingActivity(req, {
      action: "contact.archived",
      description: `Archived ${contact.schoolName} from active marketing contacts.`,
      contact: contact._id,
    });
    return res.json({ success: true, message: "Contact archived successfully." });
  } catch (error) {
    return sendError(res, error, "Failed to archive contact.");
  }
};

export const updateMarketingContact = async (req, res) => {
  try {
    const allowed = ["schoolName", "category", "location", "phone", "status", "notes", "nextFollowUpAt"];
    const updates = {};
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    if (updates.status === "unsubscribed") {
      const contact = await MarketingContact.findById(req.params.id);
      if (!contact) return res.status(404).json({ success: false, message: "Contact not found." });
      await MarketingSuppression.updateOne(
        { email: contact.email },
        { $setOnInsert: { email: contact.email, reason: "manual", source: "dashboard" } },
        { upsert: true }
      );
    }

    const contact = await MarketingContact.findOneAndUpdate(
      { _id: req.params.id, archivedAt: null },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!contact) return res.status(404).json({ success: false, message: "Contact not found." });
    await recordMarketingActivity(req, {
      action: "contact.updated",
      description: `Updated contact details for ${contact.schoolName}.`,
      contact: contact._id,
      metadata: { status: contact.status },
    });
    return res.json({ success: true, message: "Contact updated successfully.", contact });
  } catch (error) {
    return sendError(res, error, "Failed to update contact.");
  }
};

const normalizeHeader = (value) =>
  String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");

const pickColumn = (row, aliases) => {
  const entries = Object.entries(row);
  const match = entries.find(([key]) => aliases.includes(normalizeHeader(key)));
  return match ? String(match[1] || "").trim() : "";
};

export const importMarketingContacts = async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ success: false, message: "Choose an Excel or CSV file to import." });
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!firstSheet) {
      return res.status(400).json({ success: false, message: "The uploaded file has no worksheet." });
    }

    const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: "" });
    if (!rows.length) {
      return res.status(400).json({ success: false, message: "The uploaded file contains no contact rows." });
    }
    if (rows.length > 2000) {
      return res.status(400).json({ success: false, message: "A maximum of 2,000 contacts can be imported at a time." });
    }

    const valid = [];
    let invalid = 0;
    const seen = new Set();

    for (const row of rows) {
      const schoolName = pickColumn(row, ["schoolname", "school", "name"]);
      const email = normalizeEmail(pickColumn(row, ["emailaddress", "email", "emailid"]));
      if (!schoolName || !EMAIL_PATTERN.test(email) || seen.has(email)) {
        invalid += 1;
        continue;
      }
      seen.add(email);
      valid.push({
        schoolName,
        email,
        category: pickColumn(row, ["category", "schoolcategory", "type"]),
        location: pickColumn(row, ["locationaddress", "location", "address"]),
        phone: pickColumn(row, ["phone", "phonenumber", "telephone"]),
        source: "import",
      });
    }

    const emails = valid.map((item) => item.email);
    const existing = new Set(
      (await MarketingContact.find({ email: { $in: emails } }).select("email").lean()).map((item) => item.email)
    );
    const suppressed = new Set(
      (await MarketingSuppression.find({ email: { $in: emails } }).select("email").lean()).map((item) => item.email)
    );

    const operations = valid
      .filter((item) => !existing.has(item.email))
      .map((item) => ({
        insertOne: {
          document: {
            ...item,
            status: suppressed.has(item.email) ? "unsubscribed" : "new",
          },
        },
      }));

    if (operations.length) await MarketingContact.bulkWrite(operations, { ordered: false });

    const imported = operations.length;
    await recordMarketingActivity(req, {
      action: "contacts.imported",
      description: `Imported ${imported} marketing contacts; skipped ${valid.length - imported} duplicates and ${invalid} invalid rows.`,
      metadata: { totalRows: rows.length, imported, duplicates: valid.length - imported, invalid },
    });
    return res.status(201).json({
      success: true,
      message: "Contact import completed.",
      summary: {
        totalRows: rows.length,
        imported,
        duplicates: valid.length - imported,
        invalid,
        suppressed: valid.filter((item) => suppressed.has(item.email) && !existing.has(item.email)).length,
      },
    });
  } catch (error) {
    return sendError(res, error, "Failed to import contacts.");
  }
};

export const listMarketingCampaigns = async (req, res) => {
  try {
    const campaigns = await MarketingCampaign.find()
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    return res.json({ success: true, campaigns });
  } catch (error) {
    return sendError(res, error, "Failed to load campaigns.");
  }
};

export const createMarketingCampaign = async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const subject = String(req.body.subject || "").trim();
    const html = String(req.body.html || "").trim();
    const contactIds = Array.isArray(req.body.contactIds) ? [...new Set(req.body.contactIds)] : [];

    if (!name || !subject || !html || !contactIds.length) {
      return res.status(400).json({
        success: false,
        message: "Campaign name, subject, email content and at least one contact are required.",
      });
    }

    const contacts = await MarketingContact.find({
      _id: { $in: contactIds },
      archivedAt: null,
      status: { $nin: ["unsubscribed", "not_interested", "bounced"] },
    }).lean();

    if (!contacts.length) {
      return res.status(400).json({ success: false, message: "No eligible contacts were selected." });
    }

    const suppressed = new Set(
      (await MarketingSuppression.find({ email: { $in: contacts.map((item) => item.email) } }).select("email").lean())
        .map((item) => item.email)
    );
    const eligible = contacts.filter((contact) => !suppressed.has(contact.email));
    if (!eligible.length) {
      return res.status(400).json({ success: false, message: "All selected contacts are on the suppression list." });
    }

    const campaign = await MarketingCampaign.create({
      name,
      subject,
      html,
      text: String(req.body.text || htmlToText(html)),
      recipientCount: eligible.length,
      queuedCount: eligible.length,
      createdBy: req.user._id,
    });

    await MarketingCampaignRecipient.insertMany(
      eligible.map((contact) => ({
        campaign: campaign._id,
        contact: contact._id,
        email: contact.email,
        schoolName: contact.schoolName,
      }))
    );

    await recordMarketingActivity(req, {
      action: "campaign.created",
      description: `Created campaign "${campaign.name}" for ${eligible.length} contacts.`,
      campaign: campaign._id,
      metadata: { recipientCount: eligible.length },
    });
    return res.status(201).json({
      success: true,
      message: "Campaign draft created successfully.",
      campaign,
    });
  } catch (error) {
    return sendError(res, error, "Failed to create campaign.");
  }
};

export const getMarketingCampaign = async (req, res) => {
  try {
    const campaign = await MarketingCampaign.findById(req.params.id).lean();
    if (!campaign) return res.status(404).json({ success: false, message: "Campaign not found." });

    const recipients = await MarketingCampaignRecipient.find({ campaign: campaign._id })
      .sort({ createdAt: 1 })
      .lean();

    return res.json({ success: true, campaign, recipients });
  } catch (error) {
    return sendError(res, error, "Failed to load campaign.");
  }
};

export const sendMarketingCampaignBatch = async (req, res) => {
  try {
    if (req.body.confirmSend !== true) {
      return res.status(400).json({ success: false, message: "Confirm the campaign send before continuing." });
    }

    const campaign = await MarketingCampaign.findOneAndUpdate(
      { _id: req.params.id, status: { $nin: ["sent", "sending"] } },
      { $set: { status: "sending", startedAt: new Date() } },
      { new: true }
    );
    if (!campaign) {
      const existing = await MarketingCampaign.findById(req.params.id).select("status").lean();
      if (!existing) return res.status(404).json({ success: false, message: "Campaign not found." });
      return res.status(409).json({ success: false, message: "This campaign is already being sent or has been completed." });
    }

    const queued = await MarketingCampaignRecipient.find({
      campaign: campaign._id,
      status: { $in: ["queued", "failed"] },
    })
      .sort({ createdAt: 1 })
      .limit(10)
      .populate("contact", "schoolName email status archivedAt")
      .lean();

    if (!queued.length) {
      const counts = await refreshCampaignCounts(campaign._id);
      return res.json({ success: true, message: "There are no queued recipients remaining.", counts });
    }

    const emails = queued.map((recipient) => recipient.email);
    const suppressions = new Set(
      (await MarketingSuppression.find({ email: { $in: emails } }).select("email").lean()).map((item) => item.email)
    );
    const eligible = queued.filter(
      (recipient) =>
        recipient.contact &&
        !recipient.contact.archivedAt &&
        !suppressions.has(recipient.email) &&
        !["unsubscribed", "not_interested", "bounced"].includes(recipient.contact.status)
    );

    const blocked = queued.filter((recipient) => !eligible.some((item) => String(item._id) === String(recipient._id)));
    if (blocked.length) {
      await MarketingCampaignRecipient.updateMany(
        { _id: { $in: blocked.map((item) => item._id) } },
        { $set: { status: "suppressed", error: "Recipient is suppressed or no longer eligible." } }
      );
    }

    if (!eligible.length) {
      const counts = await refreshCampaignCounts(campaign._id);
      return res.json({ success: true, message: "No eligible recipients in this batch.", counts });
    }

    const from = process.env.MARKETING_FROM_EMAIL || "SchoolPilot <hello@school-pilot.app>";
    const replyTo = process.env.MARKETING_REPLY_TO_EMAIL || "hello@school-pilot.app";
    const payload = eligible.map((recipient) => {
      const contact = recipient.contact || { schoolName: recipient.schoolName, email: recipient.email };
      const personalizedHtml = personalizeCampaignHtml(campaign.html, contact);
      const unsubscribeUrl = personalizedHtml.match(/href="([^"]+)"[^>]*>Unsubscribe/i)?.[1] || "";
      return {
        from,
        to: [recipient.email],
        subject: campaign.subject.replace(/{{\s*schoolName\s*}}/gi, () => contact.schoolName || "there"),
        html: personalizedHtml,
        text: `${(campaign.text || htmlToText(campaign.html)).replace(/{{\s*schoolName\s*}}/gi, () => contact.schoolName || "there").replace(/{{\s*email\s*}}/gi, () => contact.email || "")}\n\nUnsubscribe: ${unsubscribeUrl}`,
        reply_to: replyTo,
        headers: unsubscribeUrl
          ? { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
          : undefined,
      };
    });

    try {
      const result = await resendRequest("/emails/batch", {
        method: "POST",
        headers: { "Idempotency-Key": `schoolpilot-campaign-${campaign._id}-${queued[0]._id}` },
        body: JSON.stringify(payload),
      });

      const sentData = Array.isArray(result.data) ? result.data : [];
      for (let index = 0; index < eligible.length; index += 1) {
        const recipient = eligible[index];
        const sentItem = sentData[index] || {};
        const emailId = sentItem.id || "";
        await MarketingCampaignRecipient.updateOne(
          { _id: recipient._id },
          {
            $set: {
              status: emailId ? "sent" : "failed",
              resendEmailId: emailId,
              error: emailId ? "" : (sentItem.message || "Resend did not return an email ID."),
              sentAt: emailId ? new Date() : null,
            },
          }
        );
        if (emailId && recipient.contact?._id) {
          await MarketingContact.updateOne(
            { _id: recipient.contact._id, status: "new" },
            { $set: { status: "contacted", lastContactedAt: new Date() } }
          );
        }
      }
    } catch (sendError) {
      await MarketingCampaignRecipient.updateMany(
        { _id: { $in: eligible.map((item) => item._id) } },
        { $set: { status: "failed", error: sendError.message || "Resend batch failed." } }
      );
    }

    const counts = await refreshCampaignCounts(campaign._id);
    await recordMarketingActivity(req, {
      action: "campaign.batch_sent",
      description: `Processed a campaign batch for "${campaign.name}": ${eligible.length} attempted, ${counts.failed} failed so far.`,
      campaign: campaign._id,
      metadata: { batchSize: eligible.length, counts },
    });
    return res.json({
      success: true,
      message: counts.queued > 0
        ? "Batch processed. Continue sending to reach the remaining recipients."
        : "Campaign sending batch completed.",
      counts,
      batchSize: eligible.length,
    });
  } catch (error) {
    await MarketingCampaign.updateOne(
      { _id: req.params.id, status: "sending" },
      { $set: { status: "partial" } }
    ).catch(() => {});
    return sendError(res, error, "Failed to send campaign batch.");
  }
};

export const scheduleMarketingCampaignBatch = async (req, res) => {
  try {
    if (req.body.confirmSchedule !== true) {
      return res.status(400).json({ success: false, message: "Confirm the campaign schedule before continuing." });
    }

    const scheduledAt = new Date(req.body.scheduledAt);
    const now = Date.now();
    if (!req.body.scheduledAt || Number.isNaN(scheduledAt.getTime())) {
      return res.status(400).json({ success: false, message: "Choose a valid scheduled date and time." });
    }
    if (scheduledAt.getTime() < now + 5 * 60 * 1000) {
      return res.status(400).json({ success: false, message: "Schedule the email at least five minutes in the future." });
    }
    if (scheduledAt.getTime() > now + 72 * 60 * 60 * 1000) {
      return res.status(400).json({ success: false, message: "Resend supports scheduled emails up to 72 hours ahead." });
    }

    const campaign = await MarketingCampaign.findOneAndUpdate(
      { _id: req.params.id, status: { $nin: ["sent", "sending"] } },
      { $set: { status: "sending", scheduledAt } },
      { new: true }
    );
    if (!campaign) {
      const existing = await MarketingCampaign.findById(req.params.id).select("status").lean();
      if (!existing) return res.status(404).json({ success: false, message: "Campaign not found." });
      return res.status(409).json({ success: false, message: "This campaign is already being sent or has been completed." });
    }

    const batch = await MarketingCampaignRecipient.find({
      campaign: campaign._id,
      status: { $in: ["queued", "failed"] },
    })
      .sort({ createdAt: 1 })
      .limit(10)
      .populate("contact", "schoolName email status archivedAt")
      .lean();

    if (!batch.length) {
      const counts = await refreshCampaignCounts(campaign._id);
      return res.json({ success: true, message: "There are no remaining recipients to schedule.", counts });
    }

    const emails = batch.map((recipient) => recipient.email);
    const suppressions = new Set(
      (await MarketingSuppression.find({ email: { $in: emails } }).select("email").lean()).map((item) => item.email)
    );
    const eligible = batch.filter((recipient) =>
      recipient.contact &&
      !recipient.contact.archivedAt &&
      !suppressions.has(recipient.email) &&
      !["unsubscribed", "not_interested", "bounced"].includes(recipient.contact.status)
    );
    const blocked = batch.filter((recipient) =>
      !eligible.some((item) => String(item._id) === String(recipient._id))
    );

    if (blocked.length) {
      await MarketingCampaignRecipient.updateMany(
        { _id: { $in: blocked.map((item) => item._id) } },
        { $set: { status: "suppressed", error: "Recipient is suppressed or no longer eligible." } }
      );
    }

    const from = process.env.MARKETING_FROM_EMAIL || "SchoolPilot <hello@school-pilot.app>";
    const replyTo = process.env.MARKETING_REPLY_TO_EMAIL || "hello@school-pilot.app";
    const results = [];

    for (const recipient of eligible) {
      const contact = recipient.contact;
      const personalizedHtml = personalizeCampaignHtml(campaign.html, contact);
      const unsubscribeUrl = personalizedHtml.match(/href="([^"]+)"[^>]*>Unsubscribe/i)?.[1] || "";
      try {
        const result = await resendRequest("/emails", {
          method: "POST",
          headers: { "Idempotency-Key": `schoolpilot-scheduled-${campaign._id}-${recipient._id}` },
          body: JSON.stringify({
            from,
            to: [recipient.email],
            subject: campaign.subject.replace(/{{\s*schoolName\s*}}/gi, () => contact.schoolName || "there"),
            html: personalizedHtml,
            text: `${(campaign.text || htmlToText(campaign.html)).replace(/{{\s*schoolName\s*}}/gi, () => contact.schoolName || "there").replace(/{{\s*email\s*}}/gi, () => contact.email || "")}\n\nUnsubscribe: ${unsubscribeUrl}`,
            reply_to: replyTo,
            scheduled_at: scheduledAt.toISOString(),
            headers: unsubscribeUrl
              ? { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
              : undefined,
          }),
        });

        await MarketingCampaignRecipient.updateOne(
          { _id: recipient._id },
          {
            $set: {
              status: "scheduled",
              resendEmailId: result.id || "",
              scheduledAt,
              error: result.id ? "" : "Resend did not return an email ID.",
            },
          }
        );
        results.push({ email: recipient.email, scheduled: Boolean(result.id) });
      } catch (error) {
        await MarketingCampaignRecipient.updateOne(
          { _id: recipient._id },
          { $set: { status: "failed", error: error.message || "Scheduling failed." } }
        );
        results.push({ email: recipient.email, scheduled: false });
      }

      // Resend's single-email endpoint is rate limited; keep scheduled sends paced.
      await new Promise((resolve) => setTimeout(resolve, 550));
    }

    const counts = await refreshCampaignCounts(campaign._id);
    await recordMarketingActivity(req, {
      action: "campaign.batch_scheduled",
      description: `Scheduled ${results.filter((item) => item.scheduled).length} emails for "${campaign.name}".`,
      campaign: campaign._id,
      metadata: { scheduledAt, results },
    });

    return res.json({
      success: true,
      message: `Scheduled ${results.filter((item) => item.scheduled).length} emails. Each scheduling action handles up to 10 recipients.`,
      counts,
      batchSize: batch.length,
    });
  } catch (error) {
    await MarketingCampaign.updateOne(
      { _id: req.params.id, status: "sending" },
      { $set: { status: "partial" } }
    ).catch(() => {});
    return sendError(res, error, "Failed to schedule campaign batch.");
  }
};

export const cancelScheduledMarketingCampaignBatch = async (req, res) => {
  try {
    if (req.body.confirmCancel !== true) {
      return res.status(400).json({ success: false, message: "Confirm cancellation before continuing." });
    }

    const campaign = await MarketingCampaign.findOneAndUpdate(
      { _id: req.params.id, status: { $nin: ["sent", "sending"] } },
      { $set: { status: "sending" } },
      { new: true }
    );
    if (!campaign) {
      const existing = await MarketingCampaign.findById(req.params.id).select("status").lean();
      if (!existing) return res.status(404).json({ success: false, message: "Campaign not found." });
      return res.status(409).json({ success: false, message: "This campaign cannot be changed while it is being processed or after completion." });
    }

    const scheduled = await MarketingCampaignRecipient.find({
      campaign: campaign._id,
      status: "scheduled",
    })
      .sort({ scheduledAt: 1 })
      .limit(10)
      .lean();

    const results = [];
    for (const recipient of scheduled) {
      try {
        if (!recipient.resendEmailId) throw new Error("Scheduled email ID is missing.");
        await resendRequest(`/emails/${encodeURIComponent(recipient.resendEmailId)}/cancel`, { method: "POST" });
        await MarketingCampaignRecipient.updateOne(
          { _id: recipient._id, status: "scheduled" },
          {
            $set: { status: "queued", scheduledAt: null, error: "" },
            $unset: { resendEmailId: 1 },
          }
        );
        results.push({ email: recipient.email, cancelled: true });
      } catch (error) {
        await MarketingCampaignRecipient.updateOne(
          { _id: recipient._id },
          { $set: { error: error.message || "Could not cancel scheduled email." } }
        );
        results.push({ email: recipient.email, cancelled: false });
      }
      await new Promise((resolve) => setTimeout(resolve, 550));
    }

    const counts = await refreshCampaignCounts(campaign._id);
    const latestScheduledRecipient = await MarketingCampaignRecipient.findOne({
      campaign: campaign._id,
      status: "scheduled",
    }).sort({ scheduledAt: -1 }).select("scheduledAt").lean();
    await MarketingCampaign.updateOne(
      { _id: campaign._id },
      { $set: { scheduledAt: latestScheduledRecipient?.scheduledAt || null } }
    );
    await recordMarketingActivity(req, {
      action: "campaign.scheduled_batch_cancelled",
      description: `Cancelled ${results.filter((item) => item.cancelled).length} scheduled emails for "${campaign.name}".`,
      campaign: campaign._id,
      metadata: { results },
    });

    return res.json({
      success: true,
      message: `Cancelled ${results.filter((item) => item.cancelled).length} scheduled emails. Up to 10 are handled per action.`,
      counts,
    });
  } catch (error) {
    await MarketingCampaign.updateOne(
      { _id: req.params.id, status: "sending" },
      { $set: { status: "partial" } }
    ).catch(() => {});
    return sendError(res, error, "Failed to cancel scheduled emails.");
  }
};

export const listMarketingInbox = async (req, res) => {
  try {
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 25, 1), 100);
    const filter = { direction: "inbound" };
    if (req.query.unread === "true") filter.readAt = null;

    const [messages, total] = await Promise.all([
      MarketingMessage.find(filter)
        .populate("contact", "schoolName email")
        .populate("campaign", "name subject")
        .sort({ receivedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      MarketingMessage.countDocuments(filter),
    ]);

    return res.json({ success: true, messages, pagination: { page, limit, total } });
  } catch (error) {
    return sendError(res, error, "Failed to load the reply inbox.");
  }
};

export const getMarketingInboxMessage = async (req, res) => {
  try {
    const message = await MarketingMessage.findById(req.params.id)
      .populate("contact", "schoolName email phone")
      .populate("campaign", "name subject")
      .lean();

    if (!message || message.direction !== "inbound") {
      return res.status(404).json({ success: false, message: "Message not found." });
    }

    if (!message.readAt) {
      await MarketingMessage.updateOne({ _id: message._id }, { $set: { readAt: new Date() } });
      message.readAt = new Date();
    }

    return res.json({ success: true, message });
  } catch (error) {
    return sendError(res, error, "Failed to load the message.");
  }
};

export const replyToMarketingMessage = async (req, res) => {
  try {
    const message = await MarketingMessage.findById(req.params.id);
    if (!message || message.direction !== "inbound") {
      return res.status(404).json({ success: false, message: "Message not found." });
    }

    const text = String(req.body.text || "").trim();
    if (!text) return res.status(400).json({ success: false, message: "Enter a reply before sending." });

    const recipient = extractEmail(message.from);
    if (!EMAIL_PATTERN.test(recipient)) {
      return res.status(400).json({ success: false, message: "The sender address is invalid." });
    }

    const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;white-space:pre-wrap">${escapeHtml(text)}</div>`;
    const headers = {};
    if (message.messageId) headers["In-Reply-To"] = message.messageId;
    if (message.references || message.messageId) {
      headers.References = [message.references, message.messageId].filter(Boolean).join(" ");
    }

    const result = await resendRequest("/emails", {
      method: "POST",
      body: JSON.stringify({
        from: process.env.MARKETING_FROM_EMAIL || "SchoolPilot <hello@school-pilot.app>",
        to: [recipient],
        reply_to: process.env.MARKETING_REPLY_TO_EMAIL || "hello@school-pilot.app",
        subject: /^re:/i.test(message.subject) ? message.subject : `Re: ${message.subject || "Your message to SchoolPilot"}`,
        text,
        html,
        headers: Object.keys(headers).length ? headers : undefined,
      }),
    });

    const outboundMessage = await MarketingMessage.create({
      direction: "outbound",
      resendEmailId: result.id || "",
      contact: message.contact,
      campaign: message.campaign,
      from: process.env.MARKETING_FROM_EMAIL || "hello@school-pilot.app",
      to: [recipient],
      subject: /^re:/i.test(message.subject) ? message.subject : `Re: ${message.subject || "Your message to SchoolPilot"}`,
      text,
      html,
      inReplyTo: message.messageId,
      references: headers.References || "",
      receivedAt: new Date(),
    });

    await recordMarketingActivity(req, {
      action: "inbox.reply_sent",
      description: `Replied to ${recipient} from the SchoolPilot marketing inbox.`,
      contact: message.contact,
      campaign: message.campaign,
      message: outboundMessage._id,
    });
    return res.json({ success: true, message: "Reply sent successfully." });
  } catch (error) {
    return sendError(res, error, "Failed to send the reply.");
  }
};

export const listMarketingActivities = async (req, res) => {
  try {
    const activities = await MarketingActivity.find()
      .populate("actor", "name email")
      .populate("contact", "schoolName email")
      .populate("campaign", "name subject")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    return res.json({ success: true, activities });
  } catch (error) {
    return sendError(res, error, "Failed to load marketing activity history.");
  }
};

export const listMarketingSuppressions = async (req, res) => {
  try {
    const suppressions = await MarketingSuppression.find().sort({ createdAt: -1 }).limit(500).lean();
    return res.json({ success: true, suppressions });
  } catch (error) {
    return sendError(res, error, "Failed to load the suppression list.");
  }
};

export const unsubscribeMarketingEmail = async (req, res) => {
  try {
    const { readUnsubscribeToken } = await import("../utils/marketingEmail.js");
    const email = readUnsubscribeToken(req.params.token);
    if (!email || !EMAIL_PATTERN.test(email)) {
      return res.status(400).send("This unsubscribe link is invalid or has expired.");
    }

    if (req.method === "GET") {
      return res.status(200).send(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe from SchoolPilot</title></head><body style="font-family:Arial,sans-serif;background:#f8fafc;padding:48px 20px;color:#0f172a"><main style="max-width:520px;margin:auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:32px;text-align:center"><h1 style="margin-top:0">Unsubscribe from SchoolPilot emails?</h1><p style="color:#475569">Confirm below if you no longer want to receive SchoolPilot outreach emails at this address.</p><form method="POST" action="/api/marketing/unsubscribe/${encodeURIComponent(req.params.token)}"><button type="submit" style="margin-top:16px;border:0;border-radius:10px;background:#047857;color:#fff;padding:12px 20px;font-weight:600;cursor:pointer">Confirm unsubscribe</button></form></main></body></html>`);
    }

    await MarketingSuppression.updateOne(
      { email },
      { $setOnInsert: { email, reason: "unsubscribed", source: "email-link" } },
      { upsert: true }
    );
    await MarketingContact.updateOne({ email }, { $set: { status: "unsubscribed" } });
    await recordMarketingActivity(null, {
      action: "contact.unsubscribed",
      description: `A contact unsubscribed from SchoolPilot marketing emails (${email}).`,
      metadata: { email },
    });

    return res.status(200).send(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribed</title></head><body style="font-family:Arial,sans-serif;background:#f8fafc;padding:48px 20px;color:#0f172a"><main style="max-width:520px;margin:auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:32px;text-align:center"><h1 style="margin-top:0">You are unsubscribed</h1><p style="color:#475569">We will no longer send SchoolPilot marketing emails to this address.</p></main></body></html>`);
  } catch (error) {
    return res.status(500).send("We could not process your unsubscribe request. Please try again.");
  }
};

export const handleResendMarketingWebhook = async (req, res) => {
  try {
    if (!process.env.RESEND_WEBHOOK_SECRET) {
      return res.status(503).json({ success: false, message: "Webhook verification is not configured." });
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body || "");
    if (!verifyResendWebhookSignature(rawBody, req.headers, process.env.RESEND_WEBHOOK_SECRET)) {
      return res.status(400).json({ success: false, message: "Invalid webhook signature." });
    }

    const event = JSON.parse(rawBody);
    const eventId = String(req.headers["svix-id"] || "");
    const data = event.data || {};

    if (event.type === "email.received" && data.email_id) {
      const inboundResult = await resendRequest(`/emails/receiving/${encodeURIComponent(data.email_id)}`);
      const inbound = inboundResult.data || inboundResult;
      const sender = extractEmail(inbound.from || data.from);
      const contact = await MarketingContact.findOne({ email: sender });
      const recentRecipient = contact
        ? await MarketingCampaignRecipient.findOne({
            contact: contact._id,
            status: { $in: ["sent", "delivered"] },
          }).sort({ sentAt: -1 }).populate("campaign", "_id").lean()
        : null;

      const headers = inbound.headers || {};
      const messageId = getHeader(headers, "message-id") || data.message_id || "";
      const inReplyTo = getHeader(headers, "in-reply-to");
      const references = getHeader(headers, "references");

      await MarketingMessage.updateOne(
        { resendEmailId: data.email_id },
        {
          $setOnInsert: {
            direction: "inbound",
            resendEmailId: data.email_id,
            contact: contact?._id || null,
            campaign: recentRecipient?.campaign?._id || null,
            from: inbound.from || data.from || sender,
            to: inbound.to || data.to || [],
            subject: inbound.subject || data.subject || "(No subject)",
            text: inbound.text || "",
            html: inbound.html || "",
            messageId,
            inReplyTo,
            references,
            receivedAt: inbound.created_at ? new Date(inbound.created_at) : new Date(),
            attachments: inbound.attachments || data.attachments || [],
          },
        },
        { upsert: true }
      );

      if (contact) await MarketingContact.updateOne({ _id: contact._id }, { $set: { status: "replied" } });
      if (recentRecipient?.campaign?._id) await refreshCampaignCounts(recentRecipient.campaign._id);
    }

    if (["email.sent", "email.delivered", "email.bounced", "email.complained"].includes(event.type) && data.email_id) {
      const recipient = await MarketingCampaignRecipient.findOne({ resendEmailId: data.email_id });
      if (recipient) {
        const nextStatus = event.type === "email.sent"
          ? "sent"
          : event.type === "email.delivered"
            ? "delivered"
            : event.type === "email.complained" ? "complained" : "bounced";
        const allowedCurrentStatuses = nextStatus === "sent"
          ? ["scheduled"]
          : nextStatus === "delivered"
            ? ["sent", "scheduled"]
            : ["sent", "scheduled", "delivered"];

        const recipientUpdate = await MarketingCampaignRecipient.updateOne(
          { _id: recipient._id, status: { $in: allowedCurrentStatuses } },
          {
            $set: {
              status: nextStatus,
              ...(nextStatus === "sent" ? { sentAt: new Date() } : {}),
              ...(nextStatus === "delivered" ? { deliveredAt: new Date() } : {}),
            },
          }
        );

        if (nextStatus === "sent" && recipientUpdate.modifiedCount > 0) {
          await MarketingContact.updateOne(
            { email: recipient.email, status: "new" },
            { $set: { status: "contacted", lastContactedAt: new Date() } }
          );
        }

        if (nextStatus === "bounced" || nextStatus === "complained") {
          await MarketingSuppression.updateOne(
            { email: recipient.email },
            {
              $setOnInsert: {
                email: recipient.email,
                reason: nextStatus === "bounced" ? "bounced" : "complaint",
                source: "resend-webhook",
              },
            },
            { upsert: true }
          );
          await MarketingContact.updateOne(
            { email: recipient.email },
            { $set: { status: "bounced" } }
          );
        }
        await refreshCampaignCounts(recipient.campaign);
      }
    }

    // Persist only after successful processing so a transient failure can be retried by Resend.
    if (eventId) {
      try {
        await MarketingWebhookEvent.create({ eventId, eventType: event.type });
      } catch (persistError) {
        if (persistError.code === 11000) return res.status(200).json({ received: true, duplicate: true });
        throw persistError;
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Webhook processing failed." });
  }
};
