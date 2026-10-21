import mongoose from "mongoose";

const schoolTermSettingSchema = new mongoose.Schema(
{
school: {
type: mongoose.Schema.Types.ObjectId,
ref: "School",
required: true,
index: true,
},


academicSession: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "AcademicSession",
  required: true,
  index: true,
},

academicTerm: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "AcademicTerm",
  required: true,
  index: true,
},

// Null means the system calculates the value automatically.
// A number means the school administrator has set a manual override.
schoolDaysOpenedOverride: {
  type: Number,
  min: 0,
  default: null,
  validate: {
    validator(value) {
      return value === null || Number.isInteger(value);
    },
    message: "School days opened must be a whole number.",
  },
},

enteredBy: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "User",
  default: null,
},

updatedBy: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "User",
  default: null,
},


},
{
timestamps: true,
}
);

// Only one school-days setting per school, session and term.
schoolTermSettingSchema.index(
{
school: 1,
academicSession: 1,
academicTerm: 1,
},
{
unique: true,
}
);

const SchoolTermSetting = mongoose.model(
"SchoolTermSetting",
schoolTermSettingSchema
);

export default SchoolTermSetting;
