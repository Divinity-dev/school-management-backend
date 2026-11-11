# SchoolPilot Question Bank

## Backend AI provider configuration

AI question generation supports both Gemini and OpenAI. Select the provider with `AI_PROVIDER`. The setting defaults to `gemini` when omitted.

### Gemini (recommended starting provider)

- `AI_PROVIDER=gemini`
- `GEMINI_API_KEY`: required when Gemini is selected.
- `GEMINI_MODEL`: optional; defaults to `gemini-3.8-flash`.

### OpenAI (enable when ready)

- `AI_PROVIDER=openai`
- `OPENAI_API_KEY`: required only when OpenAI is selected.
- `OPENAI_QUESTION_MODEL`: optional; defaults to `gpt-4.1-mini`.

Only the selected provider's API key is required. You do not need to create or configure an OpenAI key while Gemini is selected. To switch providers, update `AI_PROVIDER` and ensure the selected provider's key is present, then redeploy/restart the backend.

Add the variables to the backend Vercel project for the environments where you want AI generation enabled (Preview and Production). For local development, put them in the backend `.env` file. Never put either provider key in the frontend or commit keys to Git.

Example local configuration for the current Gemini setup:

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-3.8-flash

# Optional OpenAI settings; only needed when switching to OpenAI
# AI_PROVIDER=openai
# OPENAI_API_KEY=your_openai_api_key
# OPENAI_QUESTION_MODEL=gpt-4.1-mini
```

AI-generated questions are returned as drafts. A teacher must review and explicitly save each question before it enters the approved bank.

## Supported learning-material uploads

The AI generator accepts TXT, Markdown, CSV, XLSX and XLS files up to 5 MB. Pasted notes are also supported. Material text is limited before it is sent to the selected AI provider.

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
