import { Prisma, type AuditActorType } from "@prisma/client";

import { prisma } from "../config/prisma.ts";
import { logger } from "../config/logger.ts";

import type { AuditAction } from "../types/audit.types.ts";

export interface AuditEventInput {
  action: AuditAction;
  actorType: AuditActorType;

  applicationId?: string | null;
  userId?: string | null;
  apiKeyId?: string | null;

  resourceType?: string | null;
  resourceId?: string | null;

  ipAddress?: string | null;
  userAgent?: string | null;

  metadata?: Prisma.InputJsonValue;

  /**
   * Write the entry inside an existing transaction. Use this when the audit
   * row must live or die with the change it describes — for example a
   * creation event whose applicationId is a foreign key to the new row.
   */
  tx?: Prisma.TransactionClient;
}

/**
 * Records an audit entry.
 *
 * Standalone writes are best-effort: a logging failure is reported but never
 * propagated, so auditing cannot take down the request it is describing.
 * Transactional writes (`tx` supplied) propagate instead — the caller has
 * already asked for all-or-nothing semantics.
 */
export async function logAuditEvent(
  input: AuditEventInput,
): Promise<void> {
  const data: Prisma.AuditLogUncheckedCreateInput = {
    action: input.action,
    actorType: input.actorType,

    applicationId: input.applicationId ?? null,
    userId: input.userId ?? null,
    apiKeyId: input.apiKeyId ?? null,

    resourceType: input.resourceType ?? null,
    resourceId: input.resourceId ?? null,

    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
  };

  if (input.metadata !== undefined) {
    data.metadata = input.metadata;
  }

  if (input.tx) {
    await input.tx.auditLog.create({ data });

    return;
  }

  try {
    await prisma.auditLog.create({ data });
  } catch (error) {
    logger.error(
      { err: error, action: input.action },
      "Failed to write audit log entry",
    );
  }
}
