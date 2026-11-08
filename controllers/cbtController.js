import Assignment from "../models/Assignment.js";
import AssignmentSubmission from "../models/AssignmentSubmission.js";
import Student from "../models/Student.js";
import { syncCbtExamScoreToResult } from "../utils/cbtResultSync.js";

const normalize = (value) =>
  String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

const getStudentAndAssignment = async (req) => {
  const student = await Student.findOne({
    user: req.user._id,
    isActive: true,
  });
  if (!student) return { error: "STUDENT_NOT_FOUND" };

  const assignment = await Assignment.findOne({
    _id: req.params.assignmentId,
    school: student.school,
    schoolClass: student.schoolClass,
    academicSession: student.academicSession,
    status: "published",
    assessmentMode: "cbt",
  });
  if (!assignment) return { error: "CBT_NOT_FOUND" };

  return { student, assignment };
};

const studentSafeQuestions = (questions) =>
  questions.map((question) => ({
    _id: question._id,
    question: question.question,
    type: question.type,
    options: question.options,
    marks: question.marks,
    order: question.order,
  }));

const buildAttemptResponse = (assignment, submission) => {
  const questionsById = new Map(assignment.questions.map((question) => [String(question._id), question]));
  const orderedQuestions = (submission.questionOrder || []).length
    ? submission.questionOrder.map((id) => questionsById.get(String(id))).filter(Boolean)
    : assignment.questions;

  return {
  assignment: {
    _id: assignment._id,
    title: assignment.title,
    description: assignment.description,
    instructions: assignment.instructions,
    durationMinutes: assignment.durationMinutes,
    questions: studentSafeQuestions(orderedQuestions),
  },
  attempt: {
    _id: submission._id,
    startedAt: submission.startedAt,
    expiresAt: submission.expiresAt,
    status: submission.status,
    answers: submission.answers,
  },
  };
};

export const startCbtAttempt = async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Only students can start a CBT." });
    }

    const { student, assignment, error } = await getStudentAndAssignment(req);
    if (error === "STUDENT_NOT_FOUND") {
      return res.status(404).json({ message: "Student record not found." });
    }
    if (error) return res.status(404).json({ message: "CBT not found for your class." });

    if (!assignment.durationMinutes || !assignment.questions.length) {
      return res.status(400).json({ message: "This CBT is not fully configured." });
    }
    let submission = await AssignmentSubmission.findOne({
      assignment: assignment._id,
      student: student._id,
      school: student.school,
    });

    if (submission && submission.status !== "in_progress") {
      return res.status(200).json({
        alreadySubmitted: true,
        submission: {
          status: submission.status,
          score: assignment.showResultsImmediately ? submission.score : null,
          autoScore: assignment.showResultsImmediately ? submission.autoScore : null,
          gradingStatus: submission.gradingStatus,
          submittedAt: submission.submittedAt,
        },
      });
    }

    if (!submission) {
      if (new Date() > new Date(assignment.dueDate)) {
        return res.status(400).json({ message: "The CBT deadline has passed." });
      }
      const startedAt = new Date();
      const expiresAt = new Date(
        startedAt.getTime() + assignment.durationMinutes * 60 * 1000
      );
      const maxScore = assignment.questions.reduce(
        (total, question) => total + Number(question.marks || 0),
        0
      );
      const questionOrder = assignment.questions.map((question) => question._id);
      if (assignment.shuffleQuestions) {
        questionOrder.sort(() => Math.random() - 0.5);
      }

      submission = await AssignmentSubmission.create({
        assignment: assignment._id,
        student: student._id,
        school: student.school,
        status: "in_progress",
        startedAt,
        expiresAt,
        submittedAt: null,
        maxScore,
        questionOrder,
        answers: [],
      });
    }

    if (!submission.questionOrder?.length) {
      submission.questionOrder = assignment.questions.map((question) => question._id);
      await submission.save();
    }
    const attemptResponse = buildAttemptResponse(assignment, submission);
    return res.status(200).json({
      ...attemptResponse,
      timeExpired: new Date() >= new Date(submission.expiresAt),
    });
  } catch (error) {
    console.error("Start CBT attempt error:", error);
    return res.status(500).json({ message: "Failed to start CBT." });
  }
};

export const submitCbtAttempt = async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Only students can submit a CBT." });
    }

    const { student, assignment, error } = await getStudentAndAssignment(req);
    if (error === "STUDENT_NOT_FOUND") {
      return res.status(404).json({ message: "Student record not found." });
    }
    if (error) return res.status(404).json({ message: "CBT not found for your class." });

    const submission = await AssignmentSubmission.findOne({
      assignment: assignment._id,
      student: student._id,
      school: student.school,
      status: "in_progress",
    });
    if (!submission) {
      return res.status(409).json({ message: "No active CBT attempt was found." });
    }

    const attemptExpired = new Date() >= new Date(submission.expiresAt);
    const submittedAnswers = attemptExpired
      ? submission.answers
      : Array.isArray(req.body.answers) ? req.body.answers : [];
    const answerMap = new Map(
      submittedAnswers.map((item) => [String(item.questionId), String(item.answer ?? "")])
    );

    let earnedMarks = 0;
    let hasManualQuestions = false;
    const answers = assignment.questions.map((question) => {
      const answer = answerMap.get(String(question._id)) ?? "";
      if (question.type === "essay") {
        hasManualQuestions = true;
      } else {
        const accepted = [
          question.correctAnswer,
          ...(question.acceptedAnswers || []),
        ].filter((value) => value !== undefined && value !== null && String(value).trim());
        if (accepted.some((value) => normalize(value) === normalize(answer))) {
          earnedMarks += Number(question.marks || 0);
        }
      }
      return { questionId: question._id, answer };
    });

    const maxScore = assignment.questions.reduce(
      (total, question) => total + Number(question.marks || 0),
      0
    );
    const autoScore = maxScore > 0 ? Number(((earnedMarks / maxScore) * 100).toFixed(2)) : 0;
    const now = new Date();

    submission.answers = answers;
    submission.autoScore = autoScore;
    submission.maxScore = maxScore;
    submission.isAutoGraded = !hasManualQuestions;
    submission.gradingStatus = hasManualQuestions ? "pending_manual" : "auto_graded";
    submission.score = hasManualQuestions ? null : autoScore;
    submission.status = hasManualQuestions ? "submitted" : "graded";
    submission.submittedAt = now;
    submission.timeSpentSeconds = Math.max(
      0,
      Math.floor((now.getTime() - new Date(submission.startedAt).getTime()) / 1000)
    );
    await submission.save();

    if (!hasManualQuestions) {
      try {
        await syncCbtExamScoreToResult({
          assignment,
          student,
          scorePercent: autoScore,
          source: "cbt",
        });
      } catch (syncError) {
        console.error("CBT score saved, but result synchronization failed:", syncError);
      }
    }

    return res.status(200).json({
      message: hasManualQuestions
        ? "CBT submitted. Objective questions have been marked; written answers are awaiting teacher review."
        : "CBT submitted and marked successfully.",
      submission: {
        _id: submission._id,
        status: submission.status,
        score: assignment.showResultsImmediately ? submission.score : null,
        autoScore: assignment.showResultsImmediately ? submission.autoScore : null,
        maxScore: submission.maxScore,
        gradingStatus: submission.gradingStatus,
        submittedAt: submission.submittedAt,
      },
    });
  } catch (error) {
    console.error("Submit CBT attempt error:", error);
    return res.status(500).json({ message: "Failed to submit CBT." });
  }
};


export const saveCbtAnswers = async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Only students can save CBT answers." });
    }
    const { student, assignment, error } = await getStudentAndAssignment(req);
    if (error === "STUDENT_NOT_FOUND") {
      return res.status(404).json({ message: "Student record not found." });
    }
    if (error) return res.status(404).json({ message: "CBT not found for your class." });

    const submission = await AssignmentSubmission.findOne({
      assignment: assignment._id,
      student: student._id,
      school: student.school,
      status: "in_progress",
    });
    if (!submission) return res.status(409).json({ message: "No active CBT attempt was found." });
    if (new Date() >= new Date(submission.expiresAt)) {
      return res.status(409).json({ message: "The CBT time has expired." });
    }

    const submittedAnswers = Array.isArray(req.body.answers) ? req.body.answers : [];
    const validQuestionIds = new Set(assignment.questions.map((question) => String(question._id)));
    const answers = submittedAnswers
      .filter((item) => validQuestionIds.has(String(item.questionId)))
      .map((item) => ({
        questionId: item.questionId,
        answer: String(item.answer ?? ""),
      }));

    submission.answers = answers;
    await submission.save();

    return res.status(200).json({ message: "Answers saved.", savedCount: answers.length });
  } catch (error) {
    console.error("Save CBT answers error:", error);
    return res.status(500).json({ message: "Failed to save CBT answers." });
  }
};


// Students can review their own submitted CBT answers only after the teacher
// has enabled immediate result release. Correct answers and explanations are
// never included in the live exam payload.
export const getCbtReview = async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Only students can review their CBT." });
    }
    const { student, assignment, error } = await getStudentAndAssignment(req);
    if (error === "STUDENT_NOT_FOUND") return res.status(404).json({ message: "Student record not found." });
    if (error) return res.status(404).json({ message: "CBT not found for your class." });

    const submission = await AssignmentSubmission.findOne({
      assignment: assignment._id,
      student: student._id,
      school: student.school,
    });
    if (!submission || submission.status === "in_progress") {
      return res.status(409).json({ message: "Submit the examination before reviewing it." });
    }
    if (!assignment.showResultsImmediately) {
      return res.status(403).json({ message: "Your teacher has not released the answer review yet." });
    }

    const answerMap = new Map((submission.answers || []).map((item) => [String(item.questionId), item.answer || ""]));
    const review = assignment.questions.map((question, index) => {
      const studentAnswer = answerMap.get(String(question._id)) || "";
      const accepted = [question.correctAnswer, ...(question.acceptedAnswers || [])]
        .filter(Boolean)
        .map(normalize);
      const isCorrect = question.type === "essay"
        ? null
        : accepted.includes(normalize(studentAnswer));
      return {
        questionId: question._id,
        number: index + 1,
        question: question.question,
        type: question.type,
        options: question.options,
        marks: question.marks,
        studentAnswer,
        correctAnswer: question.type === "essay" ? null : question.correctAnswer,
        isCorrect,
        explanation: question.explanation || "",
      };
    });

    return res.status(200).json({
      assignment: { _id: assignment._id, title: assignment.title },
      result: {
        score: submission.score,
        autoScore: submission.autoScore,
        maxScore: submission.maxScore,
        gradingStatus: submission.gradingStatus,
        submittedAt: submission.submittedAt,
        feedback: submission.feedback,
      },
      review,
    });
  } catch (error) {
    console.error("Get CBT review error:", error);
    return res.status(500).json({ message: "Failed to load CBT answer review." });
  }
};
