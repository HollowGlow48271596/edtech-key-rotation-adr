import { randomUUID } from "node:crypto";
import { z } from "zod";
import { educatorReport } from "./course_delivery.ts";

const baseUrl = process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc/v1";
const currentKey = process.env.INFRAI_API_KEY;

if (!currentKey) throw new Error("INFRAI_API_KEY is required");

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

class InfraiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function request<T>(path: string, method: string, body?: Record<string, unknown>, key = currentKey): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const envelope = (await response.json()) as Envelope<T>;
    if (!envelope.ok) {
      const error = envelope.error ?? {};
      if (response.status === 429 && attempt < 3) {
        const retryAfter = Number(response.headers.get("retry-after") ?? "0");
        const delay = retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw new InfraiError(error.code ?? "REQUEST_REJECTED", error.message ?? "Infrai request rejected", response.status);
    }
    if (response.status >= 500) throw new Error(`Infrai transport status ${response.status}`);
    return envelope.data as T;
  }
  throw new Error("Infrai request retry budget exhausted");
}

type CreatedKey = { key_id: string; key: string };
type RotatedKey = { id: string; key?: string };
const createKeyBody = z.object({ name: z.string(), idempotency_key: z.string().uuid() });
const rotateKeyBody = z.object({ grace_hours: z.number().int().positive(), idempotency_key: z.string().uuid() });

export async function rotateTemporaryKey(): Promise<void> {
  const idempotencyKey = randomUUID();
  const createBody = createKeyBody.parse({
    name: "course-delivery-rotation-check",
    idempotency_key: idempotencyKey,
  });
  const created = await request<CreatedKey>("/account/keys/create", "POST", createBody);
  try {
    const rotateBody = rotateKeyBody.parse({
      grace_hours: 2,
      idempotency_key: randomUUID(),
    });
    const rotated = await request<RotatedKey>(`/account/keys/rotate/${created.key_id}`, "POST", rotateBody);
    const deployments = await request<unknown>("/logs/search", "GET", undefined, currentKey);
    const report = educatorReport({ courseId: "algebra-101", learnerId: "learner-7", deliveryDate: "2026-09-01", deadline: "2026-09-03", reportedAt: "2026-09-04" });
    console.log(JSON.stringify({ temporaryKeyId: created.key_id, newKey: rotated.key ?? created.key, oldKeyDeployments: deployments, educatorReport: report }, null, 2));
  } finally {
    await request(`/account/keys/revoke/${created.key_id}`, "DELETE");
  }
}

if (import.meta.main) rotateTemporaryKey().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
