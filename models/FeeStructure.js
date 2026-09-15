import mongoose from "mongoose";

const feeItemSchema = new mongoose.Schema(
{
name: {
type: String,
required: true,
trim: true,
},

amount: {
  type: Number,
  required: true,
  min: 0,
},


},
{
_id: true,
}
);

const feeStructureSchema = new mongoose.Schema(
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

schoolClasses: {
  type: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SchoolClass",
    },
  ],
  required: true,
  validate: [
    {
      validator: (classes) => classes.length > 0,
      message: "At least one class is required.",
    },
    {
      validator: (classes) => {
        const uniqueClasses = new Set(
          classes.map((classId) => classId.toString())
        );

        return uniqueClasses.size === classes.length;
      },
      message: "Duplicate classes are not allowed.",
    },
  ],
},

items: {
  type: [feeItemSchema],
  required: true,
  validate: {
    validator: (items) => items.length > 0,
    message: "At least one fee item is required.",
  },
},

totalAmount: {
  type: Number,
  required: true,
  min: 0,
},

isActive: {
  type: Boolean,
  default: true,
  index: true,
},


},
{
timestamps: true,
}
);

feeStructureSchema.index({
school: 1,
academicSession: 1,
academicTerm: 1,
});

const FeeStructure = mongoose.model(
"FeeStructure",
feeStructureSchema
);

export default FeeStructure;
