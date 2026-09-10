import School from "../models/School.js";

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

    const existingSchool = await School.findOne({
      email: email.toLowerCase(),
    });

    if (existingSchool) {
      return res.status(400).json({
        message: "A school with this email already exists",
      });
    }

    const school = await School.create({
      name,
      email: email.toLowerCase(),
      phone,
      address,
      city,
      state,
      country,
    });

    res.status(201).json({
      message: "School created successfully",
      school,
    });
  } catch (error) {
    console.error("Create school error:", error);

    res.status(500).json({
      message: "Server error while creating school",
    });
  }
};