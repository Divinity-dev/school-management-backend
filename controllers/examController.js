import Exam from "../models/Exam.js";
import ExamSubmission from "../models/ExamSubmission.js";
import SubjectAssignment from "../models/SubjectAssignment.js";
import SchoolClass from "../models/SchoolClass.js";
import AcademicTerm from "../models/AcademicTerm.js";
import Student from "../models/Student.js";
import School from "../models/School.js";
import Result from "../models/Result.js";

const id = value => String(value?._id || value || "");
const canManage = (user, exam) =>
  user.role === "schoolAdmin" || (user.role === "teacher" && id(exam.createdBy) === id(user._id));

const publicQuestions = questions => questions.map(({ _id, question, type, options, marks, order }) =>
  ({ _id, question, type, options, marks, order }));

const safeSubmission = submission => ({
  _id: submission._id, status: submission.status, gradingStatus: submission.gradingStatus,
  startedAt: submission.startedAt, expiresAt: submission.expiresAt, submittedAt: submission.submittedAt,
  score: submission.score, maxScore: submission.maxScore, percentage: submission.percentage,
});

const getStudent = req => Student.findOne({ user: req.user._id, school: req.user.school, isActive: true });

const syncFormalExamScore = async ({ exam, student, submission }) => {
  if (submission.gradingStatus !== "graded" || submission.score === null) return { synced: false, reason: "PENDING_MANUAL_GRADING" };
  const school = await School.findById(exam.school).select("gradingSystem");
  const grading = school?.gradingSystem;
  const examMaximum = Number(grading?.examMaximum);
  if (!Number.isFinite(examMaximum) || examMaximum <= 0) return { synced: false, reason: "INVALID_EXAM_MAXIMUM" };

  let result = await Result.findOne({
    school: exam.school, student: student._id, schoolClass: exam.schoolClass,
    subject: exam.subject, academicSession: exam.academicSession, academicTerm: exam.academicTerm,
  });
  if (result && result.status !== "draft") return { synced: false, reason: "RESULT_NOT_DRAFT" };
  if (result && (result.examScoreSource === "manual" || (result.examScoreSource === "pending" && Number(result.examScore) > 0))) return { synced: false, reason: "MANUAL_SCORE_PRESERVED" };

  const examScore = Number(((Number(submission.percentage) / 100) * examMaximum).toFixed(2));
  const assessmentScores = result?.assessmentScores?.length ? result.assessmentScores :
    (grading.caComponents || []).map(component => ({ name: component.name, score: 0, maximum: Number(component.maximum) }));
  const caScore = assessmentScores.reduce((sum, item) => sum + Number(item.score || 0), 0);
  const total = Number((caScore + examScore).toFixed(2));
  const rule = (grading.gradingScale || []).find(item => total >= Number(item.min) && total <= Number(item.max));
  if (!rule) return { synced: false, reason: "GRADING_RULE_NOT_FOUND" };
  const gradingSystem = {
    caMaximum: Number(grading.caMaximum), examMaximum, totalMaximum: Number(grading.totalMaximum),
    caComponents: (grading.caComponents || []).map(item => ({ name: item.name, maximum: Number(item.maximum) })),
    gradingScale: (grading.gradingScale || []).map(item => ({ min: Number(item.min), max: Number(item.max), grade: item.grade, remark: item.remark })),
  };
  if (!result) {
    result = await Result.create({
      school: exam.school, student: student._id, schoolClass: exam.schoolClass, subject: exam.subject,
      academicSession: exam.academicSession, academicTerm: exam.academicTerm,
      assessmentScores, caScore, examScore, examScoreSource: "formal_exam", total,
      grade: rule.grade, remark: rule.remark, gradingSystem, status: "draft", enteredBy: exam.createdBy,
    });
  } else {
    Object.assign(result, { assessmentScores, caScore, examScore, examScoreSource: "formal_exam", total, grade: rule.grade, remark: rule.remark, gradingSystem });
    await result.save();
  }
  submission.resultSynced = true;
  await submission.save();
  return { synced: true, examScore, total, grade: rule.grade };
};

const calculate = (exam, answers) => {
  let autoScore = 0;
  let pendingManual = false;
  for (const question of exam.questions) {
    const answer = String(answers.find(item => id(item.questionId) === id(question._id))?.answer || "").trim();
    if (question.type === "essay") { pendingManual = true; continue; }
    if (question.type === "short_answer") {
      const accepted = [question.correctAnswer, ...(question.acceptedAnswers || [])].map(v => String(v).trim().toLowerCase());
      if (answer && accepted.includes(answer.toLowerCase())) autoScore += Number(question.marks);
    } else if (answer === String(question.correctAnswer)) autoScore += Number(question.marks);
  }
  return { autoScore: Number(autoScore.toFixed(2)), pendingManual };
};

export const createExam = async (req, res) => {
  try {
    const { subjectAssignmentId, academicTerm, title, instructions = "", startsAt, endsAt, durationMinutes, questions, shuffleQuestions = false, showResultsImmediately = false } = req.body;
    if (!subjectAssignmentId || !academicTerm || !title?.trim() || !startsAt || !endsAt || !Array.isArray(questions) || !questions.length) {
      return res.status(400).json({ message: "Subject/class assignment, term, title, schedule and questions are required." });
    }
    const assignment = await SubjectAssignment.findOne({ _id: subjectAssignmentId, school: req.user.school, isActive: true });
    if (!assignment) return res.status(404).json({ message: "Active subject assignment not found in your school." });
    const schoolClass = await SchoolClass.findOne({ _id: assignment.schoolClass, school: req.user.school, isActive: true });
    const isSubjectTeacher = id(assignment.teacher) === id(req.user._id);
    const isClassTeacher = id(schoolClass?.classTeacher) === id(req.user._id);
    if (!isSubjectTeacher && !isClassTeacher) return res.status(403).json({ message: "You can create exams only for your assigned subjects or classes where you are the class teacher." });
    const term = await AcademicTerm.findOne({ _id: academicTerm, school: req.user.school, academicSession: assignment.academicSession, isActive: true });
    if (!term) return res.status(400).json({ message: "Select an active term belonging to this class session." });
    const start = new Date(startsAt), end = new Date(endsAt), duration = Number(durationMinutes);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return res.status(400).json({ message: "Exam end time must be after its start time." });
    if (!Number.isInteger(duration) || duration < 1 || duration > 300) return res.status(400).json({ message: "Exam duration must be between 1 and 300 minutes." });
    const validTypes = ["multiple_choice", "true_false", "short_answer", "essay"];
    let totalMarks = 0;
    for (const q of questions) {
      const marks = Number(q.marks);
      if (!q.question?.trim() || !validTypes.includes(q.type) || !Number.isInteger(marks) || marks < 1) return res.status(400).json({ message: "Check every question, type and mark value." });
      if (["multiple_choice", "true_false"].includes(q.type) && (!Array.isArray(q.options) || q.options.length < 2 || !q.options.some(o => o.value === q.correctAnswer))) return res.status(400).json({ message: "Every objective question needs options and a correct answer." });
      if (q.type === "short_answer" && !String(q.correctAnswer || "").trim()) return res.status(400).json({ message: "Short-answer questions need a correct answer." });
      totalMarks += marks;
    }
    const exam = await Exam.create({
      school: req.user.school, academicSession: assignment.academicSession, academicTerm: term._id,
      schoolClass: assignment.schoolClass, subject: assignment.subject, subjectAssignment: assignment._id,
      createdBy: req.user._id, title: title.trim(), instructions, startsAt: start, endsAt: end,
      durationMinutes: duration, totalMarks, questions, shuffleQuestions: Boolean(shuffleQuestions),
      showResultsImmediately: Boolean(showResultsImmediately), status: "pending_approval",
    });
    return res.status(201).json({ message: "Examination submitted to the school administrator for approval.", exam });
  } catch (error) { return res.status(500).json({ message: error.message || "Failed to create examination." }); }
};

export const getTeacherExams = async (req, res) => {
  try {
    const filter = { school: req.user.school };
    if (req.user.role === "teacher") filter.createdBy = req.user._id;
    const exams = await Exam.find(filter).populate("schoolClass", "name arm").populate("subject", "name code").populate("academicTerm", "name").sort({ createdAt: -1 });
    return res.json({ exams });
  } catch (error) { return res.status(500).json({ message: "Failed to fetch examinations." }); }
};

export const getAdminExams = async (req, res) => {
  try {
    const exams = await Exam.find({ school: req.user.school })
      .populate("schoolClass", "name arm").populate("subject", "name code")
      .populate("academicTerm", "name").populate("createdBy", "firstName lastName")
      .populate("approvedBy", "firstName lastName").sort({ createdAt: -1 });
    return res.json({ exams });
  } catch (error) { return res.status(500).json({ message: "Failed to fetch examinations for approval." }); }
};

export const approveExam = async (req, res) => {
  try {
    const exam = await Exam.findOne({ _id: req.params.examId, school: req.user.school });
    if (!exam) return res.status(404).json({ message: "Examination not found." });
    if (!["pending_approval", "draft"].includes(exam.status)) return res.status(400).json({ message: "Only examinations awaiting approval can be approved." });
    exam.status = "published";
    exam.approvalNote = "";
    exam.approvedBy = req.user._id;
    exam.approvedAt = new Date();
    await exam.save();
    return res.json({ message: "Examination approved and published for students.", exam });
  } catch (error) { return res.status(500).json({ message: "Unable to approve examination." }); }
};

export const rejectExam = async (req, res) => {
  try {
    const exam = await Exam.findOne({ _id: req.params.examId, school: req.user.school });
    if (!exam) return res.status(404).json({ message: "Examination not found." });
    if (!["pending_approval", "draft"].includes(exam.status)) return res.status(400).json({ message: "Only examinations awaiting approval can be rejected." });
    exam.status = "rejected";
    exam.approvalNote = String(req.body.note || "").trim().slice(0, 1000);
    exam.approvedBy = req.user._id;
    exam.approvedAt = new Date();
    await exam.save();
    return res.json({ message: "Examination returned to the teacher.", exam });
  } catch (error) { return res.status(500).json({ message: "Unable to reject examination." }); }
};

export const getStudentExams = async (req, res) => {
  try {
    const student = await getStudent(req);
    if (!student) return res.status(404).json({ message: "Student profile not found." });
    const exams = await Exam.find({ school: req.user.school, schoolClass: student.schoolClass, status: { $in: ["published", "closed"] } })
      .populate("subject", "name code").populate("schoolClass", "name arm").populate("academicTerm", "name").sort({ startsAt: 1 });
    const submissions = await ExamSubmission.find({ student: student._id, exam: { $in: exams.map(e => e._id) } });
    const byExam = new Map(submissions.map(s => [id(s.exam), s]));
    return res.json({ exams: exams.filter(exam => exam.status === "published" || byExam.has(id(exam))).map(exam => ({ ...exam.toObject(), questions: undefined, submission: byExam.has(id(exam)) ? safeSubmission(byExam.get(id(exam))) : null })) });
  } catch (error) { return res.status(500).json({ message: "Failed to fetch your examinations." }); }
};

export const getExam = async (req, res) => {
  try {
    const exam = await Exam.findOne({ _id: req.params.examId, school: req.user.school })
      .populate("subject", "name code").populate("schoolClass", "name arm").populate("academicTerm", "name");
    if (!exam) return res.status(404).json({ message: "Examination not found." });
    if (req.user.role === "student") {
      const student = await getStudent(req);
      const existingAttempt = student ? await ExamSubmission.exists({ exam: exam._id, student: student._id }) : null;
      if (!student || id(student.schoolClass) !== id(exam.schoolClass) || (exam.status !== "published" && !existingAttempt)) return res.status(403).json({ message: "You cannot access this examination." });
      return res.json({ exam: { ...exam.toObject(), questions: undefined } });
    }
    if (req.user.role === "teacher" && !canManage(req.user, exam)) return res.status(403).json({ message: "You cannot access this examination." });
    return res.json({ exam });
  } catch (error) { return res.status(500).json({ message: "Failed to fetch examination." }); }
};

export const publishExam = async (req, res) => {
  const exam = await Exam.findOne({ _id: req.params.examId, school: req.user.school });
  if (!exam) return res.status(404).json({ message: "Examination not found." });
  if (req.user.role !== "schoolAdmin") return res.status(403).json({ message: "Only a school administrator can approve and publish examinations." });
  if (!["pending_approval", "draft"].includes(exam.status)) return res.status(400).json({ message: "Only examinations awaiting approval can be published." });
  exam.approvedBy = req.user._id;
  exam.approvedAt = new Date();
  exam.status = "published"; await exam.save();
  return res.json({ message: "Examination published successfully.", exam });
};

export const closeExam = async (req, res) => {
  const exam = await Exam.findOne({ _id: req.params.examId, school: req.user.school });
  if (!exam) return res.status(404).json({ message: "Examination not found." });
  if (!canManage(req.user, exam)) return res.status(403).json({ message: "You cannot close this examination." });
  exam.status = "closed"; await exam.save();
  return res.json({ message: "Examination closed.", exam });
};

export const startExam = async (req, res) => {
  try {
    const [student, exam] = await Promise.all([
      getStudent(req),
      Exam.findOne({ _id: req.params.examId, school: req.user.school }),
    ]);
    if (!student || !exam || id(student.schoolClass) !== id(exam.schoolClass)) return res.status(404).json({ message: "Examination not found for your class." });
    const now = new Date();
    let submission = await ExamSubmission.findOne({ exam: exam._id, student: student._id });
    if (submission) {
      if (submission.status === "in_progress") {
        const ordered = submission.questionOrder?.length
          ? submission.questionOrder.map(questionId => exam.questions.find(question => id(question._id) === id(questionId))).filter(Boolean)
          : exam.questions;
        return res.json({ message: "Resuming examination.", attempt: safeSubmission(submission), questions: publicQuestions(ordered) });
      }
      return res.status(409).json({ message: "You have already submitted this examination.", submission: safeSubmission(submission) });
    }
    if (exam.status !== "published" || now < exam.startsAt || now > exam.endsAt) return res.status(400).json({ message: "This examination is not currently available." });
    const questionOrder = exam.shuffleQuestions
      ? [...exam.questions].sort(() => Math.random() - 0.5).map(question => question._id)
      : exam.questions.map(question => question._id);
    const ordered = questionOrder.map(questionId => exam.questions.find(question => id(question._id) === id(questionId))).filter(Boolean);
    submission = await ExamSubmission.create({
      exam: exam._id, student: student._id, school: exam.school, questionOrder,
      expiresAt: new Date(Math.min(now.getTime() + exam.durationMinutes * 60000, new Date(exam.endsAt).getTime())),
      maxScore: exam.totalMarks,
    });
    return res.status(201).json({ message: "Examination started.", attempt: safeSubmission(submission), questions: publicQuestions(ordered) });
  } catch (error) { return res.status(500).json({ message: "Unable to start examination." }); }
};

export const saveExamAnswers = async (req, res) => {
  const student = await getStudent(req);
  const exam = await Exam.findOne({ _id: req.params.examId, school: req.user.school });
  if (!student || !exam || id(student.schoolClass) !== id(exam.schoolClass)) return res.status(404).json({ message: "Examination not found." });
  const submission = await ExamSubmission.findOne({ exam: exam._id, student: student._id, status: "in_progress" });
  if (!submission) return res.status(404).json({ message: "Active examination attempt not found." });
  if (new Date() > submission.expiresAt || new Date() > exam.endsAt) return res.json({ message: "The examination time has expired. Your previously saved answers will be submitted.", saved: submission.answers.length, expired: true });
  const validIds = new Set(exam.questions.map(q => id(q._id)));
  const answers = Array.isArray(req.body.answers) ? req.body.answers : [];
  submission.answers = answers.filter(a => validIds.has(id(a.questionId))).map(a => ({ questionId: a.questionId, answer: String(a.answer || "").slice(0, 12000) }));
  await submission.save();
  return res.json({ message: "Answers saved.", saved: submission.answers.length });
};

export const submitExam = async (req, res) => {
  try {
    const student = await getStudent(req);
    const exam = await Exam.findOne({ _id: req.params.examId, school: req.user.school });
    if (!student || !exam || id(student.schoolClass) !== id(exam.schoolClass)) return res.status(404).json({ message: "Examination not found." });
    const submission = await ExamSubmission.findOne({ exam: exam._id, student: student._id, status: "in_progress" });
    if (!submission) return res.status(404).json({ message: "Active examination attempt not found." });
    const now = new Date();
    if (now < submission.startedAt) return res.status(400).json({ message: "Invalid attempt time." });
    const answers = now <= submission.expiresAt && Array.isArray(req.body.answers) ? req.body.answers : submission.answers;
    const validIds = new Set(exam.questions.map(q => id(q._id)));
    submission.answers = answers.filter(a => validIds.has(id(a.questionId))).map(a => ({ questionId: a.questionId, answer: String(a.answer || "").slice(0, 12000) }));
    const { autoScore, pendingManual } = calculate(exam, submission.answers);
    submission.autoScore = autoScore;
    submission.score = pendingManual ? null : autoScore;
    submission.percentage = pendingManual ? null : Number(((autoScore / exam.totalMarks) * 100).toFixed(2));
    submission.gradingStatus = pendingManual ? "pending_manual" : "graded";
    submission.status = pendingManual ? "submitted" : "graded";
    submission.submittedAt = now;
    submission.timeSpentSeconds = Math.max(0, Math.floor((now - submission.startedAt) / 1000));
    await submission.save();
    let sync = { synced: false, reason: "RESULTS_NOT_RELEASED" };
    if (!pendingManual) sync = await syncFormalExamScore({ exam, student, submission });
    return res.json({ message: "Examination submitted successfully.", submission: safeSubmission(submission), sync });
  } catch (error) { return res.status(500).json({ message: error.message || "Failed to submit examination." }); }
};

export const getMyExamSubmission = async (req, res) => {
  const student = await getStudent(req);
  const submission = student && await ExamSubmission.findOne({ exam: req.params.examId, student: student._id });
  if (!submission) return res.status(404).json({ message: "No examination attempt found." });
  return res.json({ submission: safeSubmission(submission) });
};

export const getExamReview = async (req, res) => {
  try {
    const student = await getStudent(req);
    const exam = await Exam.findOne({ _id: req.params.examId, school: req.user.school });
    const submission = student && await ExamSubmission.findOne({ exam: req.params.examId, student: student._id });
    if (!student || !exam || !submission || submission.status === "in_progress") return res.status(404).json({ message: "Submitted examination review not found." });
    if (!exam.showResultsImmediately) return res.status(403).json({ message: "Your teacher has not released examination answers yet." });
    if (submission.gradingStatus !== "graded") return res.status(409).json({ message: "Your written responses are still awaiting marking." });
    return res.json({
      submission: safeSubmission(submission),
      questions: exam.questions.map(q => ({
        _id: q._id, question: q.question, type: q.type, marks: q.marks,
        options: q.options, correctAnswer: q.correctAnswer, acceptedAnswers: q.acceptedAnswers,
        explanation: q.explanation,
        studentAnswer: submission.answers.find(a => id(a.questionId) === id(q._id))?.answer || "",
        isCorrect: q.type === "essay" ? null : (q.type === "short_answer"
          ? [q.correctAnswer, ...(q.acceptedAnswers || [])].some(a => String(a).trim().toLowerCase() === String(submission.answers.find(x => id(x.questionId) === id(q._id))?.answer || "").trim().toLowerCase())
          : String(submission.answers.find(x => id(x.questionId) === id(q._id))?.answer || "") === String(q.correctAnswer)),
      })),
    });
  } catch (error) { return res.status(500).json({ message: "Failed to load answer review." }); }
};

export const getExamSubmissions = async (req, res) => {
  const exam = await Exam.findOne({ _id: req.params.examId, school: req.user.school });
  if (!exam) return res.status(404).json({ message: "Examination not found." });
  if (!canManage(req.user, exam)) return res.status(403).json({ message: "You cannot view these submissions." });
  const submissions = await ExamSubmission.find({ exam: exam._id }).populate("student", "studentId firstName middleName lastName").sort({ submittedAt: -1 });
  return res.json({ exam: { _id: exam._id, title: exam.title, totalMarks: exam.totalMarks }, submissions });
};

export const gradeExamSubmission = async (req, res) => {
  try {
    const exam = await Exam.findOne({ _id: req.params.examId, school: req.user.school });
    if (!exam || !canManage(req.user, exam)) return res.status(404).json({ message: "Examination not found." });
    const submission = await ExamSubmission.findOne({ _id: req.params.submissionId, exam: exam._id }).populate("student");
    if (!submission || submission.status === "in_progress") return res.status(404).json({ message: "Submitted attempt not found." });
    const manualScore = Number(req.body.manualScore);
    const essayMaximum = exam.questions.filter(q => q.type === "essay").reduce((sum, q) => sum + Number(q.marks), 0);
    if (!Number.isInteger(manualScore) || manualScore < 0 || manualScore > essayMaximum) return res.status(400).json({ message: `Manual score must be between 0 and ${essayMaximum}.` });
    const score = Number((submission.autoScore + manualScore).toFixed(2));
    submission.manualScore = manualScore;
    submission.score = score;
    submission.percentage = Number(((score / exam.totalMarks) * 100).toFixed(2));
    submission.gradingStatus = "graded";
    submission.status = "graded";
    await submission.save();
    const sync = await syncFormalExamScore({ exam, student: submission.student, submission });
    return res.json({ message: "Examination submission graded.", submission: safeSubmission(submission), sync });
  } catch (error) { return res.status(500).json({ message: error.message || "Failed to grade examination." }); }
};
