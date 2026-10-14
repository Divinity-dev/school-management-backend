import XLSX from "xlsx";
import Student from "../models/Student.js";
import AcademicSession from "../models/AcademicSession.js";
import AcademicTerm from "../models/AcademicTerm.js";
import SchoolClass from "../models/SchoolClass.js";
import Subscription from "../models/Subscription.js";
import User from "../models/User.js";
import {normalizeStudentId, isValidStudentId,} from "../utils/normalizeStudentId.js";

// Required spreadsheet headers.
// Headers are normalized, so spaces, underscores, and hyphens are ignored.
const REQUIRED_HEADERS = [
  "studentid",
  "firstname",
  "lastname",
  "dateofbirth",
  "gender",
  "admissiondate",
  "academicsession",
  "classname",
  "arm",
  "section",
];

const OPTIONAL_HEADERS = [
  "middlename",
  "parentemail",
  "address",
  "phone",
];

const normalizeHeader = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");

const clean = (value) => String(value ?? "").trim();

const normalizeClassName = (value) =>
  clean(value).toLowerCase().replace(/\s+/g, "");

const normalizeArm = (value) => clean(value).toUpperCase();

const normalizeSection = (value) => {
  const section = clean(value).toLowerCase().replace(/\s+/g, " ");

  const sections = {
    nursery: "Nursery",
    primary: "Primary",
    "junior secondary": "Junior Secondary",
    "senior secondary": "Senior Secondary",
  };

  return sections[section] || "";
};

const normalizeGender = (value) => {
  const gender = clean(value).toLowerCase();

  if (gender === "male" || gender === "m") return "Male";
  if (gender === "female" || gender === "f") return "Female";

  return "";
};

const parseDate = (value) => {
  if (!value) return null;

  let date;

  if (value instanceof Date) {
    date = value;
  } else if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);

    if (!parsed) return null;

    date = new Date(
      Date.UTC(parsed.y, parsed.m - 1, parsed.d)
    );
  } else {
    const input = clean(value);

    // Accept ISO dates and common day/month/year or month/day/year
    // formats only when the intended date is unambiguous.
    const isoMatch = input.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

    if (isoMatch) {
      const [, year, month, day] = isoMatch;
      date = new Date(
        Date.UTC(Number(year), Number(month) - 1, Number(day))
      );
    } else {
      const slashMatch = input.match(
        /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
      );

      if (!slashMatch) return null;

      const first = Number(slashMatch[1]);
      const second = Number(slashMatch[2]);
      const year = Number(slashMatch[3]);

      // Ambiguous dates such as 04/05/2014 should use YYYY-MM-DD
      // in the spreadsheet instead.
      if (first <= 12 && second <= 12) return null;

      const day = first > 12 ? first : second;
      const month = first > 12 ? second : first;

      date = new Date(Date.UTC(year, month - 1, day));
    }
  }

  if (Number.isNaN(date.getTime())) return null;

  // Verify that JavaScript did not roll an invalid date into another month.
  if (
    date.getUTCFullYear() < 1900 ||
    date.getUTCFullYear() > 2100
  ) {
    return null;
  }

  return date;
};

const formatDate = (date) => {
  if (!date) return "";

  return new Date(date).toISOString().slice(0, 10);
};

const escapeCsv = (value) => {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
};

const getSchoolId = (req) =>
  req.user?.school?._id ||
  req.user?.school ||
  req.user?.schoolId ||
  null;

const parseWorkbook = (file) => {
  if (!file?.buffer) {
    throw new Error("Please upload an Excel or CSV file.");
  }

  const workbook = XLSX.read(file.buffer, {
    type: "buffer",
    cellDates: true,
  });

  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new Error("The uploaded file contains no worksheet.");
  }

  const worksheet = workbook.Sheets[firstSheetName];

  const matrix = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: "",
    raw: true,
    blankrows: false,
  });

  if (!matrix.length || !matrix[0]?.length) {
    throw new Error("The uploaded worksheet is empty.");
  }

  const headers = matrix[0].map(normalizeHeader);

  const duplicateHeaders = headers.filter(
    (header, index) =>
      header && headers.indexOf(header) !== index
  );

  if (duplicateHeaders.length) {
    throw new Error(
      `Duplicate spreadsheet headers found: ${[
        ...new Set(duplicateHeaders),
      ].join(", ")}.`
    );
  }

  const missingHeaders = REQUIRED_HEADERS.filter(
    (header) => !headers.includes(header)
  );

  if (missingHeaders.length) {
    throw new Error(
      `Missing required columns: ${missingHeaders.join(", ")}. ` +
        "Please download and use the import template."
    );
  }

  const rows = [];

  for (let index = 1; index < matrix.length; index += 1) {
    const values = matrix[index] || [];

    const isBlank = values.every(
      (value) => clean(value) === ""
    );

    if (isBlank) continue;

    const row = {
      rowNumber: index + 1,
    };

    headers.forEach((header, columnIndex) => {
      if (header) {
        row[header] = values[columnIndex] ?? "";
      }
    });

    rows.push(row);
  }

  if (!rows.length) {
    throw new Error(
      "No student records were found below the header row."
    );
  }

  return rows;
};

const validateRows = async (rows, schoolId) => {
  const errors = [];
  const validRows = [];
  const seenIds = new Set();

  const sessions = await AcademicSession.find({
    school: schoolId,
    isActive: true,
  }).lean();

  const classes = await SchoolClass.find({
    school: schoolId,
    isActive: true,
  }).lean();

  const sessionMap = new Map(
    sessions.map((session) => [
      clean(session.name).toLowerCase(),
      session,
    ])
  );

  const classMap = new Map();

  for (const schoolClass of classes) {
    const session = sessions.find(
      (item) =>
        item._id.toString() ===
        schoolClass.academicSession?.toString()
    );

    if (!session) continue;

    const classKey = [
      clean(session.name).toLowerCase(),
      normalizeClassName(schoolClass.name),
      normalizeArm(schoolClass.arm),
      clean(schoolClass.section).toLowerCase(),
    ].join("|");

    classMap.set(classKey, schoolClass);
  }

  const existingStudents = await Student.find({
    school: schoolId,
  })
    .select("studentId")
    .lean();

const existingIds = new Set(
  existingStudents.map((student) =>
    normalizeStudentId(student.studentId)
  )
);

  const parentEmails = [
    ...new Set(
      rows
        .map((row) => clean(row.parentemail).toLowerCase())
        .filter(Boolean)
    ),
  ];

  const parentMap = new Map();

  if (parentEmails.length) {
    const parents = await User.find({
      school: schoolId,
      role: "parent",
      email: { $in: parentEmails },
    })
      .select("_id email")
      .lean();

    for (const parent of parents) {
      parentMap.set(parent.email.toLowerCase(), parent);
    }
  }

  for (const row of rows) {
    const rowErrors = [];

    const studentId = normalizeStudentId(row.studentid);
    const firstName = clean(row.firstname);
    const middleName = clean(row.middlename);
    const lastName = clean(row.lastname);
    const gender = normalizeGender(row.gender);

    const dateOfBirth = parseDate(row.dateofbirth);
    const admissionDate = parseDate(row.admissiondate);

    const sessionName = clean(row.academicsession);
    const session = sessionMap.get(sessionName.toLowerCase());

    const className = clean(row.classname);
    const arm = normalizeArm(row.arm);
    const section = normalizeSection(row.section);

 if (!studentId) {
  rowErrors.push("Student ID is required.");
} else if (!isValidStudentId(studentId)) {
  rowErrors.push(
    `Invalid Student ID "${studentId}". Use the format STU-0001, STU-0002, and so on.`
  );
} else {
  if (seenIds.has(studentId)) {
    rowErrors.push(
      `Student ID "${studentId}" appears more than once in this file.`
    );
  } else {
    seenIds.add(studentId);
  }

  if (existingIds.has(studentId)) {
    rowErrors.push(
      `Student ID "${studentId}" already exists in this school.`
    );
  }
}

    if (!firstName) {
      rowErrors.push("First name is required.");
    }

    if (!lastName) {
      rowErrors.push("Last name is required.");
    }

    if (!dateOfBirth) {
      rowErrors.push(
        "Date of birth is missing or invalid. Use YYYY-MM-DD."
      );
    }

    if (!gender) {
      rowErrors.push(
        'Gender must be "Male" or "Female".'
      );
    }

    if (!admissionDate) {
      rowErrors.push(
        "Admission date is missing or invalid. Use YYYY-MM-DD."
      );
    }

    if (!sessionName) {
      rowErrors.push("Academic session is required.");
    } else if (!session) {
      rowErrors.push(
        `Active academic session "${sessionName}" was not found in this school.`
      );
    }

    if (!className) {
      rowErrors.push("Class name is required.");
    }

    if (!section) {
      rowErrors.push(
        'Section must be Nursery, Primary, Junior Secondary, or Senior Secondary.'
      );
    }

    let schoolClass = null;

    if (session && className && section) {
      const classKey = [
        clean(session.name).toLowerCase(),
        normalizeClassName(className),
        arm,
        section.toLowerCase(),
      ].join("|");

      schoolClass = classMap.get(classKey);

      if (!schoolClass) {
        rowErrors.push(
          `Class "${className}" (${arm || "no arm"}, ${section}) was not found in session "${session.name}".`
        );
      }
    }

    const parentEmail = clean(row.parentemail).toLowerCase();
    let parent = null;

    if (parentEmail) {
      parent = parentMap.get(parentEmail);

      if (!parent) {
        rowErrors.push(
          `Parent account "${parentEmail}" was not found in this school. Leave Parent Email blank if no parent account exists yet.`
        );
      }
    }

    if (rowErrors.length) {
      errors.push({
        row: row.rowNumber,
        studentId,
        errors: rowErrors,
      });

      continue;
    }

    validRows.push({
      row: row.rowNumber,
      studentId,
      firstName,
      middleName,
      lastName,
      dateOfBirth,
      gender,
      admissionDate,
      academicSession: session,
      schoolClass,
      parent: parent?._id || null,
      address: clean(row.address),
      phone: clean(row.phone),
    });
  }

  return { validRows, errors };
};

// GET /api/students/import/template
// Downloads a blank import template.
export const downloadStudentImportTemplate = async (req, res) => {
  try {
    const headers = [
      "Student ID",
      "First Name",
      "Middle Name",
      "Last Name",
      "Date of Birth",
      "Gender",
      "Admission Date",
      "Academic Session",
      "Class Name",
      "Arm",
      "Section",
      "Parent Email",
      "Address",
      "Phone",
    ];

    const instructions = [
      ["Student Import Template Instructions"],
      ["Student IDs must use the format STU-0001, STU-0002, STU-0003, and so on. IDs are normalized to uppercase with at least four digits."],
      ["Complete one row per student on the Student Data sheet."],
      ["Required fields: Student ID, First Name, Last Name, Date of Birth, Gender, Admission Date, Academic Session, Class Name, Arm, Section."],
      ["Dates must use YYYY-MM-DD format, for example 2014-05-12."],
      ["Gender must be Male or Female."],
      ["Academic Session must match an active session in your school."],
      ["Class Name, Arm, and Section must match an active class in the selected session."],
      ["Use a Parent Email only when the parent already has an account in this school."],
      ["Import creates student records only. It does not create student portal accounts."],
      ["Do not change the column headers on the Student Data sheet."],
    ];

    const workbook = XLSX.utils.book_new();

    const instructionsSheet = XLSX.utils.aoa_to_sheet(instructions);
    XLSX.utils.book_append_sheet(
      workbook,
      instructionsSheet,
      "Instructions"
    );

    const dataSheet = XLSX.utils.aoa_to_sheet([headers]);
    dataSheet["!cols"] = headers.map(() => ({ wch: 20 }));

    XLSX.utils.book_append_sheet(
      workbook,
      dataSheet,
      "Student Data"
    );

    const buffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
      "Content-Disposition",
      'attachment; filename="student-import-template.xlsx"'
    );

    return res.send(buffer);
  } catch (error) {
    console.error("Download student import template error:", error);

    return res.status(500).json({
      message: "Unable to download the student import template.",
    });
  }
};

// POST /api/students/import/preview
// Validates uploaded rows without saving any students.
export const previewStudentImport = async (req, res) => {
  try {
    const schoolId = getSchoolId(req);

    if (!schoolId) {
      return res.status(400).json({
        message: "Your account is not linked to a school.",
      });
    }

    if (!req.file) {
  return res.status(400).json({
    message:
      "The uploaded file was not received. Please check the multipart form-data request and ensure the file field is named 'file'.",
  });
}

    const rows = parseWorkbook(req.file);
    const { validRows, errors } = await validateRows(
      rows,
      schoolId
    );

    return res.status(200).json({
      message: "Student import preview completed.",
      totalRows: rows.length,
      validCount: validRows.length,
      invalidCount: errors.length,
      validRows: validRows.map((student) => ({
        row: student.row,
        studentId: student.studentId,
        firstName: student.firstName,
        middleName: student.middleName,
        lastName: student.lastName,
        gender: student.gender,
        academicSession: student.academicSession.name,
        className: student.schoolClass.name,
        arm: student.schoolClass.arm || "",
        section: student.schoolClass.section,
      })),
      errors,
    });
  } catch (error) {
    console.error("Preview student import error:", error);

    return res.status(400).json({
      message: error.message || "Unable to preview student import.",
    });
  }
};

// POST /api/students/import/confirm
// Revalidates and imports records. No portal accounts are created.
export const confirmStudentImport = async (req, res) => {
  try {
    const schoolId = getSchoolId(req);

    if (!schoolId) {
      return res.status(400).json({
        message: "Your account is not linked to a school.",
      });
    }

    const rows = parseWorkbook(req.file);

    // Revalidate the file to prevent stale previews and duplicate imports.
    const { validRows, errors: validationErrors } =
      await validateRows(rows, schoolId);

    if (!validRows.length) {
      return res.status(400).json({
        message: "No valid student records are available to import.",
        importedCount: 0,
        skippedCount: rows.length,
        errors: validationErrors,
      });
    }

    const currentTerm = await AcademicTerm.findOne({
      school: schoolId,
      isCurrent: true,
      isActive: true,
    });

    if (!currentTerm) {
      return res.status(400).json({
        message:
          "Your school must have an active current academic term before importing students.",
      });
    }

    const subscription = await Subscription.findOne({
      school: schoolId,
      status: "active",
    });

    if (
      !subscription ||
      (subscription.expiresAt &&
        new Date(subscription.expiresAt) <= new Date())
    ) {
      return res.status(403).json({
        message:
          "Your school does not have an active subscription. Renew the subscription before importing students.",
      });
    }

    // Support the subscription field names used by common plan configurations.
    const seatLimit =
      subscription.studentLimit ??
      subscription.maxStudents ??
      subscription.studentCapacity ??
      subscription.seatLimit ??
      subscription.totalSeats ??
      subscription.numberOfStudents;

    if (!Number.isFinite(Number(seatLimit))) {
      return res.status(500).json({
        message:
          "Unable to determine your school's student capacity. Please check the subscription configuration.",
      });
    }

    const currentStudentCount = await Student.countDocuments({
      school: schoolId,
    });

    const availableSeats = Math.max(
      0,
      Number(seatLimit) - currentStudentCount
    );

    if (validRows.length > availableSeats) {
      return res.status(400).json({
        message: `You have ${availableSeats} available student seat(s), but ${validRows.length} valid record(s) are ready to import. Increase your subscription capacity or import fewer records.`,
        importedCount: 0,
        skippedCount: rows.length,
        availableSeats,
        studentLimit: Number(seatLimit),
        currentStudentCount,
        errors: validationErrors,
      });
    }

    const imported = [];
    const importErrors = [...validationErrors];

    for (const row of validRows) {
      try {
        const student = await Student.create({
          school: schoolId,
          studentId: row.studentId,
          firstName: row.firstName,
          middleName: row.middleName,
          lastName: row.lastName,
          dateOfBirth: row.dateOfBirth,
          gender: row.gender,
          admissionDate: row.admissionDate,
          academicSession: row.academicSession._id,
          schoolClass: row.schoolClass._id,
          parent: row.parent,
          address: row.address,
          phone: row.phone,
          user: null,
        });

        imported.push({
          row: row.row,
          studentId: student.studentId,
          firstName: student.firstName,
          lastName: student.lastName,
        });
      } catch (error) {
        console.error(
          `Failed to import student on row ${row.row}:`,
          error
        );

        const duplicateKey =
          error.code === 11000 ||
          error.name === "MongoServerError" &&
            error.code === 11000;

        importErrors.push({
          row: row.row,
          studentId: row.studentId,
          errors: [
            duplicateKey
              ? `Student ID "${row.studentId}" already exists. The record was skipped.`
              : error.message ||
                "The student record could not be saved.",
          ],
        });
      }
    }

    const finalStudentCount = await Student.countDocuments({
      school: schoolId,
    });

    return res.status(200).json({
      message: "Student import completed.",
      importedCount: imported.length,
      skippedCount: rows.length - imported.length,
      imported,
      errors: importErrors,
      subscriptionUsage: {
        studentLimit: Number(seatLimit),
        currentStudentCount: finalStudentCount,
        availableSeats: Math.max(
          0,
          Number(seatLimit) - finalStudentCount
        ),
      },
    });
  } catch (error) {
    console.error("Confirm student import error:", error);

    return res.status(400).json({
      message: error.message || "Unable to import students.",
    });
  }
};

// POST /api/students/import/error-report
// Accepts { errors: [...] } and returns a downloadable CSV.
export const downloadStudentImportErrorReport = async (
  req,
  res
) => {
  try {
    const errors = Array.isArray(req.body?.errors)
      ? req.body.errors
      : [];

    if (!errors.length) {
      return res.status(400).json({
        message: "There are no import errors to download.",
      });
    }

    const csvRows = [
      ["Row", "Student ID", "Errors"].map(escapeCsv).join(","),
      ...errors.map((item) =>
        [
          item.row,
          item.studentId || "",
          Array.isArray(item.errors)
            ? item.errors.join("; ")
            : item.errors || "",
        ]
          .map(escapeCsv)
          .join(",")
      ),
    ];

    const csv = "\uFEFF" + csvRows.join("\r\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");

    res.setHeader(
      "Content-Disposition",
      'attachment; filename="student-import-errors.csv"'
    );

    return res.status(200).send(csv);
  } catch (error) {
    console.error("Download student import error report error:", error);

    return res.status(500).json({
      message: "Unable to generate the student import error report.",
    });
  }
};