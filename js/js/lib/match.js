// js/lib/match.js

export function rebuildUserSkillSet(studentData) {
  const next = new Set();
  const push = (s) => {
    if (typeof s !== "string") return;
    const norm = s.trim().toLowerCase();
    if (norm) next.add(norm);
  };
  if (Array.isArray(studentData?.skills)) studentData.skills.forEach(push);
  const detected = studentData?.resumeAnalysis?.detectedSkills;
  if (Array.isArray(detected)) detected.forEach(push);
  return next;
}

export function computeMatch(jobSkills, userSkillSet) {
  if (!userSkillSet || !userSkillSet.size) return null;
  if (!jobSkills || !jobSkills.length) return 0;
  let hits = 0;
  for (const s of jobSkills) {
    if (userSkillSet.has(String(s).trim().toLowerCase())) hits++;
  }
  return Math.round((hits / jobSkills.length) * 100);
}
