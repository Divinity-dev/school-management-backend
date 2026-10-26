import { randomBytes, timingSafeEqual } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import School from "../models/School.js";

const normalizeDomain = (value) => {
  if (typeof value !== "string") return "";
  let domain = value.trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "").replace(/\.$/, "");
  return domain;
};

const isValidDomain = (domain) => {
  if (!domain || domain.length > 253 || domain.includes("..")) return false;
  if (domain === "school-pilot.app" || domain.endsWith(".school-pilot.app")) return false;
  const labels = domain.split(".");
  return labels.length >= 2 && labels.every((label) =>
    label.length >= 1 &&
    label.length <= 63 &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
  );
};

export const setCustomSchoolDomain = async (req, res) => {
  try {
    if (!req.user?.school) {
      return res.status(400).json({ message: "No school associated with this account." });
    }

    const domain = normalizeDomain(req.body?.domain);
    if (!isValidDomain(domain)) {
      return res.status(400).json({
        message: "Enter a valid domain such as brightfutureacademy.com. Do not include a path.",
      });
    }

    const existing = await School.findOne({
      _id: { $ne: req.user.school },
      "website.customDomain": domain,
    }).select("_id");

    if (existing) {
      return res.status(409).json({ message: "This domain is already assigned to another school." });
    }

    const school = await School.findById(req.user.school).select("+website.customDomainVerificationToken");
    if (!school) return res.status(404).json({ message: "School not found." });

    const token = `schoolpilot-verification=${randomBytes(24).toString("hex")}`;
    school.website.customDomain = domain;
    school.website.customDomainVerified = false;
    school.website.customDomainVerificationToken = token;
    await school.save();

    return res.status(200).json({
      message: "Domain saved. Add the DNS TXT record below, then verify ownership.",
      domain,
      verified: false,
      dns: {
        type: "TXT",
        name: `_schoolpilot-verification.${domain}`,
        value: token,
      },
      note: "After verification, add this domain to the SchoolPilot frontend hosting project and point its DNS records to the target provided by your host.",
    });
  } catch (error) {
    console.error("Set custom school domain error:", error);
    return res.status(500).json({ message: "Could not save custom domain." });
  }
};

export const verifyCustomSchoolDomain = async (req, res) => {
  try {
    if (!req.user?.school) {
      return res.status(400).json({ message: "No school associated with this account." });
    }

    const school = await School.findById(req.user.school).select("+website.customDomainVerificationToken");
    if (!school) return res.status(404).json({ message: "School not found." });
    const domain = normalizeDomain(school.website?.customDomain);
    const token = school.website?.customDomainVerificationToken;

    if (!domain || !token) {
      return res.status(400).json({ message: "Save a custom domain before verifying it." });
    }

    let records;
    try {
      records = await resolveTxt(`_schoolpilot-verification.${domain}`);
    } catch {
      return res.status(400).json({
        message: "The verification TXT record was not found yet. Check the record name and value, then try again after DNS propagation.",
      });
    }

    const found = records.flat().some((record) => {
      const a = Buffer.from(record);
      const b = Buffer.from(token);
      return a.length === b.length && timingSafeEqual(a, b);
    });

    if (!found) {
      return res.status(400).json({
        message: "The DNS TXT record does not match the verification token. Check the record and try again.",
      });
    }

    school.website.customDomainVerified = true;
    await school.save();

    return res.status(200).json({
      message: "Domain ownership verified successfully.",
      domain,
      verified: true,
    });
  } catch (error) {
    console.error("Verify custom school domain error:", error);
    return res.status(500).json({ message: "Could not verify custom domain." });
  }
};

export const resolveCustomSchoolDomain = async (req, res) => {
  try {
    const domain = normalizeDomain(req.query.domain);
    if (!isValidDomain(domain)) {
      return res.status(400).json({ message: "A valid domain query parameter is required." });
    }

    const school = await School.findOne({
      "website.customDomain": domain,
      "website.customDomainVerified": true,
      "website.enabled": true,
      isActive: true,
    }).select("name slug website.customDomain");

    if (!school) return res.status(404).json({ message: "No active school website is mapped to this domain." });

    res.set("Cache-Control", "public, max-age=60, s-maxage=60");
    return res.status(200).json({
      school: { name: school.name, slug: school.slug, domain },
    });
  } catch (error) {
    console.error("Resolve custom school domain error:", error);
    return res.status(500).json({ message: "Could not resolve custom domain." });
  }
};
