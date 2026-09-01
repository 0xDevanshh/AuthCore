import { Prisma, type AuditActorType } from "@prisma/client";

import { prisma } from "../config/prisma.ts";
import { logger } from "../config/logger.ts";

import {
  AUDIT_LOG_DEFAULT_LIMIT,
  AUDIT_LOG_MAX_LIMIT,
  type AuditAction,
} from "../types/audit.types.ts";

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

/**
 * The acting user, resolved for display. Null when the entry has no user —
 * a SYSTEM or API_KEY actor, or a user row since deleted (the relation is
 * `onDelete: SetNull`).
 */
export interface AuditLogActor {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

export interface AuditLogEntry {
  id: string;

  action: string;
  actorType: AuditActorType;

  applicationId: string | null;
  userId: string | null;
  apiKeyId: string | null;

  actor: AuditLogActor | null;

  resourceType: string | null;
  resourceId: string | null;

  ipAddress: string | null;
  userAgent: string | null;

  /**
   * Returned exactly as stored. Callers reading an audit trail need the whole
   * payload — reshaping or trimming it here would quietly discard the detail
   * that makes an entry worth keeping.
   */
  metadata: Prisma.JsonValue | null;

  createdAt: Date;
}

export interface ListAuditLogsParams {
  applicationId: string;

  /** Id of the last entry from the previous page. */
  cursor?: string;

  limit?: number;

  /** Exact match on a known action. */
  action?: string;
}

export interface ListAuditLogsResult {
  logs: AuditLogEntry[];

  /** Cursor for the next page, or null when this was the last one. */
  nextCursor: string | null;
}

/*
 * ON applicationId COMPLETENESS
 *
 * Every one of the 23 call sites that writes an audit entry passes an
 * applicationId, so this endpoint is not silently dropping whole categories of
 * event. Verified by inspection rather than assumed:
 *
 *   - control-plane writes (APPLICATION_CREATED, APPLICATION_KEY_*, MEMBER_*,
 *     INVITATION_*) pass it explicitly from the resource being changed;
 *   - auth writes behind `resolveApplication` pass `req.applicationId`;
 *   - writes on requireAuth-only routes (PASSWORD_CHANGED, SESSIONS_REVOKED,
 *     MFA_*) pass `req.auth.applicationId`, which `requireAuth` reads off the
 *     session row;
 *   - the OAuth callbacks, which have no resolver, recover it from the signed
 *     OAuth state cookie.
 *
 * Two residual gaps are worth knowing about, neither of which is fixed here —
 * per the instruction not to migrate historical rows:
 *
 *   1. Both `Session.applicationId` and `AuditLog.applicationId` are nullable,
 *      and several services take it as `options.applicationId ?? null`. Nothing
 *      currently creates a session without an application, but the types allow
 *      it, and any entry written from such a session would carry a null
 *      applicationId and be invisible to this query.
 *
 *   2. `AuditLog.application` is declared `onDelete: SetNull`. Deleting an
 *      Application therefore detaches its audit history rather than removing
 *      it: the rows survive but no longer match any applicationId, so they
 *      cannot be listed through this endpoint afterwards.
 *
 * Both concern rows this endpoint cannot reach, not rows it reports wrongly.
 * Making applicationId non-null on future writes would be a schema change and a
 * separate decision.
 */
export async function listAuditLogs(
  params: ListAuditLogsParams,
): Promise<ListAuditLogsResult> {
  // Clamped rather than trusted: the route validates too, but this is also
  // callable directly, and an unbounded take is the kind of thing that only
  // hurts in production.
  const limit = Math.min(
    Math.max(
      params.limit ?? AUDIT_LOG_DEFAULT_LIMIT,
      1,
    ),
    AUDIT_LOG_MAX_LIMIT,
  );

  const rows = await prisma.auditLog.findMany({
    where: {
      applicationId: params.applicationId,

      ...(params.action
        ? { action: params.action }
        : {}),
    },

    // One more than asked for: if it comes back, there is another page. This
    // avoids a second count() query just to decide whether to send a cursor.
    take: limit + 1,

    ...(params.cursor
      ? {
          cursor: { id: params.cursor },
          // Skip the cursor row itself, which belongs to the previous page.
          skip: 1,
        }
      : {}),

    // `createdAt` alone is not unique — entries written inside one transaction
    // can share a timestamp — and a non-deterministic order would let cursor
    // paging skip or repeat rows. The id tiebreak makes the sequence total.
    orderBy: [
      { createdAt: "desc" },
      { id: "desc" },
    ],

    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,

          emails: {
            where: { isPrimary: true },
            select: { email: true },
            take: 1,
          },
        },
      },
    },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const logs: AuditLogEntry[] = page.map((row) => ({
    id: row.id,

    action: row.action,
    actorType: row.actorType,

    applicationId: row.applicationId,
    userId: row.userId,
    apiKeyId: row.apiKeyId,

    actor: row.user
      ? {
          id: row.user.id,
          firstName: row.user.firstName,
          lastName: row.user.lastName,
          email:
            row.user.emails[0]?.email ?? null,
        }
      : null,

    resourceType: row.resourceType,
    resourceId: row.resourceId,

    ipAddress: row.ipAddress,
    userAgent: row.userAgent,

    metadata: row.metadata,

    createdAt: row.createdAt,
  }));

  return {
    logs,

    nextCursor: hasMore
      ? (page[page.length - 1]?.id ?? null)
      : null,
  };
}
