import crypto from "node:crypto";

export const normalizeEmail = (value = "") => String(value).trim().toLowerCase();

export const extractEmail = (value = "") => {
  const match = String(value).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return normalizeEmail(match?.[0] || value);
};

const getUnsubscribeSecret = () => process.env.MARKETING_UNSUBSCRIBE_SECRET;

export const createUnsubscribeToken = (email) => {
  const secret = getUnsubscribeSecret();
  if (!secret || secret.length < 32) {
    throw new Error("MARKETING_UNSUBSCRIBE_SECRET must be configured with at least 32 characters.");
  }
  const normalized = normalizeEmail(email);
  const encoded = Buffer.from(normalized).toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");

  return `${encoded}.${signature}`;
};

export const readUnsubscribeToken = (token = "") => {
  const [encoded, suppliedSignature] = String(token).split(".");
  const secret = getUnsubscribeSecret();
  if (!encoded || !suppliedSignature || !secret || secret.length < 32) return null;

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");

  const expected = Buffer.from(expectedSignature);
  const supplied = Buffer.from(suppliedSignature);

  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) {
    return null;
  }

  try {
    return normalizeEmail(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
};

export const getUnsubscribeUrl = (email) => {
  const baseUrl = (
    process.env.API_PUBLIC_URL ||
    process.env.BACKEND_URL ||
    "https://school-management-backend-mauve-six.vercel.app"
  ).replace(/\/$/, "");

  return `${baseUrl}/api/marketing/unsubscribe/${createUnsubscribeToken(email)}`;
};

const escapeHtml = (value = "") =>
  String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);

export const personalizeCampaignHtml = (html, contact) => {
  const personalized = String(html || "")
    .replace(/{{\s*schoolName\s*}}/gi, () => escapeHtml(contact.schoolName || "there"))
    .replace(/{{\s*email\s*}}/gi, () => escapeHtml(contact.email || ""));

  const unsubscribeUrl = getUnsubscribeUrl(contact.email);
  return `${personalized}
    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;color:#64748b;font:12px Arial,sans-serif">
      You are receiving this email because SchoolPilot is contacting your school about its services.
      <a href="${unsubscribeUrl}" style="color:#475569">Unsubscribe</a>.
    </div>`;
};

export const htmlToText = (html = "") =>
  String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();

export const resendRequest = async (path, options = {}) => {
  // Receiving endpoints require a Full access key. All send operations use
  // the restricted Sending key so the two permissions remain separated.
  const isReceivingRequest = path.startsWith("/emails/receiving/");
  const apiKey = isReceivingRequest
    ? process.env.RESEND_RECEIVING_API_KEY
    : process.env.RESEND_SENDING_API_KEY;

  if (!apiKey) {
    const variableName = isReceivingRequest
      ? "RESEND_RECEIVING_API_KEY"
      : "RESEND_SENDING_API_KEY";
    throw new Error(`Resend is not configured. Add ${variableName} to the backend environment.`);
  }

  const response = await fetch(`https://api.resend.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.message || payload?.error || "Resend request failed.";
    const error = new Error(message);
    error.status = response.status;
    error.details = payload;
    throw error;
  }

  return payload;
};
