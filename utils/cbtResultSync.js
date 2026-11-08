import Result from "../models/Result.js";
import School from "../models/School.js";

export const syncCbtExamScoreToResult = async ({
  assignment,
  student,
  scorePercent,
  source = "cbt",
}) => {
  const school = await School.findById(assignment.school).select("gradingSystem");
  if (!school?.gradingSystem) return { synced: false, reason: "GRADING_SYSTEM_MISSING" };

  const gradingSystem = school.gradingSystem;
  const examMaximum = Number(gradingSystem.examMaximum);
  const caMaximum = Number(gradingSystem.caMaximum);
  const totalMaximum = Number(gradingSystem.totalMaximum);
  if (!Number.isFinite(examMaximum) || examMaximum <= 0) {
    return { synced: false, reason: "INVALID_EXAM_MAXIMUM" };
  }

  const result = await Result.findOne({
    school: assignment.school,
    student: student._id,
    subject: assignment.subject,
    academicSession: assignment.academicSession,
    academicTerm: assignment.term,
  });

  if (result && result.status !== "draft") {
    return { synced: false, reason: "RESULT_NOT_DRAFT" };
  }
  if (
    result &&
    source === "cbt" &&
    (result.examScoreSource === "manual" ||
      (result.examScoreSource === "pending" && Number(result.examScore) > 0))
  ) {
    return { synced: false, reason: "MANUAL_SCORE_PRESERVED" };
  }

  const examScore = Number(((Number(scorePercent) / 100) * examMaximum).toFixed(2));
  const assessmentScores = result?.assessmentScores?.length
    ? result.assessmentScores
    : (gradingSystem.caComponents || []).map((component) => ({
        name: component.name,
        score: 0,
        maximum: Number(component.maximum),
      }));
  const caScore = assessmentScores.reduce((sum, item) => sum + Number(item.score || 0), 0);
  const total = Number((caScore + examScore).toFixed(2));
  const rule = (gradingSystem.gradingScale || []).find(
    (item) => total >= Number(item.min) && total <= Number(item.max)
  );
  if (!rule) return { synced: false, reason: "GRADING_RULE_NOT_FOUND" };

  const snapshot = {
    caMaximum,
    examMaximum,
    totalMaximum,
    caComponents: (gradingSystem.caComponents || []).map((item) => ({
      name: item.name,
      maximum: Number(item.maximum),
    })),
    gradingScale: (gradingSystem.gradingScale || []).map((item) => ({
      min: Number(item.min),
      max: Number(item.max),
      grade: item.grade,
      remark: item.remark,
    })),
  };

  if (!result) {
    await Result.create({
      school: assignment.school,
      student: student._id,
      schoolClass: assignment.schoolClass,
      subject: assignment.subject,
      academicSession: assignment.academicSession,
      academicTerm: assignment.term,
      assessmentScores,
      caScore,
      examScore,
      examScoreSource: source,
      total,
      grade: rule.grade,
      remark: rule.remark,
      gradingSystem: snapshot,
      status: "draft",
      enteredBy: assignment.teacher,
    });
  } else {
    result.schoolClass = assignment.schoolClass;
    result.assessmentScores = assessmentScores;
    result.caScore = caScore;
    result.examScore = examScore;
    result.examScoreSource = source;
    result.total = total;
    result.grade = rule.grade;
    result.remark = rule.remark;
    result.gradingSystem = snapshot;
    await result.save();
  }

  return { synced: true, examScore, total, grade: rule.grade };
};
