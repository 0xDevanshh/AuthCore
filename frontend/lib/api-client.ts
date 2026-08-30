import axios, {
  AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from "axios"

import type { ApiErrorBody } from "@/lib/api-types"

/*
 * ============================================================================
 * BLOCKER — the developer-dashboard auth endpoints currently require an API key
 * ============================================================================
 *
 * This was checked against the backend rather than assumed, and the assumption
 * that these routes sit outside the API-key middleware does NOT hold today.
 *
 * In `backend/src/routes/auth.routes.ts`, every one of these runs through
 * `resolveApplication`:
 *
 *     /auth/signup            /auth/login             /auth/refresh
 *     /auth/logout            /auth/forgot-password   /auth/reset-password
 *     /auth/verify-email      /auth/resend-verification
 *     /auth/mfa/challenge
 *
 * `resolveApplication` (backend/src/middleware/resolveApplication.middleware.ts)
 * has no control-plane bypass: with no `X-AuthCore-Key` header it throws
 * 401 `API_KEY_MISSING` before the controller runs.
 *
 * These, by contrast, are session-only (`requireAuth`, no API key) and work
 * with this client exactly as written:
 *
 *     /auth/me                /auth/change-password
 *     /auth/mfa/totp/enroll   /auth/mfa/totp/verify-setup
 *     /auth/mfa/recovery-codes/*
 *     /applications/**        (the whole control plane)
 *
 * So the dashboard can *read* the control plane with a session but cannot
 * *obtain* one — login is gated behind a key, and keys are minted per
 * Application, which requires a session. That is a bootstrap gap in the backend.
 *
 * No API key is shipped from here on purpose. `verifyApiKey` in
 * application.service.ts matches `type: ApiKeyType.SECRET` only — it rejects
 * PUBLISHABLE keys — so the only key that would satisfy the middleware is a
 * secret one, and putting a secret in a NEXT_PUBLIC_ bundle would publish it to
 * every visitor. A leaked credential is worse than a failing request.
 *
 * The fix belongs in the backend: either drop `resolveApplication` from the
 * control-plane auth routes, or make it accept a PUBLISHABLE key. Until then,
 * login/signup will fail with 401 API_KEY_MISSING and `isMissingApiKeyError()`
 * below identifies that case so the UI can say so plainly instead of showing
 * "invalid credentials".
 */

/**
 * Base URL for the API, e.g. "http://localhost:8000/api/v1".
 *
 * The backend mounts its router at `/api/v1` (backend/src/app.ts) and defaults
 * to port 8000 (config/env.ts), so that is the default here.
 */
const baseURL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1"

export const apiClient = axios.create({
  baseURL,

  /*
   * Required. The backend authenticates browsers with httpOnly cookies
   * (`ac_access` / `ac_refresh`, set by setAuthCookies in utils/cookies.ts) and
   * runs CORS with `credentials: true` against a single fixed origin. Without
   * this, no cookie is sent and every authenticated call 401s.
   */
  withCredentials: true,

  headers: {
    "Content-Type": "application/json",
  },
})

/*
 * ---------------------------------------------------------------------------
 * In-memory access token
 * ---------------------------------------------------------------------------
 *
 * Deliberately a module-level variable and never localStorage/sessionStorage:
 * a token in persistent storage survives the tab and is readable by any script
 * on the origin. This is cleared on refresh-failure and logout.
 *
 * Worth knowing how the current backend behaves: it never hands an access token
 * to JavaScript. `loginController` returns only `{ mfaRequired, user }` and
 * `refreshController` returns only `{ success: true }` — both deliver the token
 * as an httpOnly cookie instead, which JS cannot read by design. So in practice
 * this stays null and the cookie does the authenticating.
 *
 * The mechanism is kept because `requireAuth` (auth.middleware.ts) does accept
 * `Authorization: Bearer` as a fallback to the cookie. If the backend later
 * returns a token in a response body, call `setAccessToken` and the header is
 * attached from then on — no other change needed.
 */
let accessToken: string | null = null

export function getAccessToken(): string | null {
  return accessToken
}

export function setAccessToken(token: string | null): void {
  accessToken = token
}

export function clearAccessToken(): void {
  accessToken = null
}

/** Called when a refresh fails, so auth-context can drop its user state. */
type SessionExpiredHandler = () => void

let onSessionExpired: SessionExpiredHandler | null = null

export function setSessionExpiredHandler(
  handler: SessionExpiredHandler | null,
): void {
  onSessionExpired = handler
}

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (accessToken) {
      config.headers.set("Authorization", `Bearer ${accessToken}`)
    }

    return config
  },
)

/** Marks a request that has already been retried, so one 401 can't loop. */
type RetriableConfig = AxiosRequestConfig & { _retried?: boolean }

/*
 * Per-request options this client understands, declared on axios' own config so
 * they can be passed to apiClient.get/post directly.
 *
 * `suppressLoginRedirect` keeps a failed refresh from navigating away. The
 * session is still cleared and the error still rejects — only the redirect is
 * skipped. Used by the "is anyone signed in?" check on mount, which legitimately
 * fails for anonymous visitors and must not bounce them off a public page.
 */
declare module "axios" {
  export interface AxiosRequestConfig {
    suppressLoginRedirect?: boolean
  }
}

/*
 * A single in-flight refresh shared by every 401 that arrives while it runs.
 * Without this, a page issuing several parallel requests on a stale token fires
 * one refresh each — and since the backend rotates the refresh token on every
 * call (rotateRefreshToken in session.service.ts), the losers would present an
 * already-rotated token and be treated as replay.
 */
let refreshInFlight: Promise<void> | null = null

function refreshSession(): Promise<void> {
  refreshInFlight ??= apiClient
    .post("/auth/refresh")
    .then(() => undefined)
    .finally(() => {
      refreshInFlight = null
    })

  return refreshInFlight
}

/** True for the 401 the API-key middleware raises — see the note at the top. */
export function isMissingApiKeyError(error: unknown): boolean {
  const code = getApiErrorCode(error)
  return code === "API_KEY_MISSING" || code === "API_KEY_INVALID"
}

export function getApiErrorCode(error: unknown): string | undefined {
  return axios.isAxiosError<ApiErrorBody>(error)
    ? error.response?.data?.code
    : undefined
}

/** Human-readable message from an error response, with a sane fallback. */
export function getApiErrorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    if (!error.response) {
      return "Could not reach the server. Check your connection and try again."
    }

    return error.response.data?.message ?? fallback
  }

  return fallback
}

/** Field-level errors from a 400, keyed by field name, for form display. */
export function getApiFieldErrors(
  error: unknown,
): Record<string, string> | null {
  if (!axios.isAxiosError<ApiErrorBody>(error)) {
    return null
  }

  const errors = error.response?.data?.errors

  if (!errors?.length) {
    return null
  }

  return Object.fromEntries(errors.map((e) => [e.field, e.message]))
}

/*
 * Endpoints that must never trigger the refresh-and-retry dance.
 *
 * /auth/refresh itself would recurse. /auth/login and /auth/me legitimately
 * answer 401 on bad credentials or no session, and retrying those would turn a
 * normal "wrong password" into a spurious refresh attempt and a redirect.
 */
const NO_REFRESH_PATHS = ["/auth/refresh", "/auth/login", "/auth/logout"]

function shouldSkipRefresh(url: string | undefined): boolean {
  if (!url) {
    return false
  }

  return NO_REFRESH_PATHS.some((path) => url.startsWith(path))
}

apiClient.interceptors.response.use(
  (response) => response,

  async (error: AxiosError<ApiErrorBody>) => {
    const original = error.config as
      | (RetriableConfig & InternalAxiosRequestConfig)
      | undefined

    const status = error.response?.status

    /*
     * Only a 401 is retriable, and only once. A 401 carrying API_KEY_MISSING is
     * not a session problem at all (see the top of this file) — refreshing would
     * fail the same way, so it is passed straight through.
     */
    if (
      status !== 401 ||
      !original ||
      original._retried ||
      shouldSkipRefresh(original.url) ||
      isMissingApiKeyError(error)
    ) {
      return Promise.reject(error)
    }

    original._retried = true

    try {
      await refreshSession()
    } catch {
      // Refresh failed: the session is genuinely gone.
      clearAccessToken()
      onSessionExpired?.()

      /*
       * The bootstrap check opts out of the redirect — an anonymous visitor
       * legitimately has no session, and bouncing them off a public page for it
       * would be wrong. State is still cleared and the error still propagates.
       */
      if (!original.suppressLoginRedirect) {
        redirectToLogin()
      }

      return Promise.reject(error)
    }

    return apiClient(original)
  },
)

/**
 * Full-page assignment rather than the Next router: this runs from a module with
 * no hook context, and a hard navigation is the right outcome anyway — it drops
 * any in-memory state belonging to the expired session.
 *
 * Guarded so it is inert during SSR and so an expired session while already on
 * /login doesn't reload the page in a loop.
 */
function redirectToLogin(): void {
  if (typeof window === "undefined") {
    return
  }

  if (window.location.pathname === "/login") {
    return
  }

  /*
   * eslint rightly prefers useRouter()/redirect() for internal navigation, but
   * neither is reachable from a module-scope axios interceptor, and a soft push
   * is the wrong behaviour here anyway: it would keep the React tree — and any
   * data cached from the now-dead session — alive across the transition.
   */
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/login")
}
