import { randomBytes, timingSafeEqual } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import School from "../models/School.js";

const normalizeDomain = (value) => {
  if (typeof value !== "string") return "";
  let domain = value.trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "").replace(/\.$/, "");
  domain = domain.replace(/^www\./, "");
  return domain;
};


const getVercelSettings = () => ({
  token: process.env.VERCEL_TOKEN,
  projectId: process.env.VERCEL_PROJECT_ID || process.env.VERCEL_PROJECT_NAME,
  teamId: process.env.VERCEL_TEAM_ID,
});

const vercelRequest = async (path, options = {}) => {
  const { token, teamId } = getVercelSettings();
  if (!token) throw new Error("Vercel integration is not configured on the SchoolPilot backend.");

  const url = new URL(path, "https://api.vercel.com");
  if (teamId) url.searchParams.set("teamId", teamId);

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detail = body?.error?.message || body?.message;
    const error = new Error(detail || `Vercel API request failed (${response.status}).`);
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return body;
};

const getVercelDomainConfig = async (domain) => {
  const { projectId } = getVercelSettings();
  const url = new URL(
    `https://api.vercel.com/v6/domains/${encodeURIComponent(domain)}/config`
  );
  url.searchParams.set("projectIdOrName", projectId);
  const { teamId, token } = getVercelSettings();
  if (teamId) url.searchParams.set("teamId", teamId);

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      body?.error?.message || body?.message || `Could not inspect DNS for ${domain}.`
    );
    error.status = response.status;
    throw error;
  }
  return body;
};

const recordValue = (record) => {
  if (typeof record === "string") return record;
  return record?.value || record?.address || record?.target || record?.hostname || "";
};

const recordsFromVercelConfig = (domain, config, isWww = false) => {
  const records = [];
  const ipv4 = config?.recommendedIPv4 || config?.recommendedIpv4 || [];
  const cnames = config?.recommendedCNAME || config?.recommendedCname || [];

  for (const item of Array.isArray(ipv4) ? ipv4 : []) {
    const value = recordValue(item);
    if (value) records.push({ type: "A", name: isWww ? "www" : "@", value });
  }
  for (const item of Array.isArray(cnames) ? cnames : []) {
    const value = recordValue(item);
    if (value) records.push({ type: "CNAME", name: isWww ? "www" : "@", value });
  }
  return records;
};

const addDomainToVercelProject = async (domain) => {
  const { projectId } = getVercelSettings();
  if (!projectId) {
    throw new Error("Set VERCEL_PROJECT_ID (or VERCEL_PROJECT_NAME) on the backend before configuring custom domains.");
  }

  try {
    return await vercelRequest(
      `/v10/projects/${encodeURIComponent(projectId)}/domains`,
      { method: "POST", body: JSON.stringify({ name: domain }) }
    );
  } catch (error) {
    // The endpoint returns 400 if this domain is already attached to the project.
    if (error.status === 400) {
      return vercelRequest(
        `/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(domain)}`
      );
    }
    throw error;
  }
};

const configureVercelDomain = async (school) => {
  const { token, projectId } = getVercelSettings();
  if (!token || !projectId) {
    school.website.customDomainHostingStatus = "needs_configuration";
    school.website.customDomainHostingError = "";
    await school.save();
    return {
      status: "needs_configuration",
      configured: false,
      dnsRecords: [],
      message: "Ownership is verified. Add VERCEL_TOKEN and VERCEL_PROJECT_ID to the backend deployment to automate hosting setup.",
    };
  }

  const domain = normalizeDomain(school.website?.customDomain);
  const hosts = [domain, `www.${domain}`];
  const domainResults = [];

  try {
    for (const host of hosts) {
      const projectDomain = await addDomainToVercelProject(host);
      let config = {};
      let configChecked = false;
      try {
        config = await getVercelDomainConfig(host);
        configChecked = true;
      } catch (configError) {
        // Registration may succeed before Vercel exposes configuration details.
        console.warn(`Could not retrieve Vercel DNS config for ${host}:`, configError.message);
      }

      domainResults.push({
        domain: host,
        verified: projectDomain?.verified !== false,
        configChecked,
        misconfigured: Boolean(config?.misconfigured),
        dnsRecords: recordsFromVercelConfig(host, config, host.startsWith("www.")),
        verification: Array.isArray(projectDomain?.verification) ? projectDomain.verification : [],
      });
    }

    const allReady = domainResults.every(
      (item) => item.verified && item.configChecked && !item.misconfigured
    );
    const dnsRecords = domainResults.flatMap((item) => item.dnsRecords);
    const vercelVerification = domainResults.flatMap((item) =>
      item.verification.map((challenge) => ({
        domain: item.domain,
        type: challenge.type || "TXT",
        name: challenge.domain || challenge.name || "",
        value: challenge.value || "",
        reason: challenge.reason || "",
      }))
    );

    school.website.customDomainVercelConfigured = true;
    school.website.customDomainHostingStatus = allReady ? "active" : "pending_dns";
    school.website.customDomainHostingError = "";
    await school.save();

    return {
      status: school.website.customDomainHostingStatus,
      configured: true,
      dnsRecords,
      vercelVerification,
      domains: domainResults.map(({ domain: host, verified, misconfigured }) => ({
        domain: host,
        verified,
        misconfigured,
      })),
      message: allReady
        ? "The domain has been added to Vercel and its DNS configuration looks correct."
        : "The domain has been added to Vercel. Add the DNS records below, then refresh hosting status.",
    };
  } catch (error) {
    school.website.customDomainVercelConfigured = false;
    school.website.customDomainHostingStatus = "failed";
    school.website.customDomainHostingError = error.message;
    await school.save();
    return {
      status: "failed",
      configured: false,
      dnsRecords: [],
      message: error.message,
    };
  }
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
    school.website.customDomainVercelConfigured = false;
    school.website.customDomainHostingStatus = "not_configured";
    school.website.customDomainHostingError = "";
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
      note: "After ownership verification, SchoolPilot will add the domain and its www address to the Vercel project automatically. You will still need to add the DNS records shown by SchoolPilot at your domain provider.",
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

    const hosting = await configureVercelDomain(school);

    return res.status(200).json({
      message: hosting.status === "active"
        ? "Domain ownership verified and hosting configured successfully."
        : "Domain ownership verified. Complete the hosting steps shown below.",
      domain,
      verified: true,
      hosting,
    });
  } catch (error) {
    console.error("Verify custom school domain error:", error);
    return res.status(500).json({ message: "Could not verify custom domain." });
  }
};


export const setupCustomSchoolDomain = async (req, res) => {
  try {
    if (!req.user?.school) {
      return res.status(400).json({ message: "No school associated with this account." });
    }

    const school = await School.findById(req.user.school).select("+website.customDomainVerificationToken");
    if (!school) return res.status(404).json({ message: "School not found." });
    if (!school.website?.customDomain || !school.website?.customDomainVerified) {
      return res.status(400).json({
        message: "Verify domain ownership before configuring hosting.",
        verified: false,
      });
    }

    const hosting = await configureVercelDomain(school);
    return res.status(200).json({
      message: hosting.message,
      domain: normalizeDomain(school.website.customDomain),
      verified: true,
      hosting,
    });
  } catch (error) {
    console.error("Set up custom school domain error:", error);
    return res.status(500).json({ message: "Could not configure custom domain hosting." });
  }
};

export const getCustomSchoolDomainStatus = async (req, res) => {
  try {
    if (!req.user?.school) {
      return res.status(400).json({ message: "No school associated with this account." });
    }

    const school = await School.findById(req.user.school).select("+website.customDomainVerificationToken");
    if (!school) return res.status(404).json({ message: "School not found." });

    const domain = normalizeDomain(school.website?.customDomain);
    if (!domain) {
      return res.status(200).json({
        domain: "",
        verified: false,
        hosting: { status: "not_configured", configured: false, dnsRecords: [] },
      });
    }

    if (!school.website?.customDomainVerified) {
      return res.status(200).json({
        domain,
        verified: false,
        hosting: { status: "awaiting_verification", configured: false, dnsRecords: [] },
      });
    }

    const hosting = await configureVercelDomain(school);
    return res.status(200).json({
      domain,
      verified: true,
      hosting,
    });
  } catch (error) {
    console.error("Get custom school domain status error:", error);
    return res.status(500).json({ message: "Could not refresh custom domain status." });
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

/*
 * Resolve a SchoolPilot subdomain (for example, brightfutureacademy) to
 * the school's existing public website slug (for example, bright-future-academy).
 * The root domain and www are intentionally handled by the main frontend.
 */
export const resolveSchoolSubdomain = async (req, res) => {
  try {
    const subdomain = typeof req.query.subdomain === "string"
      ? req.query.subdomain.trim().toLowerCase()
      : "";

    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(subdomain)) {
      return res.status(400).json({ message: "A valid school subdomain is required." });
    }

    const schools = await School.find({
      isActive: true,
      "website.enabled": true,
      slug: { $exists: true, $ne: "" },
    }).select("name slug");

    const normalizedSubdomain = subdomain.replace(/[^a-z0-9]/g, "");
    const matches = schools.filter(
      (school) => school.slug.toLowerCase().replace(/[^a-z0-9]/g, "") === normalizedSubdomain
    );

    if (matches.length === 0) {
      return res.status(404).json({ message: "No active school website is mapped to this subdomain." });
    }

    if (matches.length > 1) {
      return res.status(409).json({
        message: "This subdomain matches more than one school slug. Use a unique school subdomain.",
      });
    }

    const school = matches[0];
    res.set("Cache-Control", "public, max-age=60, s-maxage=60");
    return res.status(200).json({
      school: { name: school.name, slug: school.slug, subdomain },
    });
  } catch (error) {
    console.error("Resolve school subdomain error:", error);
    return res.status(500).json({ message: "Could not resolve school subdomain." });
  }
};
