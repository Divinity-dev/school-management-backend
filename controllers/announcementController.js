import Announcement from "../models/Announcement.js";

const getSchoolId = (req) =>
  req.user?.school?._id || req.user?.school;

/**
 * Create announcement
 * School admin only
 */
export const createAnnouncement = async (req, res) => {
  try {
    const schoolId = getSchoolId(req);

    const { title, message, targetAudience } = req.body;

    if (!schoolId) {
      return res.status(400).json({
        message: "School information is missing.",
      });
    }

    if (!title || !message) {
      return res.status(400).json({
        message: "Title and message are required.",
      });
    }

    const allowedAudiences = [
      "all",
      "parents",
      "teachers",
      "students",
    ];

    const audience = targetAudience || "all";

    if (!allowedAudiences.includes(audience)) {
      return res.status(400).json({
        message: "Invalid target audience.",
      });
    }

    const announcement = await Announcement.create({
      school: schoolId,
      title: title.trim(),
      message: message.trim(),
      targetAudience: audience,
      createdBy: req.user._id,
    });

    const populatedAnnouncement =
      await Announcement.findById(announcement._id)
        .populate("createdBy", "firstName lastName email role");

    return res.status(201).json({
      message: "Announcement created successfully.",
      announcement: populatedAnnouncement,
    });
  } catch (error) {
    console.error("Create announcement error:", error);

    return res.status(500).json({
      message: "Server error while creating announcement.",
    });
  }
};

/**
 * Get all announcements for school admin
 */
export const getAnnouncements = async (req, res) => {
  try {
    const schoolId = getSchoolId(req);

    if (!schoolId) {
      return res.status(400).json({
        message: "School information is missing.",
      });
    }

    const { targetAudience, isActive } = req.query;

    const filter = {
      school: schoolId,
    };

    if (targetAudience) {
      filter.targetAudience = targetAudience;
    }

    if (isActive !== undefined) {
      filter.isActive = isActive === "true";
    }

    const announcements = await Announcement.find(filter)
      .populate(
        "createdBy",
        "firstName lastName email role"
      )
      .sort({ createdAt: -1 });

    return res.status(200).json({
      message: "Announcements retrieved successfully.",
      count: announcements.length,
      announcements,
    });
  } catch (error) {
    console.error("Get announcements error:", error);

    return res.status(500).json({
      message: "Server error while retrieving announcements.",
    });
  }
};

/**
 * Get announcements relevant to logged-in user
 */
export const getMyAnnouncements = async (req, res) => {
  try {
    const schoolId = getSchoolId(req);

    if (!schoolId) {
      return res.status(400).json({
        message: "School information is missing.",
      });
    }

    const roleAudienceMap = {
      parent: "parents",
      teacher: "teachers",
      student: "students",
    };

    const audience = roleAudienceMap[req.user.role];

    const filter = {
      school: schoolId,
      isActive: true,
      $or: [
        { targetAudience: "all" },
      ],
    };

    if (audience) {
      filter.$or.push({
        targetAudience: audience,
      });
    }

    const announcements = await Announcement.find(filter)
      .populate(
        "createdBy",
        "firstName lastName email role"
      )
      .sort({ createdAt: -1 });

    return res.status(200).json({
      message: "Announcements retrieved successfully.",
      count: announcements.length,
      announcements,
    });
  } catch (error) {
    console.error("Get my announcements error:", error);

    return res.status(500).json({
      message:
        "Server error while retrieving announcements.",
    });
  }
};

/**
 * Get single announcement
 * School admin only
 */
export const getAnnouncementById = async (req, res) => {
  try {
    const schoolId = getSchoolId(req);

    const announcement = await Announcement.findOne({
      _id: req.params.id,
      school: schoolId,
    }).populate(
      "createdBy",
      "firstName lastName email role"
    );

    if (!announcement) {
      return res.status(404).json({
        message: "Announcement not found.",
      });
    }

    return res.status(200).json({
      message: "Announcement retrieved successfully.",
      announcement,
    });
  } catch (error) {
    console.error(
      "Get announcement by ID error:",
      error
    );

    return res.status(500).json({
      message:
        "Server error while retrieving announcement.",
    });
  }
};

/**
 * Update announcement
 * School admin only
 */
export const updateAnnouncement = async (req, res) => {
  try {
    const schoolId = getSchoolId(req);

    const { title, message, targetAudience, isActive } =
      req.body;

    const announcement = await Announcement.findOne({
      _id: req.params.id,
      school: schoolId,
    });

    if (!announcement) {
      return res.status(404).json({
        message: "Announcement not found.",
      });
    }

    const allowedAudiences = [
      "all",
      "parents",
      "teachers",
      "students",
    ];

    if (
      targetAudience !== undefined &&
      !allowedAudiences.includes(targetAudience)
    ) {
      return res.status(400).json({
        message: "Invalid target audience.",
      });
    }

    if (title !== undefined) {
      if (!title.trim()) {
        return res.status(400).json({
          message: "Title cannot be empty.",
        });
      }

      announcement.title = title.trim();
    }

    if (message !== undefined) {
      if (!message.trim()) {
        return res.status(400).json({
          message: "Message cannot be empty.",
        });
      }

      announcement.message = message.trim();
    }

    if (targetAudience !== undefined) {
      announcement.targetAudience = targetAudience;
    }

    if (isActive !== undefined) {
      announcement.isActive = isActive;
    }

    await announcement.save();

    const updatedAnnouncement =
      await Announcement.findById(announcement._id)
        .populate(
          "createdBy",
          "firstName lastName email role"
        );

    return res.status(200).json({
      message: "Announcement updated successfully.",
      announcement: updatedAnnouncement,
    });
  } catch (error) {
    console.error(
      "Update announcement error:",
      error
    );

    return res.status(500).json({
      message:
        "Server error while updating announcement.",
    });
  }
};

/**
 * Delete announcement
 * School admin only
 */
export const deleteAnnouncement = async (req, res) => {
  try {
    const schoolId = getSchoolId(req);

    const announcement = await Announcement.findOne({
      _id: req.params.id,
      school: schoolId,
    });

    if (!announcement) {
      return res.status(404).json({
        message: "Announcement not found.",
      });
    }

    await announcement.deleteOne();

    return res.status(200).json({
      message: "Announcement deleted successfully.",
    });
  } catch (error) {
    console.error(
      "Delete announcement error:",
      error
    );

    return res.status(500).json({
      message:
        "Server error while deleting announcement.",
    });
  }
};