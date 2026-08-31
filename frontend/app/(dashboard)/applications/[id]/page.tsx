"use client"

import * as React from "react"
import Link from "next/link"
import { KeyRoundIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { apiClient } from "@/lib/api-client"
import type { ApiKeyListResponseData, ApiSuccess } from "@/lib/api-types"
import { formatAbsoluteDate, formatRelativeTime } from "@/lib/format"
import { routes } from "@/lib/navigation"
import { CodeBlock } from "@/components/dashboard/code-block"
import { useApplication } from "./application-context"

/** Where the browser should send requests — the same base the client uses. */
const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1"

type KeyState =
  | { status: "loading" }
  | { status: "known"; hasLiveKey: boolean; prefix: string | null }
  /** Couldn't tell — no apikey:list permission, or the request failed. */
  | { status: "unknown" }

export default function ApplicationOverviewPage() {
  const { application } = useApplication()

  const [keyState, setKeyState] = React.useState<KeyState>({
    status: "loading",
  })

  /*
   * Only to decide which quick-start to show. A failure here is not worth
   * surfacing as an error — the page still has everything else — so it
   * degrades to the neutral "unknown" branch.
   */
  const fetchKeys = React.useCallback(async (): Promise<KeyState> => {
    try {
      const response = await apiClient.get<ApiSuccess<ApiKeyListResponseData>>(
        `/applications/${application.id}/keys`,
      )

      const live = response.data.data.apiKeys.filter((key) => !key.revokedAt)

      return {
        status: "known",
        hasLiveKey: live.length > 0,
        prefix: live[0]?.prefix ?? null,
      }
    } catch {
      return { status: "unknown" }
    }
  }, [application.id])

  React.useEffect(() => {
    let cancelled = false

    void (async () => {
      const next = await fetchKeys()

      if (!cancelled) {
        setKeyState(next)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [fetchKeys])

  return (
    <div className="flex flex-col gap-4">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>

        <CardContent className="flex flex-col gap-3">
          <DetailRow label="Name" value={application.name} />
          <Separator />
          <DetailRow label="Slug" value={application.slug} mono />
          <Separator />
          <DetailRow
            label="Created"
            value={`${formatAbsoluteDate(application.createdAt)} (${formatRelativeTime(application.createdAt)})`}
          />
          <Separator />
          <DetailRow label="Application ID" value={application.id} mono />
        </CardContent>
      </Card>

      <QuickStart
        applicationId={application.id}
        keyState={keyState}
      />
    </div>
  )
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-sm" : "text-sm"}>{value}</span>
    </div>
  )
}

/**
 * The next step after creating an application is wiring it up, and the answer
 * is one header on one request. Putting the exact call here saves a trip to the
 * docs at precisely the moment someone needs it.
 */
function QuickStart({
  applicationId,
  keyState,
}: {
  applicationId: string
  keyState: KeyState
}) {
  if (keyState.status === "loading") {
    return (
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Quick start</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-28 w-full" />
        </CardContent>
      </Card>
    )
  }

  /*
   * No key yet: show the way to get one rather than a snippet built around a
   * placeholder. A fake key in a copyable block is an invitation to paste
   * something that cannot work.
   */
  if (keyState.status === "known" && !keyState.hasLiveKey) {
    return (
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Quick start</CardTitle>
          <CardDescription>
            This application doesn&apos;t have an API key yet. Requests are
            authenticated with a secret key sent in the{" "}
            <code className="font-mono text-xs">X-AuthCore-Key</code> header, so
            generate one to get started.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <Button render={<Link href={routes.apiKeys(applicationId)} />}>
            <KeyRoundIcon />
            Generate a key
          </Button>
        </CardContent>
      </Card>
    )
  }

  const keyPlaceholder =
    keyState.status === "known" && keyState.prefix
      ? `${keyState.prefix}...`
      : "YOUR_SECRET_KEY"

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Quick start</CardTitle>
        <CardDescription>
          Sign a user up against this application by sending its secret key in
          the <code className="font-mono text-xs">X-AuthCore-Key</code> header.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <CodeBlock
          label="curl"
          code={`curl -X POST ${API_BASE}/auth/signup \\
  -H "Content-Type: application/json" \\
  -H "X-AuthCore-Key: ${keyPlaceholder}" \\
  -d '{
    "email": "user@example.com",
    "password": "S3cure-password!"
  }'`}
        />

        <CodeBlock
          label="fetch"
          code={`await fetch("${API_BASE}/auth/signup", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-AuthCore-Key": "${keyPlaceholder}",
  },
  body: JSON.stringify({
    email: "user@example.com",
    password: "S3cure-password!",
  }),
})`}
        />

        {keyState.status === "unknown" ? (
          <p className="text-xs text-muted-foreground">
            Replace{" "}
            <code className="font-mono">{keyPlaceholder}</code> with a secret key
            from the{" "}
            <Link
              href={routes.apiKeys(applicationId)}
              className="underline underline-offset-4"
            >
              API Keys
            </Link>{" "}
            tab.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            The full secret is shown only once, when the key is created. Only its
            prefix appears here.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
