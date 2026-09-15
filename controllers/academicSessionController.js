import AcademicSession from "../models/AcademicSession.js";


// @desc    Create academic session
// @route   POST /api/academic-sessions
// @access  Private
export const createAcademicSession = async (req, res) => {
  try {
    const { name, startDate, endDate, isCurrent } = req.body;

    if (!name || !startDate || !endDate) {
      return res.status(400).json({
        message: "Name, start date and end date are required",
      });
    }

    if (new Date(startDate) >= new Date(endDate)) {
      return res.status(400).json({
        message: "End date must be after start date",
      });
    }

    const schoolId = req.user.school;

    const existingSession = await AcademicSession.findOne({
      school: schoolId,
      name: name.trim(),
    });

    if (existingSession) {
      return res.status(400).json({
        message: "This academic session already exists",
      });
    }

    // If this session should be current,
    // remove current status from other sessions in the school.
    if (isCurrent === true) {
      await AcademicSession.updateMany(
        { school: schoolId },
        { $set: { isCurrent: false } }
      );
    }

    const session = await AcademicSession.create({
      school: schoolId,
      name: name.trim(),
      startDate,
      endDate,
      isCurrent: isCurrent === true,
    });

    res.status(201).json({
      message: "Academic session created successfully",
      session,
    });
  } catch (error) {
    console.error("Create academic session error:", error);

    res.status(500).json({
      message: "Server error",
    });
  }
};


// @desc    Get all academic sessions for school
// @route   GET /api/academic-sessions
// @access  Private
export const getAcademicSessions = async (req, res) => {
  try {
    const sessions = await AcademicSession.find({
      school: req.user.school,
    }).sort({ startDate: -1 });

    res.status(200).json({
      sessions,
    });
  } catch (error) {
    console.error("Get academic sessions error:", error);

    res.status(500).json({
      message: "Server error",
    });
  }
};


// @desc    Get single academic session
// @route   GET /api/academic-sessions/:id
// @access  Private
export const getAcademicSession = async (req, res) => {
  try {
    const session = await AcademicSession.findOne({
      _id: req.params.id,
      school: req.user.school,
    });

    if (!session) {
      return res.status(404).json({
        message: "Academic session not found",
      });
    }

    res.status(200).json({
      session,
    });
  } catch (error) {
    console.error("Get academic session error:", error);

    res.status(500).json({
      message: "Server error",
    });
  }
};


// @desc    Set academic session as current
// @route   PATCH /api/academic-sessions/:id/current
// @access  Private
export const setCurrentAcademicSession = async (req, res) => {
  try {
    const session = await AcademicSession.findOne({
      _id: req.params.id,
      school: req.user.school,
    });

    if (!session) {
      return res.status(404).json({
        message: "Academic session not found",
      });
    }

    if (!session.isActive) {
      return res.status(400).json({
        message: "Cannot make an inactive session current",
      });
    }

    // Remove current status from all other sessions
    await AcademicSession.updateMany(
      {
        school: req.user.school,
        _id: { $ne: session._id },
      },
      {
        $set: { isCurrent: false },
      }
    );

    session.isCurrent = true;

    await session.save();

    res.status(200).json({
      message: "Academic session set as current successfully",
      session,
    });
  } catch (error) {
    console.error("Set current academic session error:", error);

    res.status(500).json({
      message: "Server error",
    });
  }
};


// @desc    Update academic session
// @route   PUT /api/academic-sessions/:id
// @access  Private
export const updateAcademicSession = async (req, res) => {
  try {
    const { name, startDate, endDate, isCurrent, isActive } = req.body;

    const session = await AcademicSession.findOne({
      _id: req.params.id,
      school: req.user.school,
    });

    if (!session) {
      return res.status(404).json({
        message: "Academic session not found",
      });
    }

    if (name !== undefined) {
      const existingSession = await AcademicSession.findOne({
        school: req.user.school,
        name: name.trim(),
        _id: { $ne: session._id },
      });

      if (existingSession) {
        return res.status(400).json({
          message: "This academic session already exists",
        });
      }

      session.name = name.trim();
    }

    if (startDate !== undefined) {
      session.startDate = startDate;
    }

    if (endDate !== undefined) {
      session.endDate = endDate;
    }

    if (new Date(session.startDate) >= new Date(session.endDate)) {
      return res.status(400).json({
        message: "End date must be after start date",
      });
    }

    if (isActive !== undefined) {
      session.isActive = isActive;
    }

    if (isCurrent === true) {
      if (!session.isActive) {
        return res.status(400).json({
          message: "Cannot make an inactive session current",
        });
      }

      await AcademicSession.updateMany(
        {
          school: req.user.school,
          _id: { $ne: session._id },
        },
        {
          $set: { isCurrent: false },
        }
      );

      session.isCurrent = true;
    }

    if (isCurrent === false) {
      session.isCurrent = false;
    }

    await session.save();

    res.status(200).json({
      message: "Academic session updated successfully",
      session,
    });
  } catch (error) {
    console.error("Update academic session error:", error);

    res.status(500).json({
      message: "Server error",
    });
  }
};


// @desc    Deactivate academic session
// @route   PATCH /api/academic-sessions/:id/deactivate
// @access  Private
export const deactivateAcademicSession = async (req, res) => {
  try {
    const session = await AcademicSession.findOne({
      _id: req.params.id,
      school: req.user.school,
    });

    if (!session) {
      return res.status(404).json({
        message: "Academic session not found",
      });
    }

    session.isActive = false;
    session.isCurrent = false;

    await session.save();

    res.status(200).json({
      message: "Academic session deactivated successfully",
      session,
    });
  } catch (error) {
    console.error("Deactivate academic session error:", error);

    res.status(500).json({
      message: "Server error",
    });
  }
};