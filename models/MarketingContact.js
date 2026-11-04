import mongoose from "mongoose";

const marketingContactSchema = new mongoose.Schema(
  {
    schoolName: { type: String, required: true, trim: true },
    category: { type: String, trim: true, default: "" },
    location: { type: String, trim: true, default: "" },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, trim: true, default: "" },
    deliveryStatus: {
      type: String,
      enum: ["unverified", "sent", "delivered", "bounced", "complained", "failed", "suppressed"],
      default: "unverified",
      index: true,
    },
    lastBounceReason: { type: String, trim: true, default: "" },
    lastDeliveryAt: { type: Date, default: null },
    emailHistory: [{
      email: { type: String, lowercase: true, trim: true },
      changedAt: { type: Date, default: Date.now },
    }],
    status: {
      type: String,
      enum: ["new", "contacted", "replied", "demo_booked", "not_interested", "unsubscribed", "bounced", "complained", "suppressed"],
      default: "new",
      index: true,
    },
    source: { type: String, trim: true, default: "manual" },
    notes: { type: String, trim: true, default: "" },
    lastContactedAt: { type: Date, default: null },
    nextFollowUpAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

marketingContactSchema.index({ email: 1 }, { unique: true });
marketingContactSchema.index({ schoolName: "text", email: "text", location: "text" });

export default mongoose.model("MarketingContact", marketingContactSchema);
