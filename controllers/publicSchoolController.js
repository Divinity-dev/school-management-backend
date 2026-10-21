import School from "../models/School.js";

/* =========================================================
   GET PUBLIC SCHOOL WEBSITE
========================================================= */

export const getPublicSchool = async (req, res) => {
  try {
    const { slug } = req.params;

    if (!slug) {
      return res.status(400).json({
        message: "School slug is required",
      });
    }

    const school = await School.findOne({
      slug: slug.toLowerCase().trim(),
      isActive: true,
      "website.enabled": true,
    }).select(
      "name slug email phone address city state country logo publicProfile website"
    );

    if (!school) {
      return res.status(404).json({
        message: "School website not found",
      });
    }

    return res.status(200).json({
      school,
    });
  } catch (error) {
    console.error("Get public school error:", error);

    return res.status(500).json({
      message: "Server error while fetching school website",
    });
  }
};

/* =========================================================
   SCHOOL ADMIN WEBSITE SETTINGS
========================================================= */

export const getSchoolWebsiteSettings = async (req, res) => {
  try {
    if (!req.user?.school) {
      return res.status(400).json({
        message: "No school associated with this account",
      });
    }

    const school = await School.findById(req.user.school).select(
      "name slug logo publicProfile"
    );

    if (!school) {
      return res.status(404).json({
        message: "School not found",
      });
    }

    return res.status(200).json({
      message: "Website settings retrieved successfully",
      school,
    });
  } catch (error) {
    console.error(
      "Get school website settings error:",
      error
    );

    return res.status(500).json({
      message: "Failed to retrieve website settings",
      error: error.message,
    });
  }
};

/* =========================================================
   UPDATE SCHOOL WEBSITE SETTINGS
========================================================= */

export const updateSchoolWebsiteSettings = async (req, res) => {
  try {
    if (!req.user?.school) {
      return res.status(400).json({
        message: "No school associated with this account",
      });
    }

    const school = await School.findById(req.user.school);

    if (!school) {
      return res.status(404).json({
        message: "School not found",
      });
    }

    const {
      /* GENERAL */
      name,
      logo,

      /* ABOUT */
      tagline,
      description,
      history,
      mission,
      vision,
      coreValues,

      /* ADMISSIONS */
      admissions,

      /* PRINCIPAL */
      principalMessage,
      principalName,
      principalPhoto,

      /* BRANDING */
      primaryColor,
      secondaryColor,
      heroImage,
      favicon,

      /* HOMEPAGE VISIBILITY */
      showPrincipalMessage,
      showTestimonials,
      showStatistics,
      showEvents,
      showNews,

      /* CONTACT */
      whatsapp,
      googleMapsUrl,

      /* SOCIAL MEDIA */
      facebook,
      instagram,
      x,
      linkedin,
      youtube,
    } = req.body;

    /* ---------------------------------------------------------
       GENERAL
    --------------------------------------------------------- */

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({
          message: "School name cannot be empty",
        });
      }

      school.name = name.trim();
    }

    if (logo !== undefined) {
      school.logo = logo;
    }

    /* ---------------------------------------------------------
       PUBLIC PROFILE
    --------------------------------------------------------- */

    const publicProfile = school.publicProfile || {};

    /*
     * Make sure existing schools created before the
     * admissions feature can safely receive the new object.
     */
    publicProfile.admissions =
      publicProfile.admissions || {};

    /* ---------------------------------------------------------
       ABOUT
    --------------------------------------------------------- */

    if (tagline !== undefined) {
      publicProfile.tagline = tagline;
    }

    if (description !== undefined) {
      publicProfile.description = description;
    }

    if (history !== undefined) {
      publicProfile.history = history;
    }

    if (mission !== undefined) {
      publicProfile.mission = mission;
    }

    if (vision !== undefined) {
      publicProfile.vision = vision;
    }

    if (coreValues !== undefined) {
      if (!Array.isArray(coreValues)) {
        return res.status(400).json({
          message: "Core values must be an array",
        });
      }

      publicProfile.coreValues = coreValues;
    }

    /* ---------------------------------------------------------
       ADMISSIONS
    --------------------------------------------------------- */

    if (admissions !== undefined) {
      if (
        typeof admissions !== "object" ||
        admissions === null ||
        Array.isArray(admissions)
      ) {
        return res.status(400).json({
          message: "Admissions must be an object",
        });
      }

      if (admissions.enabled !== undefined) {
        publicProfile.admissions.enabled =
          Boolean(admissions.enabled);
      }

      if (admissions.status !== undefined) {
        publicProfile.admissions.status =
          typeof admissions.status === "string"
            ? admissions.status.trim()
            : "";
      }

      if (admissions.title !== undefined) {
        publicProfile.admissions.title =
          typeof admissions.title === "string"
            ? admissions.title.trim()
            : "";
      }

      if (admissions.description !== undefined) {
        publicProfile.admissions.description =
          typeof admissions.description === "string"
            ? admissions.description.trim()
            : "";
      }

      if (admissions.requirements !== undefined) {
        if (!Array.isArray(admissions.requirements)) {
          return res.status(400).json({
            message:
              "Admission requirements must be an array",
          });
        }

        publicProfile.admissions.requirements =
          admissions.requirements
            .filter(
              (requirement) =>
                typeof requirement === "string"
            )
            .map((requirement) =>
              requirement.trim()
            )
            .filter(Boolean);
      }

      if (admissions.applicationUrl !== undefined) {
        publicProfile.admissions.applicationUrl =
          typeof admissions.applicationUrl === "string"
            ? admissions.applicationUrl.trim()
            : "";
      }

      if (
        admissions.applicationButtonText !== undefined
      ) {
        publicProfile.admissions.applicationButtonText =
          typeof admissions.applicationButtonText ===
          "string"
            ? admissions.applicationButtonText.trim()
            : "";
      }

      if (admissions.contactText !== undefined) {
        publicProfile.admissions.contactText =
          typeof admissions.contactText === "string"
            ? admissions.contactText.trim()
            : "";
      }
    }

    /* ---------------------------------------------------------
       PRINCIPAL
    --------------------------------------------------------- */

    if (principalMessage !== undefined) {
      publicProfile.principalMessage =
        principalMessage;
    }

    if (principalName !== undefined) {
      publicProfile.principalName = principalName;
    }

    if (principalPhoto !== undefined) {
      publicProfile.principalPhoto = principalPhoto;
    }

    /* ---------------------------------------------------------
       BRANDING
    --------------------------------------------------------- */

    if (primaryColor !== undefined) {
      publicProfile.primaryColor = primaryColor;
    }

    if (secondaryColor !== undefined) {
      publicProfile.secondaryColor =
        secondaryColor;
    }

    if (heroImage !== undefined) {
      publicProfile.heroImage = heroImage;
    }

    if (favicon !== undefined) {
      publicProfile.favicon = favicon;
    }

    /* ---------------------------------------------------------
       HOMEPAGE VISIBILITY
    --------------------------------------------------------- */

    if (showPrincipalMessage !== undefined) {
      publicProfile.showPrincipalMessage =
        showPrincipalMessage;
    }

    if (showTestimonials !== undefined) {
      publicProfile.showTestimonials =
        showTestimonials;
    }

    if (showStatistics !== undefined) {
      publicProfile.showStatistics =
        showStatistics;
    }

    if (showEvents !== undefined) {
      publicProfile.showEvents = showEvents;
    }

    if (showNews !== undefined) {
      publicProfile.showNews = showNews;
    }

    /* ---------------------------------------------------------
       CONTACT
    --------------------------------------------------------- */

    if (whatsapp !== undefined) {
      publicProfile.whatsapp = whatsapp;
    }

    if (googleMapsUrl !== undefined) {
      publicProfile.googleMapsUrl =
        googleMapsUrl;
    }

    /* ---------------------------------------------------------
       SOCIAL MEDIA
    --------------------------------------------------------- */

    if (facebook !== undefined) {
      publicProfile.facebook = facebook;
    }

    if (instagram !== undefined) {
      publicProfile.instagram = instagram;
    }

    if (x !== undefined) {
      publicProfile.x = x;
    }

    if (linkedin !== undefined) {
      publicProfile.linkedin = linkedin;
    }

    if (youtube !== undefined) {
      publicProfile.youtube = youtube;
    }

    /* ---------------------------------------------------------
       SAVE
    --------------------------------------------------------- */

    school.publicProfile = publicProfile;

    await school.save();

    return res.status(200).json({
      message: "Website settings updated successfully",
      school,
    });
  } catch (error) {
    console.error(
      "Update school website settings error:",
      error
    );

    if (error.name === "ValidationError") {
      return res.status(400).json({
        message: error.message,
      });
    }

    return res.status(500).json({
      message: "Failed to update website settings",
      error: error.message,
    });
  }
};