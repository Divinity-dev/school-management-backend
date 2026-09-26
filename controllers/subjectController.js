import Subject from "../models/Subject.js";

// @desc    Create subject
// @route   POST /api/subjects
// @access  Private - School Admin
export const createSubject = async (req, res) => {
  try {
    const {
      name,
      code,
      description,
    } = req.body;

    if (!name) {
      return res.status(400).json({
        message: "Subject name is required",
      });
    }

    const normalizedName = name.trim();

    const existingSubject = await Subject.findOne({
      school: req.user.school,
      name: normalizedName,
    });

    if (existingSubject) {
      return res.status(400).json({
        message: "A subject with this name already exists",
      });
    }

    const subject = await Subject.create({
      school: req.user.school,
      name: normalizedName,
      code: code?.trim().toUpperCase() || "",
      description: description?.trim() || "",
    });

    res.status(201).json({
      message: "Subject created successfully",
      subject,
    });
  } catch (error) {
    console.error("Create subject error:", error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

// @desc    Get all subjects in school
// @route   GET /api/subjects
// @access  Private
export const getSubjects = async (req, res) => {
  try {
    const subjects = await Subject.find({
      school: req.user.school,
    }).sort({ name: 1 });

    res.status(200).json({
      subjects,
    });
  } catch (error) {
    console.error("Get subjects error:", error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

// @desc    Get single subject
// @route   GET /api/subjects/:id
// @access  Private
export const getSubject = async (req, res) => {
  try {
    const subject = await Subject.findOne({
      _id: req.params.id,
      school: req.user.school,
    });

    if (!subject) {
      return res.status(404).json({
        message: "Subject not found",
      });
    }

    res.status(200).json({
      subject,
    });
  } catch (error) {
    console.error("Get subject error:", error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

// @desc    Update subject
// @route   PUT /api/subjects/:id
// @access  Private - School Admin
export const updateSubject = async (req, res) => {
  try {
    const {
      name,
      code,
      description,
      isActive,
    } = req.body;

    const subject = await Subject.findOne({
      _id: req.params.id,
      school: req.user.school,
    });

    if (!subject) {
      return res.status(404).json({
        message: "Subject not found",
      });
    }

    if (name !== undefined) {
      const normalizedName = name.trim();

      const existingSubject = await Subject.findOne({
        school: req.user.school,
        name: normalizedName,
        _id: { $ne: subject._id },
      });

      if (existingSubject) {
        return res.status(400).json({
          message: "A subject with this name already exists",
        });
      }

      subject.name = normalizedName;
    }

    if (code !== undefined) {
      subject.code = code.trim().toUpperCase();
    }

    if (description !== undefined) {
      subject.description = description.trim();
    }

    if (isActive !== undefined) {
      subject.isActive = isActive;
    }

    await subject.save();

    res.status(200).json({
      message: "Subject updated successfully",
      subject,
    });
  } catch (error) {
    console.error("Update subject error:", error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

// @desc    Deactivate subject
// @route   PATCH /api/subjects/:id/deactivate
// @access  Private - School Admin
export const deactivateSubject = async (req, res) => {
  try {
    const subject = await Subject.findOne({
      _id: req.params.id,
      school: req.user.school,
    });

    if (!subject) {
      return res.status(404).json({
        message: "Subject not found",
      });
    }

    subject.isActive = false;

    await subject.save();

    res.status(200).json({
      message: "Subject deactivated successfully",
      subject: {
        _id: subject._id,
        name: subject.name,
        code: subject.code,
        isActive: subject.isActive,
      },
    });
  } catch (error) {
    console.error("Deactivate subject error:", error);

    res.status(500).json({
      message: "Server error",
    });
  }
};