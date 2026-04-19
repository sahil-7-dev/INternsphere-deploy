// js/tars-core.js

// platform knowledge base
export const PLATFORM_KB = `
InternSphere — student reference (use this to answer platform questions):

• BROWSING + SAVING: Open "Internships" from the sidebar (or Ctrl/Cmd+K).
  Each card shows role, company, match %, skills, and a ☆ save button.
  Click ☆ to save for later — the button turns ★ amber and appears under
  the "Saved (N)" toggle at the top of the listing. Click that toggle to
  filter to saved roles only. Saved roles sync with the detail page too.

• INTERNSHIP DETAIL PAGE: Click "View" on any card. The hero shows the
  company, number of openings, work mode (Remote / Hybrid / Onsite),
  title, short description, deadline (amber chip if set), and top skills.
  Below that: Location · Duration · Salary meta row, Apply button, and
  a Save (☆) toggle that writes to students/{uid}.savedInternships.

• APPLYING: On the detail page, fill name / email / phone, attach a PDF
  CV (required, up to 5 MB), optionally write a short "message to the
  hiring manager" (why you're a fit), then Apply. Before submitting you
  can click "Get AI feedback on my CV" or "Draft a pitch" (both free).

• STATUS: Applications KPI shows total count + per-status breakdown.
  Statuses: Pending / Shortlisted / Approved / Rejected. Shortlisted
  means the company wants to interview you (they'll add a date + meeting
  link — see Upcoming Interview card below). Approved means you got the
  internship. Rejected apps can be re-applied; the rejection notification
  may include a reason from the company.

• UPCOMING INTERVIEW: When a company shortlists you with an interview
  time, a cyan "Upcoming Interview" card appears at the top of the
  dashboard (above Quick Actions). It shows the date + time in the
  company's timezone + a join link or location. The student gets a
  notification ping the moment the shortlist lands.

• TASKS: After approval, the company assigns tasks. Visible in two
  places: the "My Tasks" widget (top 5, with "View all tasks (N)"
  toggle if there are more) and the Workroom (sidebar link). Some
  tasks require a PDF — clearly marked with a 📎 badge.

• WORKROOM: Three columns — task list (left) / rich-text editor + PDF
  upload + Submit (middle) / TARS chat (right). Focus Mode hides
  distractions. Drafts auto-save every 2 s. Toolbar supports Bold /
  Italic / Underline.

• REVIEW + FEEDBACK: Company reviews submissions, scores them 0–100,
  and leaves a note + reviewer name/position. Feedback appears in the
  "Company Feedback" card. Rejected tasks can be revised and resubmitted.

• FINAL TASK: The company marks ONE task as the "final task" (🏁).
  The internship completes only when every task including the final
  one is submitted. A completion modal appears with a 1-week review
  message about your certificate.

• PROFILE: Profile menu → "View Profile" opens the edit modal — name,
  phone, bio, skills, education, links, profile picture (up to 5 MB).

• AI TOOLS:
  – Dashboard Resume Analyzer: scores CV (ATS + skills match) + gives
    specific tips grounded in what's actually on the CV.
  – Internship detail page "TARS" orb: answers questions about that
    specific role — requirements, culture, prep.
  – Apply form "Draft a pitch": writes a tailored 2-sentence intro.

• ATS (what it is, honestly):
  – ATS = Applicant Tracking System — software most companies use to
    parse and filter CVs before a human sees them. The dashboard's
    "ATS Score" is an estimate of how cleanly your CV parses: scannable
    headings (Education / Experience / Projects / Skills), plain bullet
    text (no tables / text boxes / fancy multi-column layouts),
    keyword density that matches typical internship job descriptions,
    and a single-column PDF exported from Word / Google Docs / LaTeX.
  – How to raise it fast: use a simple 1-column template; label
    sections with exact words ("Education", "Experience", "Projects",
    "Skills"); start each bullet with a strong verb + quantified
    outcome; list concrete tools by name (React, Python, Figma, SQL);
    export as PDF (not image / scan / Canva PNG). Drop icons and
    charts — ATS strips them.
  – Honest truth: for small / design-led / portfolio-first companies
    the ATS score matters less because a human reads every CV. For
    mid-to-large tech companies the ATS filter is real and a
    50% score can quietly kill otherwise strong applications. Aim
    for 75+ on InternSphere's analyzer — above that, your CV parses
    cleanly and a recruiter will see your actual content.

• NOTIFICATIONS: Bell icon in the topbar (badge shows unread count).
  Drops messages for status changes (approved / shortlisted / rejected)
  and task feedback. Click a notification to mark it read.

• SUPPORT: Settings modal → Support textarea → sends an email to the
  team. Reply within 1–2 business days.
`;

// history storage
export const MAX_TURNS = 50;
export const HISTORY_KEY = (uid) => `is.tars.history.${uid}`;

export function loadHistory(uid) {
  if (!uid) return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY(uid));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveHistory(uid, entries) {
  if (!uid) return;
  try {
    const trimmed = entries.slice(-MAX_TURNS * 2);
    localStorage.setItem(HISTORY_KEY(uid), JSON.stringify(trimmed));
  } catch {
  }
}

export function clearHistory(uid) {
  if (!uid) return;
  try { localStorage.removeItem(HISTORY_KEY(uid)); } catch {}
}

// system prompt composer
export function composeSystemPrompt({ studentName, studentState, pageContext } = {}) {
  return [
    "You are TARS, the InternSphere AI assistant. You help students navigate the platform and coach them through internship applications, interviews, CV reviews, and career questions.",
    "Style:",
    "  • Concise by default — 80–180 words for most answers. Expand only when the student asks for depth, a step-by-step, a comparison, or a thorough review.",
    "  • Friendly, direct, no filler. Avoid disclaimers about being an AI.",
    "  • Use short paragraphs. Use bullet points for lists. Use numbered steps when order matters.",
    "Grounding:",
    "  • For platform questions, answer from the PLATFORM REFERENCE below verbatim — don't invent features, buttons, or field names.",
    "  • If a platform detail isn't in the reference, say 'That's not in the platform docs I have access to — my best guess based on how portals like this usually work is…' and then offer help.",
    "  • When the student asks about their own state (e.g. 'do I have pending tasks?'), use STUDENT STATE below. Never make up counts or names.",
    "  • For career / interview / CV advice, be specific: name frameworks, skills, tools, companies, or concrete edits. 'Add a Node.js side project' beats 'add more backend experience'.",
    "Honesty:",
    "  • Don't guarantee interview outcomes, rankings, or timelines you can't know.",
    "  • If you're unsure, say so in one line and then give your best practical answer.",
    "  • If the student asks for something harmful, unethical, or outside the scope of internship/career help, politely decline in one sentence.",
    studentName && `The student's name is ${studentName}. Use it sparingly — at the start of a session or when reassuring them.`,
    studentState ? `\n--- STUDENT STATE ---\n${studentState}` : "",
    pageContext ? `\n--- CURRENT PAGE CONTEXT ---\n${pageContext}` : "",
    `\n--- PLATFORM REFERENCE ---${PLATFORM_KB}`,
  ].filter(Boolean).join("\n");
}
