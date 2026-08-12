// Pulled out of director.ts so client components (like DirectorChat) can
// import this constant without pulling in the server-only AI/Sharp
// dependency chain into the browser bundle.
export const SUGGESTED_QUESTIONS = [
  "What should I post this week?",
  "Which wedding should I prioritize?",
  "Show me my 10 strongest unused photographs.",
  "Create a 7-day content plan.",
  "What content is missing from my feed?",
  "Which competitor is doing something we should learn from?",
  "Why isn't my Instagram growing?",
];
