const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const LEFT = 52;
const RIGHT = 52;
const CONTENT_WIDTH = PAGE_WIDTH - LEFT - RIGHT;
const BODY_COLOR = "0.18 0.23 0.29";
const MUTED_COLOR = "0.39 0.45 0.52";
const BRAND_COLOR = "0.05 0.39 0.31";

const CP1252 = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85,
  "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8a,
  "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e, "‘": 0x91, "’": 0x92,
  "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97,
  "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c,
  "ž": 0x9e, "Ÿ": 0x9f, " ": 0x20,
};

const toPdfHex = (value) => {
  const normalized = String(value ?? "")
    .replace(/₦/g, "NGN ")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u00a0]/g, " ");
  let hex = "";
  for (const character of normalized) {
    const code = CP1252[character] ?? character.codePointAt(0);
    hex += (code <= 255 ? code : 63).toString(16).padStart(2, "0");
  }
  return hex.toUpperCase();
};

const estimateWidth = (value, size) => [...String(value)].reduce((total, character) => {
  if (" il.,'!:;|".includes(character)) return total + size * 0.24;
  if ("MW@%&".includes(character)) return total + size * 0.78;
  return total + size * 0.51;
}, 0);

const wrapText = (value, size, maxWidth) => {
  const words = String(value ?? "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && estimateWidth(candidate, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
};

const safeName = (value) => String(value || "School")
  .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, 100) || "School";

export const createPersonalizedProposalPdf = (schoolName) => {
  const recipientName = safeName(schoolName);
  const pages = [];
  let commands = [];
  let y = 778;

  const addPage = () => {
    if (commands.length) pages.push(commands.join("\n"));
    commands = [];
    y = 778;
  };

  const ensureSpace = (height) => {
    if (y - height < 62) addPage();
  };

  const drawText = (value, x, baseline, size = 9.5, bold = false, color = BODY_COLOR) => {
    commands.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${color} rg 1 0 0 1 ${x.toFixed(2)} ${baseline.toFixed(2)} Tm <${toPdfHex(value)}> Tj ET`);
  };

  const addParagraph = (value, options = {}) => {
    const size = options.size || 9.4;
    const leading = options.leading || 13.2;
    const indent = options.indent || 0;
    const width = options.width || CONTENT_WIDTH - indent;
    const lines = wrapText(value, size, width);
    ensureSpace(lines.length * leading + (options.after ?? 7));
    for (const line of lines) {
      drawText(line, LEFT + indent, y, size, Boolean(options.bold), options.color || BODY_COLOR);
      y -= leading;
    }
    y -= options.after ?? 7;
  };

  const addHeading = (value) => {
    ensureSpace(34);
    y -= 5;
    drawText(value, LEFT, y, 13.2, true, BRAND_COLOR);
    y -= 21;
  };

  const addSubheading = (value) => {
    ensureSpace(24);
    drawText(value, LEFT, y, 10.2, true, BODY_COLOR);
    y -= 15;
  };

  const addBullet = (value, indent = 12) => {
    const size = 9.1;
    const leading = 12.4;
    const lines = wrapText(value, size, CONTENT_WIDTH - indent - 14);
    ensureSpace(lines.length * leading + 3);
    drawText("•", LEFT + indent, y, 10, true, BRAND_COLOR);
    lines.forEach((line, index) => {
      drawText(line, LEFT + indent + 15, y - index * leading, size, false, BODY_COLOR);
    });
    y -= lines.length * leading + 3;
  };

  const addNumbered = (number, value) => {
    const size = 9.1;
    const leading = 12.4;
    const lines = wrapText(value, size, CONTENT_WIDTH - 34);
    ensureSpace(lines.length * leading + 4);
    drawText(`${number}.`, LEFT + 3, y, size, true, BRAND_COLOR);
    lines.forEach((line, index) => {
      drawText(line, LEFT + 27, y - index * leading, size, false, BODY_COLOR);
    });
    y -= lines.length * leading + 4;
  };

  const addLabel = (label, value) => {
    addParagraph(`${label}: ${value}`, { after: 5 });
  };

  // Cover page
  drawText("PRODUCT PROPOSAL", LEFT, 650, 25, true, BRAND_COLOR);
  commands.push(`0.05 0.39 0.31 RG 2 w ${LEFT} 630 m ${PAGE_WIDTH - RIGHT} 630 l S`);
  drawText("Introduction and Implementation of", LEFT, 580, 16, true, BODY_COLOR);
  drawText("SchoolPilot School Management System", LEFT, 555, 16, true, BODY_COLOR);
  y = 470;
  addParagraph(`Prepared for: The Management of ${recipientName}`, { size: 11, bold: true, after: 18 });
  addParagraph("Prepared by: SchoolPilot", { size: 10.5, after: 8 });
  addParagraph("Website: https://school-pilot.app", { size: 10.5, after: 8, color: BRAND_COLOR });
  addParagraph("Email: info@school-pilot.app", { size: 10.5, color: BRAND_COLOR, after: 0 });
  addPage();

  addHeading("1. INTRODUCTION");
  addParagraph(`Dear Management of ${recipientName},`);
  addParagraph("We are pleased to present SchoolPilot, a modern school management platform designed to simplify administrative operations, improve academic management, and strengthen communication between schools, teachers, students, and parents.");
  addParagraph("Managing a school involves coordinating student records, staff, attendance, assignments, examinations, results, school fees, and parent communication. Handling these responsibilities through separate manual processes can be time-consuming and difficult to monitor.");
  addParagraph("SchoolPilot brings these activities together in one platform. In addition to its core school-management tools, the platform now includes an AI-assisted examination question-generation workflow and reusable question banks. These tools help teachers prepare assessments more efficiently while keeping review, approval, and final academic decisions in the hands of educators and school administrators.");
  addParagraph(`We would be delighted to have ${recipientName} consider SchoolPilot as a technology partner in its journey towards more efficient school administration and improved educational management.`);

  addHeading("2. ABOUT SCHOOLPILOT");
  addParagraph("SchoolPilot is a web-based school management system developed to help educational institutions digitize and streamline their daily operations.");
  addParagraph("The platform provides separate dashboards and access permissions for school administrators, teachers, students, parents, and platform administrators. This allows each user to access the tools and information relevant to their responsibilities.");
  addParagraph("SchoolPilot is designed to make school administration more organized, accessible, and efficient while reducing the administrative burden on school management and teaching staff.");

  addHeading("3. KEY FEATURES AND BENEFITS");
  addSubheading("A. Student Management");
  ["Maintain organized student profiles and records.","Manage student admissions and class assignments.","Access student information from a centralized platform.","Manage student records throughout their academic journey.","Retrieve relevant student information when needed."].forEach(addBullet);
  addSubheading("B. Staff and Teacher Management");
  ["Maintain teacher and staff records.","Assign teachers to classes and subjects.","Organize teaching responsibilities.","Provide teachers with dedicated dashboards for their academic activities.","Manage teaching assignments and academic responsibilities."].forEach(addBullet);
  addSubheading("C. Attendance Management");
  ["Record and monitor student attendance.","Keep attendance records organized and accessible.","Make it easier for school management to monitor attendance patterns.","Provide a centralized way to review attendance information."].forEach(addBullet);
  addSubheading("D. Academic Management");
  addParagraph("SchoolPilot provides tools to help schools organize academic activities and manage the teaching and learning process.");
  ["Manage classes, subjects, and academic sessions.","Organize teaching and learning activities.","Create and distribute assignments.","Prepare CBT assignments and formal examinations.","Build and maintain reusable question banks.","Record and manage assessment and examination scores.","Generate student results and report cards.","Monitor students' academic performance."].forEach(addBullet);
  addSubheading("E. AI-Assisted Examination Preparation and Question Banks");
  addParagraph("SchoolPilot includes an AI-assisted examination question-generation feature designed to reduce the time teachers spend preparing assessment questions. Teachers can provide a subject, class, topic or set of topics, and can also use supported uploaded learning materials as the basis for question generation.");
  addParagraph("Teachers remain in control of the process. AI-generated questions are presented for review before they are saved or used. Teachers can edit questions, remove unsuitable items, regenerate questions, adjust difficulty and marks, and approve the final questions.");
  addSubheading("AI Question Generation");
  ["Generate draft questions from a selected class, subject, topic, or topics.","Use supported uploaded learning materials, including TXT, Markdown, CSV, and Excel files, to guide question generation.","Choose the number of questions, question formats, and intended difficulty.","Generate multiple-choice questions with answer options and correct answers, as well as true/false, short-answer, and essay questions.","Review suggested answers, explanations, and marks where applicable.","Edit, delete, regenerate, or adjust generated questions before approval."].forEach(addBullet);
  addSubheading("Question Bank Management");
  ["Maintain private question banks for individual teachers and shared question banks for wider school use, subject to the platform's access permissions.","Create questions manually, generate them with AI, or import them from CSV and Excel files.","Organize questions by class, subject, topic, and difficulty.","Reuse approved questions when preparing later assignments and examinations.","Select questions from the bank using filters and random selection to support different assessment sets."].forEach(addBullet);
  addParagraph("Question marks are validated to support consistent assessment setup. Objective questions and assignment questions use positive whole-number marks rather than decimal marks. Imported objective questions must include the required answer options and correct answer.");
  addParagraph("The AI assistant supports teacher preparation; it does not replace the teacher's professional judgment. Teachers are responsible for checking the accuracy, suitability, curriculum alignment, and final marks of questions before use.");

  addSubheading("F. Computer-Based Testing (CBT) and Online Examinations");
  addParagraph("SchoolPilot provides a Computer-Based Testing (CBT) feature that enables schools to conduct assessments and examinations digitally, reducing dependence on traditional paper-based testing.");
  ["Teachers can create online assessments with questions, answer options, correct answers, and marks.","Students can take available objective tests through their individual dashboards.","Timed assessments can be configured to support structured testing.","Objective questions can be marked automatically, reducing the time teachers spend grading them.","Assessment scores can be recorded for academic review.","Teachers can use questions from their question banks when preparing CBT assignments and formal examinations."].forEach(addBullet);
  addSubheading("CBT Assignments and Formal Examinations");
  addParagraph("SchoolPilot keeps ordinary CBT assignments and formal examinations as distinct academic workflows, allowing schools to manage each according to its purpose.");
  addSubheading("1. CBT Assignments");
  addParagraph("Teachers can create individual computer-based assignments for students. Questions may be created manually, generated with AI, imported, or selected from an existing question bank. Each assignment is managed and recorded separately so teachers can monitor participation and performance across different tasks.");
  addSubheading("2. Formal Examinations");
  addParagraph("SchoolPilot provides a dedicated examination module for formal school examinations. Teachers can prepare examinations using new questions or approved questions from the question bank. Examinations are submitted for approval by the school administrator before they become available to students.");
  addParagraph("Once approved and published, students can access and take their examinations through their individual dashboards. The published examination retains its approved question set, supporting consistency between the examination students take and the examination that was authorized.");
  addParagraph("Formal examination scores can be incorporated into students' examination results and report cards, helping schools maintain an organized assessment and grading process.");
  addSubheading("Benefits of AI-Assisted Assessment and CBT");
  [
    "Reduces the time teachers spend drafting questions from scratch.",
    "Makes it easier to build and maintain reusable question collections.",
    "Supports question preparation across different classes, subjects, topics, and difficulty levels.",
    "Allows teachers to review and refine AI-generated questions before use.",
    "Reduces the cost and administrative workload associated with printing and distributing examination papers.",
    "Makes objective-test marking faster and more efficient.",
    "Helps teachers monitor student performance across assignments and examinations.",
    "Supports a more organized and transparent assessment process."
  ].forEach((item, index) => addNumbered(index + 1, item));

  addSubheading("G. Online Results and Report Cards");
  addParagraph("SchoolPilot provides a digital results management system that helps schools manage academic performance and generate structured report cards.");
  ["Manage continuous assessment and examination scores.","Organize assessment and examination results.","Generate structured student report cards.","Give authorized students and parents access to academic results.","Reduce the administrative workload associated with preparing and distributing results.","Make academic performance records easier to retrieve and review."].forEach(addBullet);
  addParagraph("This helps schools improve the organization of academic records while making results more accessible to authorized users.");
  addSubheading("H. Fees and Payment Management");
  ["Record and monitor school fee payments.","Track outstanding balances.","Maintain organized payment records.","Support online payment processing through the platform.","Give school administrators better visibility into payment activities."].forEach(addBullet);
  addParagraph("SchoolPilot helps schools maintain more organized financial records and monitor outstanding payments effectively. School fees collected by the school remain the school's revenue; the platform provides tools to record, monitor, and manage those payments.");
  addSubheading("I. Parent and Student Portals");
  addParagraph("SchoolPilot provides dedicated portals where parents and students can access relevant school information.");
  addParagraph("Parents can:", { bold: true, after: 2 });
  ["Monitor their children's academic progress.","View examination results and report cards.","Keep track of important school information.","Stay informed about their children's academic activities."].forEach(addBullet);
  addParagraph("Students can:", { bold: true, after: 2 });
  ["Access assignments and learning activities.","Participate in available computer-based tests and examinations.","View results and report cards.","Access other academic resources made available by the school."].forEach(addBullet);
  addParagraph("These portals help strengthen communication between the school, parents, and students while making important academic information more accessible.");
  addSubheading("J. School Website, News and Events");
  addParagraph("SchoolPilot provides schools with a digital presence through a school website where important institutional information, announcements, news, and events can be shared with the school community.");
  addParagraph("The school can use its online presence to showcase the institution and communicate updates to parents, students, and the wider community.");

  addHeading("4. BENEFITS TO " + recipientName.toUpperCase());
  addParagraph(`By adopting SchoolPilot, ${recipientName} can benefit from:`);
  [
    [9,"Improved Administrative Efficiency: Reduce repetitive manual processes and organize important school operations in one place."],
    [10,"Better Record Management: Keep student, teacher, academic, and financial records properly organized."],
    [11,"Improved Parent Engagement: Make it easier for parents to stay informed about their children's academic activities and progress."],
    [12,"Academic Transparency: Give authorized users convenient access to results and report cards."],
    [13,"Improved Financial Monitoring: Track fee payments and outstanding balances more effectively."],
    [14,"Faster Assessment Preparation: Use AI assistance and reusable question banks to help teachers prepare assessment questions more efficiently."],
    [15,"Teacher Oversight and Quality Control: Allow teachers to review, edit, and approve generated questions before they are used."],
    [16,"Better Examination Management: Organize formal examinations and retain an administrator approval process before student access."],
    [17,"Faster Objective-Test Marking: Use automatic marking for supported objective questions."],
    [18,"Reduced Paperwork: Digitize important school processes and reduce dependence on manual record-keeping."],
    [19,"Modern Digital Experience: Provide teachers, students, and parents with a more convenient way to interact with school services."]
  ].forEach(([number, value]) => addNumbered(number, value));

  addHeading("5. IMPLEMENTATION AND ONBOARDING");
  addParagraph("We understand that introducing a new management system requires proper planning and support.");
  addParagraph("SchoolPilot is designed to support a structured onboarding process that can include:");
  [
    `Setting up ${recipientName} on the platform.`,
    "Configuring the school's classes, subjects, and academic structure.",
    "Registering or importing student and staff records.",
    "Setting up administrator, teacher, student, and parent access.",
    "Configuring academic workflows, question-bank access, and examination approval responsibilities.",
    "Guiding relevant staff members on how to use the platform, including AI-assisted question preparation and review.",
    "Providing assistance during the initial adoption process."
  ].forEach(addBullet);
  addParagraph("Our objective is to make the transition as smooth as possible while helping the school get the most value from the platform. Specific onboarding arrangements will be discussed with school management to ensure that the setup reflects the institution's operational needs.");

  addHeading("6. SUBSCRIPTION AND PRICING");
  addParagraph("SchoolPilot operates on a student-based subscription model designed to make the platform accessible to schools of different sizes.");
  addParagraph("Introductory Subscription Fee: NGN 1,000 per child per term.", { size: 11, bold: true, color: BRAND_COLOR });
  addParagraph("The subscription provides the school with access to the SchoolPilot management platform and its available features, including student and staff management, attendance tracking, academic management, AI-assisted question preparation, question banks, CBT assignments, formal examinations, results and report cards, fee monitoring, and parent and student portals.");
  addSubheading("How the Subscription Works");
  [
    [20,"The school subscribes based on the number of student seats it requires."],
    [21,"The subscription is renewed each academic term."],
    [22,"The subscription amount is based on the number of subscribed student seats."],
    [23,"The school can monitor its subscription status and available student capacity through its administrative dashboard."]
  ].forEach(([number, value]) => addNumbered(number, value));
  addSubheading("Important Clarification");
  addParagraph("The SchoolPilot subscription fee is strictly for access to the school management platform. It is separate from school fees and other payments that the school collects from parents.");
  addParagraph("School fees collected by the school remain the school's revenue. SchoolPilot provides the tools to record, monitor, and manage those payments. The subscription is charged per child per term, not as a percentage of the school's fees or revenue.");
  addParagraph("The NGN 1,000 rate is introductory pricing as SchoolPilot expands adoption among schools. Any future pricing review will be communicated appropriately.");

  addHeading("7. DEMONSTRATION AND EVALUATION");
  addParagraph(`We would appreciate the opportunity to give the management and relevant staff members of ${recipientName} a practical demonstration of SchoolPilot.`);
  addParagraph("During the demonstration, we will:");
  [
    "Walk the management team through the platform and its user dashboards.",
    "Demonstrate student, teacher, academic, and financial management.",
    "Show how teachers create CBT assignments and how students participate in online tests.",
    "Demonstrate the AI-assisted question-generation process, including selecting a class and subject, generating questions from topics or supported learning materials, and reviewing and editing the results.",
    "Show how teachers create, import, organize, and reuse questions in private or shared question banks.",
    "Demonstrate how questions can be selected for assignments and formal examinations.",
    "Show how formal examinations are submitted for administrator approval before students can access them.",
    "Demonstrate how examination scores are recorded and reflected in academic results and report cards.",
    "Demonstrate the parent and student portals.",
    "Explain the subscription model and onboarding process.",
    "Address questions and discuss the school's specific requirements."
  ].forEach(addBullet);
  addParagraph("This will allow the management to evaluate the platform, ask questions, and determine how SchoolPilot can fit into the school's existing administrative and academic processes.");
  addParagraph("We are also open to discussing the school's specific requirements and recommending an appropriate implementation approach.");

  addHeading("8. CONCLUSION");
  addParagraph("At SchoolPilot, we believe that technology should make school management simpler, more organized, and more effective.");
  addParagraph(`We believe our platform can provide ${recipientName} with the digital tools needed to improve administrative processes, strengthen communication, enhance academic management, support teachers with AI-assisted examination preparation, modernize assessments through CBT, and create a more organized school environment.`);
  addParagraph("The AI assistant is intended to support—not replace—teachers. Educators retain responsibility for reviewing questions, ensuring their suitability, and approving assessments, while school administrators retain oversight of formal examinations.");
  addParagraph(`We would be honoured to partner with ${recipientName} in its digital transformation journey and look forward to the opportunity to demonstrate how SchoolPilot can support the institution.`);
  addParagraph("Thank you for your time and consideration.");
  y -= 8;
  addParagraph("Yours faithfully,", { after: 3 });
  addParagraph("Management", { bold: true, after: 2 });
  addParagraph("SchoolPilot", { bold: true, after: 3 });
  addParagraph("Website: https://school-pilot.app", { color: BRAND_COLOR, after: 2 });
  addParagraph("Email: info@school-pilot.app", { color: BRAND_COLOR, after: 0 });

  if (commands.length) pages.push(commands.join("\n"));

  const objects = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  const pageObjectIds = [];

  pages.forEach((pageContent, index) => {
    const pageId = 5 + index * 2;
    const contentId = pageId + 1;
    pageObjectIds.push(pageId);
    const headerFooter = [
      "0.05 0.39 0.31 rg",
      `BT /F2 8 Tf 1 0 0 1 ${LEFT} 813 Tm <${toPdfHex("SCHOOLPILOT | SCHOOL MANAGEMENT PLATFORM")}> Tj ET`,
      "0.82 0.86 0.88 RG 0.6 w 52 802 m 543 802 l S",
      "0.82 0.86 0.88 RG 0.6 w 52 45 m 543 45 l S",
      `0.39 0.45 0.52 rg BT /F1 7 Tf 1 0 0 1 52 29 Tm <${toPdfHex("SchoolPilot | https://school-pilot.app | info@school-pilot.app")}> Tj ET`,
      `0.39 0.45 0.52 rg BT /F1 7 Tf 1 0 0 1 515 29 Tm <${toPdfHex(`Page ${index + 1} of ${pages.length}`)}> Tj ET`
    ].join("\n");
    const stream = `${headerFooter}\n${pageContent}\n`;
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = { stream };
  });

  objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjectIds.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(pdf, "ascii");
    const object = objects[id];
    if (object && typeof object === "object" && object.stream !== undefined) {
      const streamBuffer = Buffer.from(object.stream, "ascii");
      pdf += `${id} 0 obj\n<< /Length ${streamBuffer.length} >>\nstream\n${object.stream}endstream\nendobj\n`;
    } else {
      pdf += `${id} 0 obj\n${object}\nendobj\n`;
    }
  }

  const xrefOffset = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "ascii");
};
