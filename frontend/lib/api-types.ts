/**
 * Response shapes returned by the AuthCore backend.
 *
 * Mirrors `backend/src/middleware/error.middleware.ts` and the auth controllers.
 * Every handler answers with `{ success, ... }`; errors add `message` and
 * sometimes `code`, and Zod failures add a per-field `errors` array.
 */

export type ApiSuccess<TData = undefined> = {
  success: true
  message?: string
  data: TData
}

export type ApiFieldError = {
  field: string
  message: string
}

export type ApiErrorBody = {
  success: false
  message: string
  /** Present on AppError responses, e.g. "API_KEY_MISSING". */
  code?: string
  /** Present only on 400 validation failures. */
  errors?: ApiFieldError[]
}

/**
 * The user object returned by /auth/me and /auth/login.
 * Mirrors `SafeUser` in backend/src/services/user.service.ts — note that
 * `email` is nullable there, and `createdAt` arrives as an ISO string over JSON.
 */
export type SafeUser = {
  id: string
  firstName: string | null
  lastName: string | null
  username: string | null
  avatarUrl: string | null
  email: string | null
  emailVerified: boolean
  createdAt: string
}

/** POST /auth/login — the backend branches on `mfaRequired`. */
export type LoginResponseData =
  | {
      mfaRequired: false
      user: SafeUser
    }
  | {
      mfaRequired: true
      challengeToken: string
      expiresAt: string
    }

/** POST /auth/signup */
export type SignupResponseData = {
  user: SafeUser
  emailSent: boolean
}

/** GET /auth/me, POST /auth/mfa/challenge */
export type UserResponseData = {
  user: SafeUser
}

export type ApplicationStatus = "ACTIVE" | "SUSPENDED" | "DELETED"

/**
 * Mirrors the Prisma `Application` model, which
 * `listApplicationsForUser`/`getApplicationForUser` return unshaped — every
 * scalar column is on the wire. Dates arrive as ISO strings over JSON.
 *
 * Note there is no member count here: the list query has no `_count`, so a
 * "N members" stat is not available from this endpoint without a second
 * request per application.
 */
export type Application = {
  id: string
  ownerId: string
  name: string
  slug: string
  status: ApplicationStatus
  logoUrl: string | null
  homepageUrl: string | null
  allowedOrigins: string[]
  redirectUris: string[]
  accessTokenTtlSec: number
  refreshTokenTtlSec: number
  createdAt: string
  updatedAt: string
}

/** GET /applications */
export type ApplicationListResponseData = {
  applications: Application[]
}

/** POST /applications, GET /applications/:id */
export type ApplicationResponseData = {
  application: Application
}

export type MemberStatus = "ACTIVE" | "INVITED" | "SUSPENDED"

/** Mirrors `MemberSummary` in backend/src/services/member.service.ts. */
export type MemberSummary = {
  membershipId: string
  userId: string
  status: MemberStatus
  /** Role names, e.g. ["Owner"]. */
  roles: string[]
  joinedAt: string
}

/** GET /applications/:id/members — gated on the member:list permission. */
export type MemberListResponseData = {
  members: MemberSummary[]
}

/**
 * What `serializeApiKey` in api-key.controller.ts actually emits — deliberately
 * narrower than the Prisma model. The secret itself is returned once, at
 * creation, and never again; the list carries only the prefix.
 */
export type ApiKeySummary = {
  id: string
  name: string
  prefix: string
  createdAt: string
  revokedAt: string | null
}

/** GET /applications/:id/keys — gated on the apikey:list permission. */
export type ApiKeyListResponseData = {
  apiKeys: ApiKeySummary[]
}

/**
 * POST /applications/:id/keys.
 *
 * `rawKey` is the only time the secret exists outside the caller's hands — the
 * backend stores a hash and has no way to reproduce it. If it is not copied
 * before this response is discarded, it is gone and a new key must be created.
 */
export type ApiKeyCreateResponseData = {
  apiKey: ApiKeySummary
  rawKey: string
}

/** DELETE /applications/:id/keys/:keyId — returns the key with revokedAt set. */
export type ApiKeyRevokeResponseData = {
  apiKey: ApiKeySummary
}

/** A role belonging to one Application. Roles are seeded per application. */
export type ApplicationRole = {
  id: string
  name: string
}

/**
 * Mirrors `PendingInvitationSummary` in
 * backend/src/services/invitation.service.ts.
 *
 * `invitedBy` is a bare userId — like the members list, there is no user
 * lookup, so it cannot be resolved to a name.
 */
export type PendingInvitation = {
  id: string
  invitedEmail: string
  roleId: string
  roleName: string
  invitedBy: string
  createdAt: string
  expiresAt: string
}

/** GET /applications/:id/invitations — gated on the member:invite permission. */
export type InvitationListResponseData = {
  invitations: PendingInvitation[]
}

/**
 * POST /applications/:id/invitations.
 *
 * Note this is *narrower* than the list row — no roleId, roleName or
 * invitedBy — so the new row cannot be assembled from it alone.
 */
export type InvitationCreateResponseData = {
  invitation: {
    id: string
    email: string
    createdAt: string
    expiresAt: string
  }
}

/**
 * POST /auth/mfa/totp/enroll.
 *
 * Mirrors `TotpEnrollment` in backend/src/services/mfa.service.ts. `secret` is
 * plaintext — the manual-entry fallback for scanning the QR — and neither
 * value is retrievable again once this response is gone: enrolling again
 * replaces the pending method with a fresh secret rather than returning the
 * old one.
 */
export type MfaEnrollResponseData = {
  secret: string
  qrCodeDataUrl: string
  /** Always false here — the method is inert until verify-setup confirms it. */
  verified: false
}

/**
 * POST /auth/mfa/totp/verify-setup.
 *
 * `recoveryCodes` exists in the clear exactly once, in this response —
 * verify-setup generates them as part of the same transaction that turns MFA
 * on, and nothing stores them unhashed. `recoveryCodesShownOnce` is the
 * backend's own signal that there is no view-again path, echoed here so nothing
 * on this side has to assume it.
 */
export type MfaVerifySetupResponseData = {
  verified: true
  recoveryCodes: string[]
  recoveryCodesShownOnce: true
}

/** POST /auth/mfa/recovery-codes/regenerate — same shape as verify-setup's codes. */
export type MfaRegenerateRecoveryCodesResponseData = {
  recoveryCodes: string[]
  recoveryCodesShownOnce: true
}

/**
 * GET /auth/mfa/status.
 *
 * Mirrors `getMfaStatus` in backend/src/services/mfa.service.ts — deliberately
 * minimal, no method type or device info. `enrolledAt` is an ISO string
 * (the backend converts it before responding) and only present when enabled.
 */
export type MfaStatusResponseData = {
  enabled: boolean
  enrolledAt: string | null
}
