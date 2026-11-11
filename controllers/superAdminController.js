import mongoose from "mongoose";
import User from "../models/User.js";
import Student from "../models/Student.js";
import School from "../models/School.js";
import Subscription from "../models/Subscription.js";

const DEFAULT_PRICE_PER_STUDENT = 1000;

/*
|--------------------------------------------------------------------------
| SUPER ADMIN DASHBOARD
|--------------------------------------------------------------------------
| Returns platform-wide and school-specific statistics for the Super Admin.
*/

export const getDashboardStats = async (req, res) => {
  try {
    /*
    |--------------------------------------------------------------------------
    | Basic platform counts
    |--------------------------------------------------------------------------
    */

    const [
      totalSchools,
      activeSchools,
      inactiveSchools,
      totalUsers,
      schoolAdmins,
      teachers,
      students,
      studentAccounts,
      parents,
      activeSubscriptions,
      expiredSubscriptions,
      cancelledSubscriptions,
    ] = await Promise.all([
      School.countDocuments(),

      School.countDocuments({
        isActive: true,
      }),

      School.countDocuments({
        isActive: false,
      }),

      User.countDocuments(),

      User.countDocuments({
        role: "schoolAdmin",
      }),

      User.countDocuments({
        role: "teacher",
      }),

      Student.countDocuments(),

      User.countDocuments({
        role: "student",
      }),

      User.countDocuments({
        role: "parent",
      }),

      Subscription.countDocuments({
        status: "active",
      }),

      Subscription.countDocuments({
        status: "expired",
      }),

      Subscription.countDocuments({
        status: "cancelled",
      }),
    ]);

    /*
    |--------------------------------------------------------------------------
    | Total platform revenue
    |--------------------------------------------------------------------------
    |
    | Every Subscription document represents a successful subscription
    | payment according to the current subscription architecture.
    |
    */

    const revenueResult = await Subscription.aggregate([
      {
        $match: {
          status: {
            $in: ["active", "expired", "cancelled"],
          },
        },
      },

      {
        $group: {
          _id: null,

          totalRevenue: {
            $sum: "$amount",
          },
        },
      },
    ]);

    const totalRevenue =
      revenueResult.length > 0
        ? revenueResult[0].totalRevenue
        : 0;

    /*
    |--------------------------------------------------------------------------
    | Get all schools
    |--------------------------------------------------------------------------
    */

    const schools = await School.find()
      .select(
        "name email phone city state slug isActive website createdAt"
      )
      .sort({
        createdAt: -1,
      })
      .lean();

    /*
    |--------------------------------------------------------------------------
    | User statistics by school
    |--------------------------------------------------------------------------
    |
    | Groups users by:
    | - school
    | - role
    |
    */

    const usersBySchool = await User.aggregate([
      {
        $match: {
          school: {
            $ne: null,
          },
        },
      },

      {
        $group: {
          _id: {
            school: "$school",
            role: "$role",
          },

          count: {
            $sum: 1,
          },
        },
      },
    ]);

    /*
    |--------------------------------------------------------------------------
    | Revenue by school
    |--------------------------------------------------------------------------
    */

    const studentsBySchool = await Student.aggregate([
      {
        $group: {
          _id: "$school",
          count: { $sum: 1 },
        },
      },
    ]);

    const revenueBySchool = await Subscription.aggregate([
      {
        $match: {
          school: {
            $ne: null,
          },

          status: {
            $in: ["active", "expired", "cancelled"],
          },
        },
      },

      {
        $group: {
          _id: "$school",

          revenue: {
            $sum: "$amount",
          },
        },
      },
    ]);

    /*
    |--------------------------------------------------------------------------
    | Convert aggregated user data into a lookup object
    |--------------------------------------------------------------------------
    */

    const schoolUserStats = {};

    usersBySchool.forEach((item) => {
      const schoolId = item._id.school.toString();
      const role = item._id.role;

      if (!schoolUserStats[schoolId]) {
        schoolUserStats[schoolId] = {
          schoolAdmins: 0,
          teachers: 0,
          students: 0,
          parents: 0,
        };
      }

      if (role === "schoolAdmin") {
        schoolUserStats[schoolId].schoolAdmins =
          item.count;
      }

      if (role === "teacher") {
        schoolUserStats[schoolId].teachers =
          item.count;
      }

      if (role === "student") {
        schoolUserStats[schoolId].students =
          item.count;
      }

      if (role === "parent") {
        schoolUserStats[schoolId].parents =
          item.count;
      }
    });

    const schoolStudentStats = {};

    studentsBySchool.forEach((item) => {
      schoolStudentStats[item._id.toString()] = item.count;
    });

    /*
    |--------------------------------------------------------------------------
    | Convert revenue data into a lookup object
    |--------------------------------------------------------------------------
    */

    const schoolRevenueStats = {};

    revenueBySchool.forEach((item) => {
      schoolRevenueStats[item._id.toString()] =
        item.revenue;
    });

    /*
    |--------------------------------------------------------------------------
    | Build school-specific statistics
    |--------------------------------------------------------------------------
    */

    const schoolStatistics = schools.map((school) => {
      const schoolId = school._id.toString();

      const users =
        schoolUserStats[schoolId] || {
          schoolAdmins: 0,
          teachers: 0,
          students: 0,
          parents: 0,
        };

      const revenue =
        schoolRevenueStats[schoolId] || 0;

      return {
        school: {
          _id: school._id,
          name: school.name,
          slug: school.slug,
          email: school.email,
          phone: school.phone,
          city: school.city,
          state: school.state,
          isActive: school.isActive,
          website: school.website,
          createdAt: school.createdAt,
        },

        schoolAdmins: users.schoolAdmins,

        teachers: users.teachers,

        students: schoolStudentStats[schoolId] || 0,

        studentAccounts: users.students,

        parents: users.parents,

        revenue,

        currency: "NGN",
      };
    });

    /*
    |--------------------------------------------------------------------------
    | Recent subscriptions
    |--------------------------------------------------------------------------
    */

    const recentSubscriptions =
      await Subscription.find()
        .populate("school", "name slug")
        .populate(
          "academicSession",
          "name"
        )
        .populate(
          "academicTerm",
          "name"
        )
        .select(
          "school academicSession academicTerm studentLimit amount status startsAt expiresAt createdAt"
        )
        .sort({
          createdAt: -1,
        })
        .limit(5)
        .lean();

    /*
    |--------------------------------------------------------------------------
    | Response
    |--------------------------------------------------------------------------
    */

    return res.status(200).json({
      success: true,

      statistics: {
        schools: {
          total: totalSchools,
          active: activeSchools,
          inactive: inactiveSchools,
        },

        users: {
          total: totalUsers,
          schoolAdmins,
          teachers,
          students,
          studentAccounts,
          parents,
        },

        subscriptions: {
          active: activeSubscriptions,
          expired: expiredSubscriptions,
          cancelled: cancelledSubscriptions,
        },

        revenue: {
          total: totalRevenue,
          currency: "NGN",
        },
      },

      schoolStatistics,

      recentSchools: schools.slice(0, 5),

      recentSubscriptions,
    });
  } catch (error) {
    console.error(
      "Super Admin dashboard error:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        "Failed to load Super Admin dashboard statistics.",
    });
  }
};

/*
|--------------------------------------------------------------------------
| Super Admin: school subscription pricing
|--------------------------------------------------------------------------
*/
export const getSchoolSubscriptionPricing = async (req, res) => {
  try {
    const schools = await School.find({})
      .select("name email subscriptionPricing")
      .sort({ name: 1 })
      .lean();

    return res.status(200).json({
      schools: schools.map((school) => ({
        _id: school._id,
        name: school.name,
        email: school.email,
        pricePerStudent: Number(
          school.subscriptionPricing?.isCustom
            ? school.subscriptionPricing.pricePerStudent ?? DEFAULT_PRICE_PER_STUDENT
            : DEFAULT_PRICE_PER_STUDENT
        ),
        isCustom: Boolean(school.subscriptionPricing?.isCustom),
      })),
      defaultPricePerStudent: DEFAULT_PRICE_PER_STUDENT,
      currency: "NGN",
    });
  } catch (error) {
    console.error("Get school subscription pricing error:", error);
    return res.status(500).json({
      message: "Failed to retrieve school subscription pricing.",
    });
  }
};

export const updateSchoolSubscriptionPricing = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const { pricePerStudent, useDefault = false } = req.body;

    if (!mongoose.Types.ObjectId.isValid(schoolId)) {
      return res.status(400).json({ message: "Invalid school ID." });
    }

    if (!useDefault && (
      pricePerStudent === undefined ||
      !Number.isInteger(Number(pricePerStudent)) ||
      Number(pricePerStudent) <= 0
    )) {
      return res.status(400).json({
        message: "Enter a valid subscription price greater than zero.",
      });
    }

    const school = await School.findById(schoolId);
    if (!school) {
      return res.status(404).json({ message: "School not found." });
    }

    school.subscriptionPricing = {
      pricePerStudent: useDefault ? DEFAULT_PRICE_PER_STUDENT : Number(pricePerStudent),
      isCustom: !useDefault && Number(pricePerStudent) !== DEFAULT_PRICE_PER_STUDENT,
      updatedAt: new Date(),
      updatedBy: req.user._id,
    };

    await school.save();

    return res.status(200).json({
      message: useDefault
        ? "School subscription price restored to the default."
        : "School subscription price updated successfully.",
      pricing: {
        schoolId: school._id,
        pricePerStudent: school.subscriptionPricing.pricePerStudent,
        isCustom: school.subscriptionPricing.isCustom,
      },
    });
  } catch (error) {
    console.error("Update school subscription pricing error:", error);
    return res.status(500).json({
      message: "Failed to update school subscription pricing.",
    });
  }
};
