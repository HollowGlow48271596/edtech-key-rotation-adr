import assert from "node:assert/strict";
import { educatorReport } from "./course_delivery.ts";

const report = educatorReport({
  courseId: "algebra-101",
  learnerId: "learner-7",
  deliveryDate: "2026-09-01",
  deadline: "2026-09-03",
  reportedAt: "2026-09-04",
});

assert.equal(report.state, "reported");
assert.equal(report.courseId, "algebra-101");
console.log("course delivery decision: reported");

