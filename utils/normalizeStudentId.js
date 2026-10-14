
export const normalizeStudentId = (value) => {
  const studentId = String(value ?? "")
    .trim()
    .toUpperCase();

  const match = studentId.match(/^STU-(\d+)$/);

  if (!match) {
    return studentId;
  }

  return `STU-${match[1].padStart(4, "0")}`;
};

export const isValidStudentId = (value) => {
  return /^STU-\d{4,}$/.test(
    normalizeStudentId(value)
  );
};
