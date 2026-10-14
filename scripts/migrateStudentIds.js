import "dotenv/config";
import mongoose from "mongoose";
import Student from "../models/Student.js";
import { normalizeStudentId } from "../utils/normalizeStudentId.js";

const APPLY_CHANGES = process.argv.includes("--apply");

const migrateStudentIds = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing from your .env file.");
    }

    await mongoose.connect(process.env.MONGODB_URI);

    console.log("Connected to MongoDB.");
    console.log(
      APPLY_CHANGES
        ? "MODE: APPLY CHANGES"
        : "MODE: PREVIEW ONLY"
    );

    const students = await Student.find({})
      .select("_id school studentId firstName lastName")
      .lean();

    console.log(`Total student records: ${students.length}`);

    const plannedChanges = [];
    const normalizedIdsBySchool = new Map();
    const conflicts = [];

    for (const student of students) {
      const currentId = String(student.studentId ?? "").trim();
      const normalizedId = normalizeStudentId(currentId);
      const schoolId = String(student.school);

      if (!normalizedIdsBySchool.has(schoolId)) {
        normalizedIdsBySchool.set(schoolId, new Map());
      }

      const schoolIds = normalizedIdsBySchool.get(schoolId);

      if (!schoolIds.has(normalizedId)) {
        schoolIds.set(normalizedId, []);
      }

      schoolIds.get(normalizedId).push(student);

      if (currentId !== normalizedId) {
        plannedChanges.push({
          _id: student._id,
          schoolId,
          currentId,
          normalizedId,
          name: `${student.firstName ?? ""} ${
            student.lastName ?? ""
          }`.trim(),
        });
      }
    }

    // Detect collisions before making any changes.
    for (const [schoolId, ids] of normalizedIdsBySchool) {
      for (const [normalizedId, records] of ids) {
        if (records.length > 1) {
          conflicts.push({
            schoolId,
            normalizedId,
            records: records.map((student) => ({
              _id: student._id,
              studentId: student.studentId,
              name: `${student.firstName ?? ""} ${
                student.lastName ?? ""
              }`.trim(),
            })),
          });
        }
      }
    }

    console.log("\nPlanned ID changes:");

    if (!plannedChanges.length) {
      console.log("All student IDs are already normalized.");
    } else {
      console.table(
        plannedChanges.map(
          ({ _id, name, currentId, normalizedId }) => ({
            recordId: String(_id),
            name,
            currentId,
            normalizedId,
          })
        )
      );
    }

    if (conflicts.length) {
      console.error(
        "\nMigration stopped: duplicate IDs would exist after normalization."
      );

      console.dir(conflicts, { depth: null });

      process.exitCode = 1;
      return;
    }

    if (!APPLY_CHANGES) {
      console.log(
        "\nPreview complete. No database records were changed."
      );
      console.log(
        "Review the output, then run with --apply to migrate."
      );
      return;
    }

    let updatedCount = 0;

    for (const change of plannedChanges) {
      
const result = await Student.collection.updateOne(
  {
    _id: change._id,
    studentId: change.currentId,
  },
  {
    $set: {
      studentId: change.normalizedId,
    },
  }
);

if (result.modifiedCount !== 1) {
  throw new Error(
    `Could not update student ${change._id} ` +
      `from "${change.currentId}" ` +
      `to "${change.normalizedId}". ` +
      `Matched: ${result.matchedCount}, ` +
      `Modified: ${result.modifiedCount}`
  );
}


      if (result.modifiedCount !== 1) {
        throw new Error(
          `Could not update student ${change._id} ` +
            `from "${change.currentId}" to "${change.normalizedId}".`
        );
      }

      updatedCount += 1;
    }

    console.log(
      `\nMigration completed. Updated ${updatedCount} student ID(s).`
    );

    const remaining = await Student.find({})
      .select("_id school studentId")
      .lean();

    const nonCanonical = remaining.filter(
      (student) =>
        String(student.studentId ?? "").trim() !==
        normalizeStudentId(student.studentId)
    );

    if (nonCanonical.length) {
      console.warn(
        `Warning: ${nonCanonical.length} non-canonical ID(s) remain.`
      );
      console.table(nonCanonical);
    } else {
      console.log("Verification passed: all student IDs are normalized.");
    }
  } catch (error) {
    console.error("Student ID migration failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

migrateStudentIds();
