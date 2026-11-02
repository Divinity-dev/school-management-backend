import mongoose from "mongoose";

const marketingWebhookEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true },
    eventType: { type: String, required: true },
    processedAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

export default mongoose.model("MarketingWebhookEvent", marketingWebhookEventSchema);
