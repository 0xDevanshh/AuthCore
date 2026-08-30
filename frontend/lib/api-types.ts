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
