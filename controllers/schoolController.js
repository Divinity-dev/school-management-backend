import School from "../models/School.js";

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

    if (!name || !email) {
      return res.status(400).json({
        message: "School name and email are required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existingSchool = await School.findOne({
      email: normalizedEmail,
    });

    if (existingSchool) {
      return res.status(400).json({
        message: "A school with this email already exists",
      });
    }

    /* -------------------------------------------------------
       GENERATE PUBLIC WEBSITE SLUG
    ------------------------------------------------------- */

    const baseSlug = name
      .toLowerCase()
      .trim()
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

    /* -------------------------------------------------------
       CREATE SCHOOL
    ------------------------------------------------------- */

    const school = await School.create({
      name: name.trim(),
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
    if (!req.user.school) {
      return res.status(400).json({
        message: "No school is associated with this account",
      });
    }

    const school = await School.findById(req.user.school).select(
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

/**
 * Supports:
 *
 * {
 *   caMaximum: 40,
 *   examMaximum: 60,
 *   totalMaximum: 100,
 *
 *   caComponents: [
 *     {
 *       name: "1st Test",
 *       maximum: 15
 *     },
 *     {
 *       name: "2nd Test",
 *       maximum: 15
 *     },
 *     {
 *       name: "Other",
 *       maximum: 10
 *     }
 *   ],
 *
 *   gradingScale: [
 *     {
 *       min: 70,
 *       max: 100,
 *       grade: "A",
 *       remark: "Excellent"
 *     }
 *   ]
 * }
 */

export const updateSchoolGradingSystem = async (req, res) => {
  try {
    if (!req.user.school) {
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

    /* -------------------------------------------------------
       BASIC NUMBER VALIDATION
    ------------------------------------------------------- */

    if (
      typeof caMaximum !== "number" ||
      typeof examMaximum !== "number" ||
      typeof totalMaximum !== "number"
    ) {
      return res.status(400).json({
        message:
          "CA maximum, exam maximum and total maximum must be numbers",
      });
    }

    if (
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

    /* -------------------------------------------------------
       TOTAL VALIDATION
    ------------------------------------------------------- */

    if (caMaximum + examMaximum !== totalMaximum) {
      return res.status(400).json({
        message:
          "CA maximum and exam maximum must add up to the total maximum",
      });
    }

    /* -------------------------------------------------------
       CA COMPONENT VALIDATION
    ------------------------------------------------------- */

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

      if (!Number.isFinite(maximum)) {
        return res.status(400).json({
          message:
            `Maximum score for "${name}" must be a valid number`,
        });
      }

      if (maximum < 0) {
        return res.status(400).json({
          message:
            `Maximum score for "${name}" cannot be negative`,
        });
      }

      const normalizedName = name.toLowerCase();

      if (componentNames.has(normalizedName)) {
        return res.status(400).json({
          message:
            `Duplicate CA component "${name}"`,
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

    /* -------------------------------------------------------
       GRADING SCALE VALIDATION
    ------------------------------------------------------- */

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
          message: "Every grading scale rule must be a valid object",
        });
      }

      const min = Number(rule.min);
      const max = Number(rule.max);
      const grade = String(rule.grade || "").trim();
      const remark = String(rule.remark || "").trim();

      if (!Number.isFinite(min) || !Number.isFinite(max)) {
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

    /* -------------------------------------------------------
       CHECK FOR OVERLAPPING GRADING RANGES
    ------------------------------------------------------- */

    const sortedScale = [...normalizedGradingScale].sort(
      (a, b) => a.min - b.min
    );

    for (let i = 0; i < sortedScale.length - 1; i++) {
      const current = sortedScale[i];
      const next = sortedScale[i + 1];

      if (current.max >= next.min) {
        return res.status(400).json({
          message:
            `Grading ranges overlap between ${current.min}-${current.max} and ${next.min}-${next.max}`,
        });
      }
    }

    /* -------------------------------------------------------
       CHECK THAT THE SCALE COVERS THE TOTAL RANGE
    ------------------------------------------------------- */

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

    /* -------------------------------------------------------
       FIND SCHOOL
    ------------------------------------------------------- */

    const school = await School.findById(req.user.school);

    if (!school) {
      return res.status(404).json({
        message: "School not found",
      });
    }

    /* -------------------------------------------------------
       UPDATE GRADING SYSTEM
    ------------------------------------------------------- */

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

    /*
     * Mongoose validation errors from School.js
     * are returned to the client as 400 rather than
     * being treated as a generic server error.
     */

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

// =========================================================
// GET SCHOOL BANK DETAILS
// =========================================================

export const getSchoolBankDetails = async (req, res) => {
  try {
    if (!req.user.school) {
      return res.status(400).json({
        message: "No school is associated with this account",
      });
    }

    const school = await School.findById(req.user.school).select(
      "bankDetails"
    );

    if (!school) {
      return res.status(404).json({
        message: "School not found",
      });
    }

    return res.status(200).json({
      bankDetails: school.bankDetails,
    });
  } catch (error) {
    console.error("Get school bank details error:", error);

    return res.status(500).json({
      message: "Server error while fetching bank details",
    });
  }
};

// =========================================================
// UPDATE SCHOOL BANK DETAILS
// =========================================================

export const updateSchoolBankDetails = async (req, res) => {
  try {
    if (!req.user.school) {
      return res.status(400).json({
        message: "No school is associated with this account",
      });
    }

    const {
      accountName,
      accountNumber,
      bankName,
      bankCode,
      paymentInstructions,
    } = req.body;

    /* -------------------------------------------------------
       BASIC VALIDATION
    ------------------------------------------------------- */

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
        message: "Account name is required",
      });
    }

    if (!normalizedAccountNumber) {
      return res.status(400).json({
        message: "Account number is required",
      });
    }

    if (!/^\d{10}$/.test(normalizedAccountNumber)) {
      return res.status(400).json({
        message: "Account number must be exactly 10 digits",
      });
    }

    if (!normalizedBankName) {
      return res.status(400).json({
        message: "Bank name is required",
      });
    }

    if (!normalizedBankCode) {
      return res.status(400).json({
        message: "Bank code is required",
      });
    }

    /* -------------------------------------------------------
       FIND SCHOOL
    ------------------------------------------------------- */

    const school = await School.findById(req.user.school);

    if (!school) {
      return res.status(404).json({
        message: "School not found",
      });
    }

    /* -------------------------------------------------------
       UPDATE BANK DETAILS
    ------------------------------------------------------- */

    school.bankDetails = {
      accountName: normalizedAccountName,
      accountNumber: normalizedAccountNumber,
      bankName: normalizedBankName,
      bankCode: normalizedBankCode,
      paymentInstructions: normalizedPaymentInstructions,
      isProvided: true,
    };

    await school.save();

    return res.status(200).json({
      message: "Bank details updated successfully",
      bankDetails: school.bankDetails,
    });
  } catch (error) {
    console.error("Update school bank details error:", error);

    if (error.name === "ValidationError") {
      return res.status(400).json({
        message: error.message,
      });
    }

    return res.status(500).json({
      message: "Server error while updating bank details",
    });
  }
};