import mongoose from "mongoose";

const marketingCampaignSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    subject: { type: String, required: true, trim: true },
    html: { type: String, required: true },
    text: { type: String, default: "" },
    status: {
      type: String,
      enum: ["draft", "sending", "scheduled", "sent", "partial", "failed"],
      default: "draft",
      index: true,
    },
    recipientCount: { type: Number, default: 0 },
    sentCount: { type: Number, default: 0 },
    scheduledCount: { type: Number, default: 0 },
    queuedCount: { type: Number, default: 0 },
    suppressedCount: { type: Number, default: 0 },
    scheduledAt: { type: Date, default: null },
    deliveredCount: { type: Number, default: 0 },
    bouncedCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    replyCount: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("MarketingCampaign", marketingCampaignSchema);
