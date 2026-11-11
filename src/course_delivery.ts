export type DeadlineState = "open" | "late" | "reported";

export type CourseDelivery = {
  courseId: string;
  learnerId: string;
  deliveryDate: string;
  deadline: string;
  reportedAt?: string;
};

export type EducatorReport = CourseDelivery & { state: DeadlineState };

export function educatorReport(delivery: CourseDelivery): EducatorReport {
  if (delivery.reportedAt) return { ...delivery, state: "reported" };
  if (delivery.deliveryDate > delivery.deadline) return { ...delivery, state: "late" };
  return { ...delivery, state: "open" };
}

