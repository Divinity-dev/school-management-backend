import multer from "multer";
import XLSX from "xlsx";
import QuestionBankQuestion from "../models/QuestionBankQuestion.js";
import SubjectAssignment from "../models/SubjectAssignment.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(txt|md|csv|xlsx|xls)$/i.test(file.originalname || "");
    cb(allowed ? null : new Error("Upload a TXT, Markdown, CSV or Excel file (maximum 5 MB)."), allowed);
  },
});

const id = value => String(value?._id || value || "");
const validTypes = ["multiple_choice", "true_false", "short_answer", "essay"];
const validDifficulties = ["easy", "medium", "hard"];

const normalizeQuestion = (input = {}) => {
  const marks = Number(input.marks);
  const type = String(input.type || "multiple_choice");
  const options = Array.isArray(input.options)
    ? input.options.map((option, index) => ({
        text: String(option.text || "").trim(),
        value: String(option.value || String.fromCharCode(65 + index)).trim(),
      }))
    : [];
  if (!String(input.question || "").trim()) throw new Error("Every question needs question text.");
  if (!validTypes.includes(type)) throw new Error("Choose a supported question type.");
  if (!Number.isInteger(marks) || marks < 1) throw new Error("Every question must carry a positive whole-number mark.");
  if (["multiple_choice", "true_false"].includes(type)) {
    if (options.length < 2 || options.some(option => !option.text) || !options.some(option => option.value === String(input.correctAnswer || ""))) {
      throw new Error("Objective questions need at least two complete options and a selected correct answer.");
    }
  }
  if (type === "short_answer" && !String(input.correctAnswer || "").trim()) {
    throw new Error("Short-answer questions need a correct answer.");
  }
  return {
    question: String(input.question).trim(),
    type,
    options,
    correctAnswer: String(input.correctAnswer || "").trim(),
    acceptedAnswers: Array.isArray(input.acceptedAnswers) ? input.acceptedAnswers.map(value => String(value).trim()).filter(Boolean) : [],
    explanation: String(input.explanation || "").trim(),
    marks,
    topic: String(input.topic || "General").trim().slice(0, 200) || "General",
    difficulty: validDifficulties.includes(input.difficulty) ? input.difficulty : "medium",
  };
};

const getAssignment = async (req, subjectAssignmentId) => {
  if (!subjectAssignmentId) throw new Error("Select a subject and class first.");
  const filter = { _id: subjectAssignmentId, isActive: true };
  if (req.user.role !== "superAdmin") filter.school = req.user.school;
  const assignment = await SubjectAssignment.findOne(filter).populate("subject", "name").populate("schoolClass", "name arm");
  if (!assignment) throw new Error("Active subject assignment not found in your school.");
  if (req.user.role === "teacher" && id(assignment.teacher) !== id(req.user._id)) {
    throw new Error("You can only manage questions for your assigned subjects.");
  }
  return assignment;
};

const canManage = (req, question) => {
  if (question.visibility === "shared" || !question.school) return req.user.role === "superAdmin";
  if (id(question.school) !== id(req.user.school)) return false;
  return req.user.role === "schoolAdmin" || (req.user.role === "teacher" && id(question.createdBy) === id(req.user._id));
};

const readMaterial = (file) => {
  if (!file) return "";
  const ext = String(file.originalname || "").split(".").pop().toLowerCase();
  if (["txt", "md"].includes(ext)) return file.buffer.toString("utf8").slice(0, 40000);
  const workbook = XLSX.read(file.buffer, { type: "buffer" });
  return workbook.SheetNames.map(name => XLSX.utils.sheet_to_csv(workbook.Sheets[name])).join("\n").slice(0, 40000);
};

export const uploadQuestionMaterial = upload.single("material");
export const uploadQuestionImport = upload.single("file");

export const listQuestionBank = async (req, res) => {
  try {
    const filter = { status: "approved" };
    if (req.query.subjectAssignmentId) {
      const assignment = await getAssignment(req, req.query.subjectAssignmentId);
      const subjectName = String(assignment.subject?.name || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const className = String(assignment.schoolClass?.name || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { school: req.user.school, visibility: "school", subjectAssignment: assignment._id },
        { school: null, visibility: "shared", subjectName: new RegExp("^" + subjectName + "$", "i"), className: new RegExp("^" + className + "$", "i") },
      ];
    } else {
      filter.$or = [
        { school: req.user.school, visibility: "school" },
        { school: null, visibility: "shared" },
      ];
    }
    if (req.query.subject) filter.subject = req.query.subject;
    if (req.query.schoolClass) filter.schoolClass = req.query.schoolClass;
    if (req.query.topic) filter.topic = new RegExp(String(req.query.topic).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    if (req.query.difficulty) filter.difficulty = req.query.difficulty;
    if (req.query.type) filter.type = req.query.type;
    if (req.query.search) {
      const term = String(req.query.search).slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$and = [{ $or: [{ question: new RegExp(term, "i") }, { topic: new RegExp(term, "i") }] }];
    }
    const questions = await QuestionBankQuestion.find(filter)
      .populate("subject", "name code")
      .populate("schoolClass", "name arm")
      .populate("createdBy", "firstName lastName")
      .sort({ updatedAt: -1 })
      .limit(300);
    return res.json({ questions });
  } catch (error) {
    return res.status(400).json({ message: error.message || "Unable to load the question bank." });
  }
};

export const createBankQuestion = async (req, res) => {
  try {
    const question = normalizeQuestion(req.body);
    if (req.user.role === "superAdmin" && req.body.visibility === "shared") {
      const subjectName = String(req.body.subjectName || "").trim();
      const className = String(req.body.className || "").trim();
      if (!subjectName || !className) return res.status(400).json({ message: "Shared questions need a subject name and class name." });
      const saved = await QuestionBankQuestion.create({
        ...question, school: null, subject: null, schoolClass: null, subjectAssignment: null,
        subjectName, className, visibility: "shared", source: req.body.source === "ai" ? "ai" : "manual",
        createdBy: req.user._id, status: "approved",
      });
      return res.status(201).json({ message: "Question published to the shared SchoolPilot bank.", question: saved });
    }
    const assignment = await getAssignment(req, req.body.subjectAssignmentId);
    const saved = await QuestionBankQuestion.create({
      ...question,
      school: assignment.school,
      subject: assignment.subject._id || assignment.subject,
      subjectName: assignment.subject?.name || "Subject",
      schoolClass: assignment.schoolClass._id || assignment.schoolClass,
      className: assignment.schoolClass?.name || "Class",
      subjectAssignment: assignment._id,
      visibility: "school",
      source: ["manual", "ai", "import"].includes(req.body.source) ? req.body.source : "manual",
      createdBy: req.user._id,
      status: "approved",
    });
    return res.status(201).json({ message: "Question saved to the question bank.", question: saved });
  } catch (error) {
    return res.status(400).json({ message: error.message || "Unable to save this question." });
  }
};

export const updateBankQuestion = async (req, res) => {
  try {
    const question = await QuestionBankQuestion.findById(req.params.questionId);
    if (!question) return res.status(404).json({ message: "Question not found." });
    if (!canManage(req, question)) return res.status(403).json({ message: "You cannot manage this question." });
    const normalized = normalizeQuestion({ ...question.toObject(), ...req.body });
    Object.assign(question, normalized, { updatedBy: req.user._id });
    await question.save();
    return res.json({ message: "Question updated.", question });
  } catch (error) {
    return res.status(400).json({ message: error.message || "Unable to update this question." });
  }
};

export const deleteBankQuestion = async (req, res) => {
  try {
    const question = await QuestionBankQuestion.findById(req.params.questionId);
    if (!question) return res.status(404).json({ message: "Question not found." });
    if (!canManage(req, question)) return res.status(403).json({ message: "You cannot manage this question." });
    question.status = "archived";
    question.updatedBy = req.user._id;
    await question.save();
    return res.json({ message: "Question archived." });
  } catch (error) {
    return res.status(500).json({ message: "Unable to archive question." });
  }
};

export const generateBankQuestions = async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({ message: "AI question generation is not configured yet. Add OPENAI_API_KEY to the backend environment." });
    }
    const assignment = await getAssignment(req, req.body.subjectAssignmentId);
    const material = (req.body.materialText || readMaterial(req.file) || "").trim().slice(0, 40000);
    const topics = Array.isArray(req.body.topics) ? req.body.topics.join(", ") : String(req.body.topics || "").trim();
    if (!topics && !material) return res.status(400).json({ message: "Provide at least one topic or upload/paste learning material." });
    const count = Math.min(50, Math.max(1, Math.trunc(Number(req.body.count) || 10)));
    const difficulty = validDifficulties.includes(req.body.difficulty) ? req.body.difficulty : "medium";
    const requestedTypes = (Array.isArray(req.body.types) ? req.body.types : typeof req.body.types === "string" ? [req.body.types] : ["multiple_choice"]).filter(type => validTypes.includes(type));
    const prompt = [
      "You are an experienced Nigerian school assessment writer.",
      "Create original, age-appropriate assessment questions aligned to the selected subject and class.",
      "Return valid JSON only with this shape: { \"questions\": [{ \"question\": string, \"type\": \"multiple_choice\"|\"true_false\"|\"short_answer\"|\"essay\", \"options\": [{\"text\":string,\"value\":string}], \"correctAnswer\":string, \"acceptedAnswers\":string[], \"explanation\":string, \"marks\":integer, \"topic\":string, \"difficulty\":\"easy\"|\"medium\"|\"hard\" }] }.",
      "Every marks value must be a positive whole number. Never use decimal marks.",
      "Objective questions must include at least two options and correctAnswer must equal one option value.",
      "For essay questions, options must be empty and correctAnswer may be empty.",
      "Do not invent facts beyond the supplied learning material. If material is supplied, base the questions on it.",
      "Class: " + (assignment.schoolClass?.name || "School class") + " " + (assignment.schoolClass?.arm || ""),
      "Subject: " + (assignment.subject?.name || "Subject"),
      "Topics: " + (topics || "Derive the topics from the supplied material"),
      "Question count: " + count,
      "Preferred difficulty: " + difficulty,
      "Allowed question types: " + (requestedTypes.length ? requestedTypes.join(", ") : "multiple_choice"),
      "Learning material:\n" + material,
    ].join("\n\n");
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_QUESTION_MODEL || "gpt-4.1-mini",
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Return only valid JSON. Follow the requested schema exactly." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error("AI question generation failed:", response.status, detail.slice(0, 500));
      return res.status(502).json({ message: "The AI provider could not generate questions right now. Please try again." });
    }
    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    const generated = (Array.isArray(parsed.questions) ? parsed.questions : []).slice(0, count).map(item => {
      const question = normalizeQuestion(item);
      return { ...question, source: "ai", status: "draft" };
    });
    if (!generated.length) return res.status(502).json({ message: "The AI did not return usable questions. Please adjust the topic or material and try again." });
    return res.json({ questions: generated, count: generated.length, message: "Review every generated question before saving it to your bank." });
  } catch (error) {
    return res.status(400).json({ message: error.message || "Unable to generate questions." });
  }
};

export const importBankQuestions = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Choose a CSV or Excel question file." });
    if (!/\\.(csv|xlsx|xls)$/i.test(req.file.originalname || "")) return res.status(400).json({ message: "Question imports must be CSV or Excel files." });
    const assignment = await getAssignment(req, req.body.subjectAssignmentId);
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });
    if (!rows.length) return res.status(400).json({ message: "The uploaded file contains no question rows." });
    if (rows.length > 500) return res.status(400).json({ message: "Import up to 500 questions at a time." });
    const documents = [];
    const errors = [];
    rows.forEach((row, index) => {
      try {
        const options = String(row.Options || row.options || "").split("|").map((text, i) => ({ text: text.trim(), value: String.fromCharCode(65 + i) })).filter(option => option.text);
        const normalized = normalizeQuestion({
          question: row.Question || row.question,
          type: row.Type || row.type || "multiple_choice",
          options,
          correctAnswer: row["Correct Answer"] || row.correctAnswer || "A",
          acceptedAnswers: String(row["Accepted Answers"] || "").split("|").filter(Boolean),
          explanation: row.Explanation || row.explanation || "",
          marks: row.Marks || row.marks || 1,
          topic: row.Topic || row.topic || "General",
          difficulty: String(row.Difficulty || row.difficulty || "medium").toLowerCase(),
        });
        documents.push({
          ...normalized, school: assignment.school, subject: assignment.subject._id || assignment.subject,
          subjectName: assignment.subject?.name || "Subject",
          schoolClass: assignment.schoolClass._id || assignment.schoolClass,
          className: assignment.schoolClass?.name || "Class", subjectAssignment: assignment._id,
          createdBy: req.user._id, source: "import", visibility: "school", status: "approved",
        });
      } catch (error) {
        errors.push({ row: index + 2, message: error.message });
      }
    });
    const inserted = documents.length ? await QuestionBankQuestion.insertMany(documents, { ordered: false }) : [];
    return res.status(201).json({
      message: `${inserted.length} question(s) imported.`,
      imported: inserted.length,
      rejected: errors.length,
      errors: errors.slice(0, 30),
    });
  } catch (error) {
    return res.status(400).json({ message: error.message || "Unable to import questions." });
  }
};
