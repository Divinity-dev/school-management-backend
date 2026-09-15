import mongoose from "mongoose";
import FeeStructure from "../models/FeeStructure.js";
import AcademicSession from "../models/AcademicSession.js";
import AcademicTerm from "../models/AcademicTerm.js";
import SchoolClass from "../models/SchoolClass.js";

const getSchoolId = (req) => {
return req.user?.school?._id || req.user?.school;
};

const validateFeeItems = (items) => {
if (!Array.isArray(items) || items.length === 0) {
return "At least one fee item is required.";
}

for (const item of items) {
if (
!item.name ||
typeof item.name !== "string" ||
item.amount === undefined
) {
return "Each fee item must have a name and amount.";
}


if (
  typeof item.amount !== "number" ||
  !Number.isFinite(item.amount) ||
  item.amount < 0
) {
  return "Each fee item amount must be a valid non-negative number.";
}


}

return null;
};

const validateSchoolClasses = async (schoolClasses, schoolId) => {
if (!Array.isArray(schoolClasses) || schoolClasses.length === 0) {
return {
error: "At least one school class is required.",
};
}

if (
schoolClasses.some(
(classId) => !mongoose.Types.ObjectId.isValid(classId)
)
) {
return {
error: "One or more school class IDs are invalid.",
};
}

const uniqueClassIds = [
...new Set(schoolClasses.map((classId) => classId.toString())),
];

if (uniqueClassIds.length !== schoolClasses.length) {
return {
error: "Duplicate school classes are not allowed.",
};
}

const classRecords = await SchoolClass.find({
_id: { $in: uniqueClassIds },
school: schoolId,
});

if (classRecords.length !== uniqueClassIds.length) {
return {
error: "One or more school classes were not found in this school.",
};
}

return {
classIds: uniqueClassIds,
};
};

const calculateTotalAmount = (items) => {
return items.reduce((total, item) => total + item.amount, 0);
};

const getPopulatedFeeStructure = (id) => {
return FeeStructure.findById(id)
.populate("academicSession", "name")
.populate("academicTerm", "name academicSession")
.populate("schoolClasses", "name arm section");
};

export const createFeeStructure = async (req, res) => {
try {
const schoolId = getSchoolId(req);


const {
  academicSession,
  academicTerm,
  schoolClasses,
  items,
} = req.body;

if (!schoolId) {
  return res.status(400).json({
    message: "School information is missing.",
  });
}

if (!academicSession || !academicTerm || !schoolClasses || !items) {
  return res.status(400).json({
    message:
      "Academic session, academic term, school classes, and fee items are required.",
  });
}

const itemError = validateFeeItems(items);

if (itemError) {
  return res.status(400).json({
    message: itemError,
  });
}

const classValidation = await validateSchoolClasses(
  schoolClasses,
  schoolId
);

if (classValidation.error) {
  return res.status(400).json({
    message: classValidation.error,
  });
}

const classIds = classValidation.classIds;

const session = await AcademicSession.findOne({
  _id: academicSession,
  school: schoolId,
});

if (!session) {
  return res.status(404).json({
    message: "Academic session not found in this school.",
  });
}

const term = await AcademicTerm.findOne({
  _id: academicTerm,
  school: schoolId,
  academicSession,
});

if (!term) {
  return res.status(404).json({
    message:
      "Academic term not found for this session and school.",
  });
}

const existingFeeStructure = await FeeStructure.findOne({
  school: schoolId,
  academicSession,
  academicTerm,
  schoolClasses: { $in: classIds },
});

if (existingFeeStructure) {
  return res.status(400).json({
    message:
      "A fee structure already exists for one or more selected classes in this academic session and term.",
  });
}

const cleanedItems = items.map((item) => ({
  name: item.name.trim(),
  amount: item.amount,
}));

const totalAmount = calculateTotalAmount(cleanedItems);

const feeStructure = await FeeStructure.create({
  school: schoolId,
  academicSession,
  academicTerm,
  schoolClasses: classIds,
  items: cleanedItems,
  totalAmount,
});

const populatedFeeStructure = await getPopulatedFeeStructure(
  feeStructure._id
);

return res.status(201).json({
  message: "Fee structure created successfully.",
  feeStructure: populatedFeeStructure,
});


} catch (error) {
console.error("Create fee structure error:", error);


return res.status(500).json({
  message: "Server error while creating fee structure.",
});


}
};

export const updateFeeStructure = async (req, res) => {
try {
const schoolId = getSchoolId(req);
const { feeStructureId } = req.params;


const {
  academicSession,
  academicTerm,
  schoolClasses,
  items,
} = req.body;

if (!schoolId) {
  return res.status(400).json({
    message: "School information is missing.",
  });
}

const feeStructure = await FeeStructure.findOne({
  _id: feeStructureId,
  school: schoolId,
});

if (!feeStructure) {
  return res.status(404).json({
    message: "Fee structure not found.",
  });
}

if (!academicSession || !academicTerm || !schoolClasses || !items) {
  return res.status(400).json({
    message:
      "Academic session, academic term, school classes, and fee items are required.",
  });
}

const itemError = validateFeeItems(items);

if (itemError) {
  return res.status(400).json({
    message: itemError,
  });
}

const classValidation = await validateSchoolClasses(
  schoolClasses,
  schoolId
);

if (classValidation.error) {
  return res.status(400).json({
    message: classValidation.error,
  });
}

const classIds = classValidation.classIds;

const session = await AcademicSession.findOne({
  _id: academicSession,
  school: schoolId,
});

if (!session) {
  return res.status(404).json({
    message: "Academic session not found in this school.",
  });
}

const term = await AcademicTerm.findOne({
  _id: academicTerm,
  school: schoolId,
  academicSession,
});

if (!term) {
  return res.status(404).json({
    message:
      "Academic term not found for this session and school.",
  });
}

const duplicate = await FeeStructure.findOne({
  school: schoolId,
  academicSession,
  academicTerm,
  schoolClasses: { $in: classIds },
  _id: { $ne: feeStructureId },
});

if (duplicate) {
  return res.status(400).json({
    message:
      "Another fee structure already exists for one or more selected classes in this academic session and term.",
  });
}

const cleanedItems = items.map((item) => ({
  name: item.name.trim(),
  amount: item.amount,
}));

const totalAmount = calculateTotalAmount(cleanedItems);

feeStructure.academicSession = academicSession;
feeStructure.academicTerm = academicTerm;
feeStructure.schoolClasses = classIds;
feeStructure.items = cleanedItems;
feeStructure.totalAmount = totalAmount;

await feeStructure.save();

const populatedFeeStructure = await getPopulatedFeeStructure(
  feeStructure._id
);

return res.status(200).json({
  message: "Fee structure updated successfully.",
  feeStructure: populatedFeeStructure,
});
} catch (error) {
console.error("Update fee structure error:", error);
return res.status(500).json({
  message: "Server error while updating fee structure.",
});


}
};
