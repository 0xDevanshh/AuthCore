"use client"

import * as React from "react"

import {
  apiClient,
  clearAccessToken,
  getAccessToken,
  setAccessToken,
  setSessionExpiredHandler,
} from "@/lib/api-client"

import type {
  ApiSuccess,
  LoginResponseData,
  SafeUser,
  UserResponseData,
} from "@/lib/api-types"

import type { LoginInput, MfaChallengeInput } from "@/lib/validation-schemas"

/**
 * Result of a login attempt, surfaced so the page can branch without reading
 * axios responses itself. The backend answers /auth/login in one of two shapes
 * (see loginController) and this preserves that split.
 */
export type LoginResult =
  | { mfaRequired: false; user: SafeUser }
  | { mfaRequired: true; challengeToken: string; expiresAt: string }

type AuthContextValue = {
  user: SafeUser | null

  /**
   * True until the initial /auth/me check settles. Guards render so a
   * logged-in user never sees a flash of the signed-out UI on first paint.
   */
  isLoading: boolean

  isAuthenticated: boolean

  /**
   * In-memory only, never persisted. With the current backend this is always
   * null — no endpoint returns a token to JavaScript, the cookie carries it.
   * See the long note in api-client.ts.
   */
  accessToken: string | null

  /**
   * Sets the in-memory token and the Authorization header the request
   * interceptor attaches. Nothing calls this with the current backend; it is the
   * single entry point to use if an endpoint ever returns a token in its body.
   */
  setAccessToken: (token: string | null) => void

  login: (input: LoginInput) => Promise<LoginResult>
  completeMfaChallenge: (input: MfaChallengeInput) => Promise<SafeUser>
  logout: () => Promise<void>
  refresh: () => Promise<void>
  /** Re-reads /auth/me, e.g. after a profile update. */
  reloadUser: () => Promise<void>
}

const AuthContext = React.createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<SafeUser | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [accessToken, setAccessTokenState] = React.useState<string | null>(
    getAccessToken,
  )

  /*
   * Keeps the module-level token (read by the request interceptor) and the
   * React state (read by consumers) from drifting. Everything in this file
   * writes the token through here rather than to either one directly.
   */
  const applyAccessToken = React.useCallback((token: string | null) => {
    setAccessToken(token)
    setAccessTokenState(token)
  }, [])

  const clearSession = React.useCallback(() => {
    clearAccessToken()
    setAccessTokenState(null)
    setUser(null)
  }, [])

  /*
   * Lets the api-client's response interceptor drop this provider's state when a
   * refresh fails. Without it the interceptor would redirect to /login while the
   * context still held a stale user.
   */
  React.useEffect(() => {
    setSessionExpiredHandler(clearSession)

    return () => setSessionExpiredHandler(null)
  }, [clearSession])

  const fetchUser = React.useCallback(async (): Promise<SafeUser | null> => {
    try {
      const response = await apiClient.get<ApiSuccess<UserResponseData>>(
        "/auth/me",

        /*
         * A 401 here still goes through the interceptor's refresh-and-retry,
         * which is what silently restores a session whose access cookie has
         * expired (15 min) while the refresh cookie is still good (30 days).
         *
         * But the redirect is suppressed: for an anonymous visitor both calls
         * legitimately 401, and without this the mere act of checking whether
         * anyone is signed in would bounce them to /login from any page.
         */
        { suppressLoginRedirect: true },
      )

      return response.data.data.user
    } catch {
      // Ordinary "not signed in" — not an error worth surfacing.
      return null
    }
  }, [])

  /*
   * One /auth/me on mount to answer "is anyone signed in?". The cookie is
   * httpOnly, so asking the server is the only way to know.
   */
  React.useEffect(() => {
    let cancelled = false

    void (async () => {
      const nextUser = await fetchUser()

      if (!cancelled) {
        setUser(nextUser)
        setIsLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [fetchUser])

  const login = React.useCallback(
    async (input: LoginInput): Promise<LoginResult> => {
      const response = await apiClient.post<ApiSuccess<LoginResponseData>>(
        "/auth/login",
        input,
      )

      const data = response.data.data

      // Half a login: no session yet, so no user state is set. The caller takes
      // the challenge token to the MFA step.
      if (data.mfaRequired) {
        return {
          mfaRequired: true,
          challengeToken: data.challengeToken,
          expiresAt: data.expiresAt,
        }
      }

      setUser(data.user)

      return { mfaRequired: false, user: data.user }
    },
    [],
  )

  const completeMfaChallenge = React.useCallback(
    async (input: MfaChallengeInput): Promise<SafeUser> => {
      const response = await apiClient.post<ApiSuccess<UserResponseData>>(
        "/auth/mfa/challenge",
        input,
      )

      const nextUser = response.data.data.user
      setUser(nextUser)

      return nextUser
    },
    [],
  )

  const logout = React.useCallback(async () => {
    try {
      await apiClient.post("/auth/logout")
    } finally {
      /*
       * Cleared even if the call fails. If the server could not be reached the
       * local session is worthless anyway, and leaving a user object in place
       * after they pressed "log out" is the worse outcome.
       */
      clearSession()
    }
  }, [clearSession])

  const refresh = React.useCallback(async () => {
    await apiClient.post("/auth/refresh")

    setUser(await fetchUser())
  }, [fetchUser])

  const reloadUser = React.useCallback(async () => {
    setUser(await fetchUser())
  }, [fetchUser])

  const value = React.useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: user !== null,
      accessToken,
      setAccessToken: applyAccessToken,
      login,
      completeMfaChallenge,
      logout,
      refresh,
      reloadUser,
    }),
    [
      user,
      isLoading,
      accessToken,
      applyAccessToken,
      login,
      completeMfaChallenge,
      logout,
      refresh,
      reloadUser,
    ],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

/**
 * Reads auth state. Throws outside an AuthProvider rather than returning a
 * null-ish default, so a component mounted outside the provider fails loudly
 * instead of silently rendering as signed-out.
 */
export function useAuth(): AuthContextValue {
  const context = React.use(AuthContext)

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }

  return context
}

export type { AuthContextValue }
