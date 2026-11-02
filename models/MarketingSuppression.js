import mongoose from "mongoose";

const marketingSuppressionSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    reason: { type: String, enum: ["unsubscribed", "bounced", "complaint", "manual", "provider"], default: "manual" },
    source: { type: String, default: "schoolpilot" },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

export default mongoose.model("MarketingSuppression", marketingSuppressionSchema);
