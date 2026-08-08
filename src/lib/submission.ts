export const HACKATHON_TAG = "the-realtime-hackathon";
export const HACKATHON_WINDOW = {
  startsAt: "2026-08-07T19:00:00-05:00",
  endsAt: "2026-08-09T10:00:00-05:00",
} as const;

export type SubmissionInput = {
  pitch: string;
  deployedUrl: string;
  demoUrl: string;
  repositoryUrl: string;
  tag: string;
  commitDates: readonly string[];
};

export type SubmissionCheck = {
  valid: boolean;
  errors: string[];
};

function isPublicUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateSubmission(input: SubmissionInput): SubmissionCheck {
  const errors: string[] = [];
  const startsAt = Date.parse(HACKATHON_WINDOW.startsAt);
  const endsAt = Date.parse(HACKATHON_WINDOW.endsAt);

  if (!input.pitch.trim()) errors.push("pitch-required");
  if ([...input.pitch].length > 280) errors.push("pitch-too-long");
  if (!isPublicUrl(input.deployedUrl)) errors.push("deployed-url-invalid");
  if (!isPublicUrl(input.demoUrl)) errors.push("demo-url-invalid");
  if (!isPublicUrl(input.repositoryUrl)) errors.push("repository-url-invalid");
  if (input.tag !== HACKATHON_TAG) errors.push("required-tag-missing");

  for (const date of input.commitDates) {
    const timestamp = Date.parse(date);
    if (
      !Number.isFinite(timestamp) ||
      timestamp < startsAt ||
      timestamp > endsAt
    ) {
      errors.push("commit-outside-window");
      break;
    }
  }

  return { valid: errors.length === 0, errors };
}
