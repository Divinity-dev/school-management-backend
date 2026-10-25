
import School from "../models/School.js";
import {
  createSubaccount,
  updateSubaccount,
} from "../utils/paystack.js";

/* =========================================================
   HELPERS
========================================================= */

// Supports both a raw school ID and a populated school object.
const getSchoolId = (req) =>
  req.user?.school?._id || req.user?.school || null;

/* =========================================================
   CREATE SCHOOL
========================================================= */

export const createSchool = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      address,
      city,
      state,
      country,
    } = req.body;

    if (!name?.trim() || !email?.trim()) {
      return res.status(400).json({
        message: "School name and email are required",
      });
    }

    const normalizedName = name.trim();
    const normalizedEmail = email.toLowerCase().trim();

    const existingSchool = await School.findOne({
      email: normalizedEmail,
    });

    if (existingSchool) {
      return res.status(400).json({
        message: "A school with this email already exists",
      });
    }

    // Generate the public website slug.
    const baseSlug = normalizedName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    if (!baseSlug) {
      return res.status(400).json({
        message:
          "School name cannot be used to generate a website address",
      });
    }

    let slug = baseSlug;
    let counter = 1;

    while (await School.exists({ slug })) {
      counter += 1;
      slug = `${baseSlug}-${counter}`;
    }

    const school = await School.create({
      name: normalizedName,
      slug,
      email: normalizedEmail,
      phone,
      address,
      city,
      state,
      country,
    });

    return res.status(201).json({
      message: "School created successfully",
      school,
    });
  } catch (error) {
    console.error("Create school error:", error);

    // A unique index, if configured, may catch concurrent duplicates.
    if (error.code === 11000) {
      return res.status(409).json({
        message:
          "A school with this email or website address already exists",
      });
    }

    return res.status(500).json({
      message: "Server error while creating school",
    });
  }
};

/* =========================================================
   GET SCHOOL GRADING SYSTEM
========================================================= */

export const getSchoolGradingSystem = async (req, res) => {
  try {
    const schoolId = getSchoolId(req);

    if (!schoolId) {
      return res.status(400).json({
        message: "No school is associated with this account",
      });
    }

    const school = await School.findById(schoolId).select(
      "gradingSystem"
    );

    if (!school) {
      return res.status(404).json({
        message: "School not found",
      });
    }

    return res.status(200).json({
      gradingSystem: school.gradingSystem,
    });
  } catch (error) {
    console.error("Get grading system error:", error);

    return res.status(500).json({
      message: "Server error while fetching grading system",
    });
  }
};

/* =========================================================
   UPDATE SCHOOL GRADING SYSTEM
========================================================= */

export const updateSchoolGradingSystem = async (req, res) => {
  try {
    const schoolId = getSchoolId(req);

    if (!schoolId) {
      return res.status(400).json({
        message: "No school is associated with this account",
      });
    }

    const {
      caMaximum,
      examMaximum,
      totalMaximum,
      caComponents,
      gradingScale,
    } = req.body;

    // Number validation.
    if (
      typeof caMaximum !== "number" ||
      typeof examMaximum !== "number" ||
      typeof totalMaximum !== "number" ||
      !Number.isFinite(caMaximum) ||
      !Number.isFinite(examMaximum) ||
      !Number.isFinite(totalMaximum)
    ) {
      return res.status(400).json({
        message:
          "CA maximum, exam maximum and total maximum must be valid numbers",
      });
    }

    if (caMaximum < 0 || examMaximum < 0) {
      return res.status(400).json({
        message:
          "CA maximum and exam maximum cannot be negative",
      });
    }

    if (totalMaximum <= 0) {
      return res.status(400).json({
        message: "Total maximum must be greater than zero",
      });
    }

    if (caMaximum + examMaximum !== totalMaximum) {
      return res.status(400).json({
        message:
          "CA maximum and exam maximum must add up to the total maximum",
      });
    }

    // Validate CA components.
    if (!Array.isArray(caComponents)) {
      return res.status(400).json({
        message: "CA components must be an array",
      });
    }

    if (caComponents.length === 0 && caMaximum > 0) {
      return res.status(400).json({
        message:
          "At least one CA component is required when CA maximum is greater than zero",
      });
    }

    const normalizedComponents = [];
    const componentNames = new Set();

    for (const component of caComponents) {
      if (!component || typeof component !== "object") {
        return res.status(400).json({
          message: "Every CA component must be a valid object",
        });
      }

      const name = String(component.name || "").trim();
      const maximum = Number(component.maximum);

      if (!name) {
        return res.status(400).json({
          message: "Every CA component must have a name",
        });
      }

      if (
        component.maximum === "" ||
        component.maximum === null ||
        component.maximum === undefined ||
        !Number.isFinite(maximum)
      ) {
        return res.status(400).json({
          message: `Maximum score for "${name}" must be a valid number`,
        });
      }

      if (maximum < 0) {
        return res.status(400).json({
          message: `Maximum score for "${name}" cannot be negative`,
        });
      }

      const normalizedName = name.toLowerCase();

      if (componentNames.has(normalizedName)) {
        return res.status(400).json({
          message: `Duplicate CA component "${name}"`,
        });
      }

      componentNames.add(normalizedName);

      normalizedComponents.push({
        name,
        maximum,
      });
    }

    const componentsTotal = normalizedComponents.reduce(
      (sum, component) => sum + component.maximum,
      0
    );

    if (componentsTotal !== caMaximum) {
      return res.status(400).json({
        message:
          `CA component maximums (${componentsTotal}) must add up to the CA maximum (${caMaximum})`,
      });
    }

    // Validate grading scale.
    if (!Array.isArray(gradingScale)) {
      return res.status(400).json({
        message: "Grading scale must be an array",
      });
    }

    if (gradingScale.length === 0) {
      return res.status(400).json({
        message: "At least one grading scale rule is required",
      });
    }

    const normalizedGradingScale = [];

    for (const rule of gradingScale) {
      if (!rule || typeof rule !== "object") {
        return res.status(400).json({
          message:
            "Every grading scale rule must be a valid object",
        });
      }

      const min = Number(rule.min);
      const max = Number(rule.max);
      const grade = String(rule.grade || "").trim();
      const remark = String(rule.remark || "").trim();

      if (
        rule.min === "" ||
        rule.min === null ||
        rule.min === undefined ||
        rule.max === "" ||
        rule.max === null ||
        rule.max === undefined ||
        !Number.isFinite(min) ||
        !Number.isFinite(max)
      ) {
        return res.status(400).json({
          message:
            "Grading scale minimum and maximum must be valid numbers",
        });
      }

      if (min < 0 || max < 0) {
        return res.status(400).json({
          message:
            "Grading scale minimum and maximum cannot be negative",
        });
      }

      if (min > max) {
        return res.status(400).json({
          message:
            `Invalid grading range for grade "${grade}": minimum cannot exceed maximum`,
        });
      }

      if (max > totalMaximum) {
        return res.status(400).json({
          message:
            `Grading scale maximum cannot exceed the total maximum of ${totalMaximum}`,
        });
      }

      if (!grade) {
        return res.status(400).json({
          message: "Every grading scale rule must have a grade",
        });
      }

      if (!remark) {
        return res.status(400).json({
          message:
            `Every grading scale rule must have a remark for grade "${grade}"`,
        });
      }

      normalizedGradingScale.push({
        min,
        max,
        grade,
        remark,
      });
    }

    // Sort a copy for overlap and coverage validation.
    const sortedScale = [...normalizedGradingScale].sort(
      (a, b) => a.min - b.min
    );

    for (let i = 0; i < sortedScale.length - 1; i++) {
      const current = sortedScale[i];
      const next = sortedScale[i + 1];

      // The existing grading rules use inclusive boundaries.
      if (current.max >= next.min) {
        return res.status(400).json({
          message:
            `Grading ranges overlap between ${current.min}-${current.max} and ${next.min}-${next.max}`,
        });
      }
    }

    const coversZero = sortedScale.some(
      (rule) => rule.min === 0
    );

    const coversTotalMaximum = sortedScale.some(
      (rule) => rule.max === totalMaximum
    );

    if (!coversZero || !coversTotalMaximum) {
      return res.status(400).json({
        message:
          `Grading scale must cover the full score range from 0 to ${totalMaximum}`,
      });
    }

    const school = await School.findById(schoolId);

    if (!school) {
      return res.status(404).json({
        message: "School not found",
      });
    }

    school.gradingSystem = {
      caMaximum,
      examMaximum,
      totalMaximum,
      caComponents: normalizedComponents,
      gradingScale: normalizedGradingScale,
    };

    await school.save();

    return res.status(200).json({
      message: "Grading system updated successfully",
      gradingSystem: school.gradingSystem,
    });
  } catch (error) {
    console.error("Update grading system error:", error);

    if (error.name === "ValidationError") {
      return res.status(400).json({
        message: error.message,
      });
    }

    return res.status(500).json({
      message: "Server error while updating grading system",
    });
  }
};

/* =========================================================
   GET SCHOOL BANK DETAILS
========================================================= */

export const getSchoolBankDetails = async (req, res) => {
  try {
    const schoolId = getSchoolId(req);

    if (!schoolId) {
      return res.status(400).json({
        message: "No school is associated with this account",
      });
    }

    const school = await School.findById(schoolId).select(
      "bankDetails paystackSubaccountStatus"
    );

    if (!school) {
      return res.status(404).json({
        message: "School not found",
      });
    }

    const paymentSetupStatus =
      school.paystackSubaccountStatus || "not_configured";

    return res.status(200).json({
      bankDetails: school.bankDetails,
      onlinePaymentsEnabled: paymentSetupStatus === "active",
      paymentSetupStatus,
    });
  } catch (error) {
    console.error("Get school bank details error:", error);

    return res.status(500).json({
      message: "Server error while fetching bank details",
    });
  }
};

/* =========================================================
   UPDATE SCHOOL BANK DETAILS
========================================================= */

export const updateSchoolBankDetails = async (req, res) => {
  try {
    const schoolId = getSchoolId(req);

    if (!schoolId) {
      return res.status(400).json({
        message: "No school is associated with this account.",
      });
    }

    const {
      accountName,
      accountNumber,
      bankName,
      bankCode,
      paymentInstructions,
    } = req.body;

    const normalizedAccountName = String(
      accountName || ""
    ).trim();

    const normalizedAccountNumber = String(
      accountNumber || ""
    ).trim();

    const normalizedBankName = String(
      bankName || ""
    ).trim();

    const normalizedBankCode = String(
      bankCode || ""
    ).trim();

    const normalizedPaymentInstructions = String(
      paymentInstructions || ""
    ).trim();

    if (!normalizedAccountName) {
      return res.status(400).json({
        message: "Account name is required.",
      });
    }

    if (!/^\d{10}$/.test(normalizedAccountNumber)) {
      return res.status(400).json({
        message: "Account number must be exactly 10 digits.",
      });
    }

    if (!normalizedBankName || !normalizedBankCode) {
      return res.status(400).json({
        message: "Bank name and bank code are required.",
      });
    }

    const school = await School.findById(schoolId);

    if (!school) {
      return res.status(404).json({
        message: "School not found.",
      });
    }

    const existingBankDetails = school.bankDetails || {};

    const bankAccountChanged =
      String(existingBankDetails.accountNumber || "").trim() !==
        normalizedAccountNumber ||
      String(existingBankDetails.bankCode || "").trim() !==
        normalizedBankCode;

    const needsSubaccountSetup =
      !school.paystackSubaccountCode ||
      school.paystackSubaccountStatus !== "active" ||
      bankAccountChanged;

    let subaccountCode = school.paystackSubaccountCode || "";

    if (needsSubaccountSetup) {
      // Persist a fail-closed status before making the external request.
      // School-fee initialization must reject schools that are not active.
      school.paystackSubaccountStatus = "pending";
      await school.save();

      try {
        if (subaccountCode) {
          const updatedSubaccount = await updateSubaccount({
            subaccountCode,
            businessName: school.name,
            bankCode: normalizedBankCode,
            accountNumber: normalizedAccountNumber,
          });

          subaccountCode = updatedSubaccount.subaccount_code;
        } else {
          const newSubaccount = await createSubaccount({
            businessName: school.name,
            bankCode: normalizedBankCode,
            accountNumber: normalizedAccountNumber,
            contactName: normalizedAccountName,
            contactEmail: school.email,
            contactPhone: school.phone,
          });

          subaccountCode = newSubaccount.subaccount_code;
        }

        if (!subaccountCode) {
          throw new Error(
            "Paystack did not return a valid subaccount code."
          );
        }
      } catch (paystackError) {
        school.paystackSubaccountStatus = "failed";

        await school.save().catch((saveError) => {
          console.error(
            "Could not save failed subaccount status:",
            saveError.message
          );
        });

        console.error(
          "School Paystack subaccount setup failed:",
          paystackError.message
        );

        return res.status(502).json({
          message:
            "Your bank details could not be connected to Paystack. Online school-fee payments remain disabled. Please check the details and try again.",
          paymentSetupStatus: "failed",
          onlinePaymentsEnabled: false,
        });
      }
    }

    // Save the new bank details only after Paystack setup succeeds.
    school.bankDetails = {
      accountName: normalizedAccountName,
      accountNumber: normalizedAccountNumber,
      bankName: normalizedBankName,
      bankCode: normalizedBankCode,
      paymentInstructions: normalizedPaymentInstructions,
      isProvided: true,
    };

    school.paystackSubaccountCode = subaccountCode;
    school.paystackSubaccountStatus = "active";

    if (needsSubaccountSetup) {
      school.paystackSubaccountUpdatedAt = new Date();
    }

    await school.save();

    return res.status(200).json({
      message:
        "Bank details saved and Paystack school-fee routing is active.",
      bankDetails: school.bankDetails,
      onlinePaymentsEnabled: true,
      paymentSetupStatus: "active",
    });
  } catch (error) {
    console.error("Update school bank details error:", error);

    return res.status(500).json({
      message: "Server error while updating bank details.",
    });
  }
};

/* =========================================================
   GET REPORT CARD BRANDING
========================================================= */

export const getReportCardBranding = async (req, res) => {
  try {
    const schoolId = getSchoolId(req);

    if (!schoolId) {
      return res.status(400).json({
        message: "No school is associated with this account",
      });
    }

    const school = await School.findById(schoolId).select(
      "name logo principalSignature principalStamp"
    );

    if (!school) {
      return res.status(404).json({
        message: "School not found",
      });
    }

    return res.status(200).json({
      message: "Report card branding retrieved successfully",
      branding: {
        schoolName: school.name,
        logo: school.logo || "",
        principalSignature: school.principalSignature || "",
        principalStamp: school.principalStamp || "",
      },
    });
  } catch (error) {
    console.error("Get report card branding error:", error);

    return res.status(500).json({
      message: "Failed to retrieve report card branding",
    });
  }
};

/* =========================================================
   UPDATE REPORT CARD BRANDING
========================================================= */

export const updateReportCardBranding = async (req, res) => {
  try {
    const schoolId = getSchoolId(req);

    if (!schoolId) {
      return res.status(400).json({
        message: "No school is associated with this account",
      });
    }

    const {
      principalSignature,
      principalStamp,
    } = req.body;

    if (
      principalSignature === undefined &&
      principalStamp === undefined
    ) {
      return res.status(400).json({
        message:
          "Provide a principal signature or school stamp URL",
      });
    }

    for (const [field, value] of Object.entries({
      principalSignature,
      principalStamp,
    })) {
      if (
        value !== undefined &&
        typeof value !== "string"
      ) {
        return res.status(400).json({
          message: `${field} must be a string URL`,
        });
      }
    }

    const school = await School.findById(schoolId);

    if (!school) {
      return res.status(404).json({
        message: "School not found",
      });
    }

    // Empty strings remove existing images.
    // Omitted fields remain unchanged.
    if (principalSignature !== undefined) {
      school.principalSignature = principalSignature.trim();
    }

    if (principalStamp !== undefined) {
      school.principalStamp = principalStamp.trim();
    }

    await school.save();

    return res.status(200).json({
      message: "Report card branding updated successfully",
      branding: {
        schoolName: school.name,
        logo: school.logo || "",
        principalSignature: school.principalSignature || "",
        principalStamp: school.principalStamp || "",
      },
    });
  } catch (error) {
    console.error("Update report card branding error:", error);

    if (error.name === "ValidationError") {
      return res.status(400).json({
        message: error.message,
      });
    }

    return res.status(500).json({
      message: "Failed to update report card branding",
    });
  }
};
