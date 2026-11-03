import mongoose from "mongoose";

const marketingActivitySchema = new mongoose.Schema(
  {
    action: { type: String, required: true, trim: true, index: true },
    description: { type: String, required: true, trim: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    contact: { type: mongoose.Schema.Types.ObjectId, ref: "MarketingContact", default: null },
    campaign: { type: mongoose.Schema.Types.ObjectId, ref: "MarketingCampaign", default: null },
    message: { type: mongoose.Schema.Types.ObjectId, ref: "MarketingMessage", default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

marketingActivitySchema.index({ createdAt: -1 });

export default mongoose.model("MarketingActivity", marketingActivitySchema);
