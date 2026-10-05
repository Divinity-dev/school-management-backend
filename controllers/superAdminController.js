import User from "../models/User.js";
import School from "../models/School.js";
import Subscription from "../models/Subscription.js";

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

        students: users.students,

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