// tests/unit/match.test.js
//   Verifies the skill-overlap match score + skill-set builder.
import { describe, test, expect } from "vitest";
import { rebuildUserSkillSet, computeMatch } from "../../js/lib/match.js";

describe("rebuildUserSkillSet()", () => {
  test("merges profile skills with CV-detected skills", () => {
    const set = rebuildUserSkillSet({
      skills: ["React", "Node.js"],
      resumeAnalysis: { detectedSkills: ["TypeScript", "Node.js"] },
    });
    // Lowercase + deduped — Node.js appears in both.
    expect(set.has("react")).toBe(true);
    expect(set.has("node.js")).toBe(true);
    expect(set.has("typescript")).toBe(true);
    expect(set.size).toBe(3);
  });

  test("normalises to lowercase + trims whitespace", () => {
    const set = rebuildUserSkillSet({ skills: ["  React  ", "REACT", "react"] });
    expect(set.size).toBe(1);
    expect(set.has("react")).toBe(true);
  });

  test("ignores non-string entries silently", () => {
    const set = rebuildUserSkillSet({ skills: ["valid", 42, null, undefined, {}] });
    expect(set.size).toBe(1);
    expect(set.has("valid")).toBe(true);
  });

  test("returns empty Set when both fields are missing", () => {
    expect(rebuildUserSkillSet({}).size).toBe(0);
    expect(rebuildUserSkillSet(null).size).toBe(0);
    expect(rebuildUserSkillSet(undefined).size).toBe(0);
  });

  test("ignores resumeAnalysis.detectedSkills if not an array", () => {
    const set = rebuildUserSkillSet({
      skills: ["one"],
      resumeAnalysis: { detectedSkills: "not-an-array" },
    });
    expect(set.size).toBe(1);
    expect(set.has("one")).toBe(true);
  });

  test("drops empty strings after trim", () => {
    const set = rebuildUserSkillSet({ skills: ["", "   ", "valid"] });
    expect(set.size).toBe(1);
    expect(set.has("valid")).toBe(true);
  });
});

describe("computeMatch()", () => {
  test("returns null when user has no skills (UI hides chip)", () => {
    expect(computeMatch(["react", "node"], new Set())).toBeNull();
    expect(computeMatch(["react"], null)).toBeNull();
    expect(computeMatch(["react"], undefined)).toBeNull();
  });

  test("returns 0 when internship has no skills", () => {
    const userSkills = new Set(["react", "node"]);
    expect(computeMatch([], userSkills)).toBe(0);
    expect(computeMatch(null, userSkills)).toBe(0);
    expect(computeMatch(undefined, userSkills)).toBe(0);
  });

  test("returns 100 when user has every required skill", () => {
    const userSkills = new Set(["react", "node", "typescript"]);
    expect(computeMatch(["React", "Node", "TypeScript"], userSkills)).toBe(100);
  });

  test("returns 0 when user has none of the required skills", () => {
    const userSkills = new Set(["python", "django"]);
    expect(computeMatch(["React", "Node"], userSkills)).toBe(0);
  });

  test("returns the rounded percentage of overlap", () => {
    const userSkills = new Set(["react", "node"]);
    // User has 2 of 3 required
    expect(computeMatch(["React", "Node", "TypeScript"], userSkills)).toBe(67);
  });

  test("comparison is case-insensitive on both sides", () => {
    const userSkills = new Set(["react"]);
    expect(computeMatch(["REACT"], userSkills)).toBe(100);
    expect(computeMatch(["React"], userSkills)).toBe(100);
    expect(computeMatch(["react"], userSkills)).toBe(100);
  });

  test("comparison ignores leading/trailing whitespace in jobSkills", () => {
    const userSkills = new Set(["react"]);
    expect(computeMatch(["  react  "], userSkills)).toBe(100);
  });

  test("non-string entries in jobSkills don't crash", () => {
    const userSkills = new Set(["react"]);
    expect(computeMatch(["react", null, undefined, 42], userSkills)).toBe(25);
  });
});
