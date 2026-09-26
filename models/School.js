import mongoose from "mongoose";

const gradingScaleSchema = new mongoose.Schema(
  {
    min: {
      type: Number,
      required: true,
      min: 0,
    },

    max: {
      type: Number,
      required: true,
      min: 0,
    },

    grade: {
      type: String,
      required: true,
      trim: true,
    },

    remark: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    _id: false,
  }
);

const schoolSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      trim: true,
    },

    address: {
      type: String,
      trim: true,
    },

    city: {
      type: String,
      trim: true,
    },

    state: {
      type: String,
      trim: true,
    },

    country: {
      type: String,
      default: "Nigeria",
      trim: true,
    },

    logo: {
      type: String,
      default: "",
    },

    gradingSystem: {
      caMaximum: {
        type: Number,
        default: 40,
        min: 0,
      },

      examMaximum: {
        type: Number,
        default: 60,
        min: 0,
      },

      totalMaximum: {
        type: Number,
        default: 100,
        min: 1,
      },

      gradingScale: {
        type: [gradingScaleSchema],

        default: [
          {
            min: 70,
            max: 100,
            grade: "A",
            remark: "Excellent",
          },
          {
            min: 60,
            max: 69,
            grade: "B",
            remark: "Very Good",
          },
          {
            min: 50,
            max: 59,
            grade: "C",
            remark: "Good",
          },
          {
            min: 45,
            max: 49,
            grade: "D",
            remark: "Fair",
          },
          {
            min: 0,
            max: 44,
            grade: "F",
            remark: "Fail",
          },
        ],
      },
    },

    enableClassRanking: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

schoolSchema.pre("validate", function (next) {
  if (this.gradingSystem) {
    const { caMaximum, examMaximum, totalMaximum } = this.gradingSystem;

    if (caMaximum + examMaximum !== totalMaximum) {
      return next(
        new Error(
          "CA maximum and exam maximum must add up to the total maximum."
        )
      );
    }

    if (
      this.gradingSystem.gradingScale &&
      this.gradingSystem.gradingScale.length > 0
    ) {
      for (const range of this.gradingSystem.gradingScale) {
        if (range.min > range.max) {
          return next(
            new Error(
              `Invalid grading range for grade ${range.grade}: minimum cannot exceed maximum.`
            )
          );
        }
      }
    }
  }

  next();
});

const School = mongoose.model("School", schoolSchema);

export default School;