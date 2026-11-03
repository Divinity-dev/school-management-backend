import mongoose from "mongoose";

const marketingMessageSchema = new mongoose.Schema(
  {
    direction: { type: String, enum: ["inbound", "outbound"], required: true, index: true },
    // Leave this field absent when Resend has not supplied an ID. A sparse unique
    // index excludes missing values, but it still indexes empty strings.
    resendEmailId: { type: String, default: undefined },
    contact: { type: mongoose.Schema.Types.ObjectId, ref: "MarketingContact", default: null, index: true },
    campaign: { type: mongoose.Schema.Types.ObjectId, ref: "MarketingCampaign", default: null, index: true },
    from: { type: String, required: true },
    to: { type: [String], default: [] },
    subject: { type: String, default: "" },
    text: { type: String, default: "" },
    html: { type: String, default: "" },
    messageId: { type: String, default: "" },
    inReplyTo: { type: String, default: "" },
    references: { type: String, default: "" },
    receivedAt: { type: Date, default: Date.now, index: true },
    readAt: { type: Date, default: null },
    attachments: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { timestamps: true }
);

marketingMessageSchema.index({ resendEmailId: 1 }, { unique: true, sparse: true });
marketingMessageSchema.index({ contact: 1, receivedAt: -1 });

export default mongoose.model("MarketingMessage", marketingMessageSchema);
