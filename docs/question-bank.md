# SchoolPilot Question Bank

## Backend configuration

AI question generation uses the OpenAI Chat Completions API from the backend. Add the following environment variable to the backend deployment (Production and Preview):

- `OPENAI_API_KEY`: required secret API key.
- `OPENAI_QUESTION_MODEL`: optional model override; defaults to `gpt-4.1-mini`.

The API key is read only by the backend and must never be exposed in frontend environment variables. AI generation returns drafts. A teacher must review and explicitly save each question before it enters the approved bank.

## Supported learning-material uploads

The AI generator accepts TXT, Markdown, CSV, XLSX and XLS files up to 5 MB. Pasted notes are also supported. Material text is limited before it is sent to the AI provider.

Question imports accept CSV and Excel files with these columns:

| Column | Required | Notes |
| --- | --- | --- |
| Question | Yes | Question text |
| Type | No | `multiple_choice`, `true_false`, `short_answer` or `essay` |
| Options | For objective questions | Separate option texts with `|`; values are assigned A, B, C, D |
| Correct Answer | For objective / short answer | Option value such as A, or the accepted answer |
| Accepted Answers | No | Separate accepted answers with `|` |
| Marks | Yes | Positive whole number only |
| Topic | No | Defaults to General |
| Difficulty | No | easy, medium or hard |
| Explanation | No | Worked solution or answer explanation |

## Question bank ownership

- Each school has its own private question bank. Teachers can create and manage their own questions; school administrators can oversee questions in their school.
- The SchoolPilot shared bank is managed by Super Admin and matched to other schools by subject and class names.
- Questions selected from a bank are copied into the assessment when it is created. Later edits or archiving in the bank do not change existing examination or assignment question snapshots.

## Whole-number marking

Question marks must be positive integers. The backend rejects decimal marks for formal examinations, assignment CBTs and question-bank records. Assignment grading scores are also whole numbers from 0 to 100. Percentage summaries may still display decimal percentages because they are calculated percentages, not question mark allocations.
