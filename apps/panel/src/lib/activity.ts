import { prisma } from "./db";

export interface ActivityInput {
  event: string;
  userId?: number | null;
  serverId?: number | null;
  ip?: string | null;
  properties?: Record<string, unknown>;
}

/** Fire-and-forget audit logging; never throws into request handlers. */
export async function logActivity(input: ActivityInput): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        event: input.event,
        userId: input.userId ?? null,
        serverId: input.serverId ?? null,
        ip: input.ip ?? null,
        properties: JSON.stringify(input.properties ?? {}),
      },
    });
  } catch {
    // Audit failures must not break the action that triggered them.
  }
}
