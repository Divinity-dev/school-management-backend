import mongoose from "mongoose";

const marketingCampaignRecipientSchema = new mongoose.Schema(
  {
    campaign: { type: mongoose.Schema.Types.ObjectId, ref: "MarketingCampaign", required: true, index: true },
    contact: { type: mongoose.Schema.Types.ObjectId, ref: "MarketingContact", required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    schoolName: { type: String, default: "" },
    status: {
      type: String,
      enum: ["queued", "scheduled", "sent", "delivered", "bounced", "complained", "failed", "suppressed"],
      default: "queued",
      index: true,
    },
    resendEmailId: { type: String, default: "", index: true },
    error: { type: String, default: "" },
    scheduledAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
  },
  { timestamps: true }
);

marketingCampaignRecipientSchema.index({ campaign: 1, contact: 1 }, { unique: true });
marketingCampaignRecipientSchema.index({ email: 1, createdAt: -1 });

export default mongoose.model("MarketingCampaignRecipient", marketingCampaignRecipientSchema);
