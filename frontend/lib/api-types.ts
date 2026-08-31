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
