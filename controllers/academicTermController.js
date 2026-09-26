import AcademicTerm from "../models/AcademicTerm.js";
import AcademicSession from "../models/AcademicSession.js";

// @desc    Create academic term
// @route   POST /api/academic-terms
// @access  Private - School Admin
export const createAcademicTerm = async (req, res) => {
  try {
    const {
      academicSession,
      name,
      startDate,
      endDate,
      isCurrent,
    } = req.body;

    if (!academicSession || !name || !startDate || !endDate) {
      return res.status(400).json({
        message:
          "Academic session, name, start date and end date are required",
      });
    }

    if (new Date(startDate) >= new Date(endDate)) {
      return res.status(400).json({
        message: "End date must be after start date",
      });
    }

    // Make sure the session belongs to the logged-in school
    const session = await AcademicSession.findOne({
      _id: academicSession,
      school: req.user.school,
    });

    if (!session) {
      return res.status(404).json({
        message: "Academic session not found",
      });
    }

    // Make sure term dates fall within the academic session
    if (
      new Date(startDate) < new Date(session.startDate) ||
      new Date(endDate) > new Date(session.endDate)
    ) {
      return res.status(400).json({
        message: "Term dates must fall within the academic session dates",
      });
    }

    const existingTerm = await AcademicTerm.findOne({
      school: req.user.school,
      academicSession,
      name,
    });

    if (existingTerm) {
      return res.status(400).json({
        message: "This term already exists for this academic session",
      });
    }

    // Only one current term per school
    if (isCurrent === true) {
      await AcademicTerm.updateMany(
        {
          school: req.user.school,
        },
        {
          $set: { isCurrent: false },
        }
      );
    }

    const term = await AcademicTerm.create({
      school: req.user.school,
      academicSession,
      name,
      startDate,
      endDate,
      isCurrent: isCurrent === true,
    });

    res.status(201).json({
      message: "Academic term created successfully",
      term,
    });
  } catch (error) {
    console.error("Create academic term error:", error);

    res.status(500).json({
      message: "Server error",
    });
  }
};


// @desc    Get all academic terms for school
// @route   GET /api/academic-terms
// @access  Private
export const getAcademicTerms = async (req, res) => {
  try {
    const terms = await AcademicTerm.find({
      school: req.user.school,
    })
      .populate("academicSession", "name startDate endDate")
      .sort({ startDate: -1 });

    res.status(200).json({
      terms,
    });
  } catch (error) {
    console.error("Get academic terms error:", error);

    res.status(500).json({
      message: "Server error",
    });
  }
};


// @desc    Get terms for a specific academic session
// @route   GET /api/academic-terms/session/:sessionId
// @access  Private
export const getTermsBySession = async (req, res) => {
  try {
    const session = await AcademicSession.findOne({
      _id: req.params.sessionId,
      school: req.user.school,
    });

    if (!session) {
      return res.status(404).json({
        message: "Academic session not found",
      });
    }

    const terms = await AcademicTerm.find({
      school: req.user.school,
      academicSession: session._id,
    }).sort({ startDate: 1 });

    res.status(200).json({
      terms,
    });
  } catch (error) {
    console.error("Get terms by session error:", error);

    res.status(500).json({
      message: "Server error",
    });
  }
};


// @desc    Get single academic term
// @route   GET /api/academic-terms/:id
// @access  Private
export const getAcademicTerm = async (req, res) => {
  try {
    const term = await AcademicTerm.findOne({
      _id: req.params.id,
      school: req.user.school,
    }).populate("academicSession", "name startDate endDate");

    if (!term) {
      return res.status(404).json({
        message: "Academic term not found",
      });
    }

    res.status(200).json({
      term,
    });
  } catch (error) {
    console.error("Get academic term error:", error);

    res.status(500).json({
      message: "Server error",
    });
  }
};


// @desc    Set academic term as current
// @route   PATCH /api/academic-terms/:id/current
// @access  Private - School Admin
export const setCurrentAcademicTerm = async (req, res) => {
  try {
    const term = await AcademicTerm.findOne({
      _id: req.params.id,
      school: req.user.school,
    });

    if (!term) {
      return res.status(404).json({
        message: "Academic term not found",
      });
    }

    if (!term.isActive) {
      return res.status(400).json({
        message: "Cannot make an inactive term current",
      });
    }

    // Only one current term per school
    await AcademicTerm.updateMany(
      {
        school: req.user.school,
        _id: { $ne: term._id },
      },
      {
        $set: { isCurrent: false },
      }
    );

    term.isCurrent = true;

    await term.save();

    res.status(200).json({
      message: "Academic term set as current successfully",
      term,
    });
  } catch (error) {
    console.error("Set current academic term error:", error);

    res.status(500).json({
      message: "Server error",
    });
  }
};


// @desc    Update academic term
// @route   PUT /api/academic-terms/:id
// @access  Private - School Admin
export const updateAcademicTerm = async (req, res) => {
  try {
    const {
      academicSession,
      name,
      startDate,
      endDate,
      isCurrent,
      isActive,
    } = req.body;

    const term = await AcademicTerm.findOne({
      _id: req.params.id,
      school: req.user.school,
    });

    if (!term) {
      return res.status(404).json({
        message: "Academic term not found",
      });
    }

    const targetSessionId =
      academicSession !== undefined
        ? academicSession
        : term.academicSession;

    const session = await AcademicSession.findOne({
      _id: targetSessionId,
      school: req.user.school,
    });

    if (!session) {
      return res.status(404).json({
        message: "Academic session not found",
      });
    }

    if (name !== undefined) {
      const existingTerm = await AcademicTerm.findOne({
        school: req.user.school,
        academicSession: targetSessionId,
        name,
        _id: { $ne: term._id },
      });

      if (existingTerm) {
        return res.status(400).json({
          message: "This term already exists for this academic session",
        });
      }

      term.name = name;
    }

    if (academicSession !== undefined) {
      term.academicSession = academicSession;
    }

    if (startDate !== undefined) {
      term.startDate = startDate;
    }

    if (endDate !== undefined) {
      term.endDate = endDate;
    }

    if (new Date(term.startDate) >= new Date(term.endDate)) {
      return res.status(400).json({
        message: "End date must be after start date",
      });
    }

    if (
      new Date(term.startDate) < new Date(session.startDate) ||
      new Date(term.endDate) > new Date(session.endDate)
    ) {
      return res.status(400).json({
        message: "Term dates must fall within the academic session dates",
      });
    }

    if (isActive !== undefined) {
      term.isActive = isActive;
    }

    if (isCurrent === true) {
      if (!term.isActive) {
        return res.status(400).json({
          message: "Cannot make an inactive term current",
        });
      }

      await AcademicTerm.updateMany(
        {
          school: req.user.school,
          _id: { $ne: term._id },
        },
        {
          $set: { isCurrent: false },
        }
      );

      term.isCurrent = true;
    }

    if (isCurrent === false) {
      term.isCurrent = false;
    }

    await term.save();

    res.status(200).json({
      message: "Academic term updated successfully",
      term,
    });
  } catch (error) {
    console.error("Update academic term error:", error);

    res.status(500).json({
      message: "Server error",
    });
  }
};


// @desc    Deactivate academic term
// @route   PATCH /api/academic-terms/:id/deactivate
// @access  Private - School Admin
export const deactivateAcademicTerm = async (req, res) => {
  try {
    const term = await AcademicTerm.findOne({
      _id: req.params.id,
      school: req.user.school,
    });

    if (!term) {
      return res.status(404).json({
        message: "Academic term not found",
      });
    }

    term.isActive = false;
    term.isCurrent = false;

    await term.save();

    res.status(200).json({
      message: "Academic term deactivated successfully",
      term,
    });
  } catch (error) {
    console.error("Deactivate academic term error:", error);

    res.status(500).json({
      message: "Server error",
    });
  }
};