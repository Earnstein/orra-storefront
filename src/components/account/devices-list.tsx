"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { FormError } from "@/components/auth/form-error";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { deviceLabel } from "@/lib/account/device-label";
import { goToSignIn } from "@/lib/account/signed-out";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage, type AuthError } from "@/lib/auth/errors";

type DeviceSession = { token: string; userAgent?: string | null; updatedAt: Date | string };

/** Thrown by the queries below so a 401 (the session ended) can send the visitor to sign in. */
class AuthCallError extends Error {
  constructor(readonly error: AuthError) {
    super(error.code ?? `status ${error.status}`);
  }
}

async function call<T>(request: Promise<{ data: T | null; error: (AuthError & object) | null }>): Promise<T> {
  const { data, error } = await request;
  if (error) throw new AuthCallError(error);
  return data as T;
}

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "Active today", "Active yesterday", "Active 3 days ago"… from the session's last refresh. */
function lastActive(updatedAt: Date | string): string {
  const days = Math.round((new Date(updatedAt).getTime() - Date.now()) / 86_400_000);
  if (days === 0) return "Active today";
  const text = relative.format(days, "day");
  return `Active ${text}`;
}

/**
 * The account's signed-in devices: each with its browser and system and when it was last active;
 * this device first and marked, the others with a Sign out button, then "Sign out of all other
 * devices". A device signed out here is refused by the account page and actions at once; its
 * header may still greet it for up to 5 minutes (the cookie cache).
 */
export function DevicesList() {
  const queryClient = useQueryClient();
  const { data: current } = authClient.useSession();
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: () => call<DeviceSession[]>(authClient.listSessions()),
  });

  // The list failing because the session ended sends the visitor to sign in (an effect, not render).
  useEffect(() => {
    if (sessions.error instanceof AuthCallError && sessions.error.error.status === 401) goToSignIn();
  }, [sessions.error]);

  const onError = (failure: unknown) => {
    if (failure instanceof AuthCallError && failure.error.status === 401) return goToSignIn();
    setError(authErrorMessage(failure instanceof AuthCallError ? failure.error : null));
  };
  const onSettled = () => queryClient.invalidateQueries({ queryKey: ["sessions"] });

  const revokeOne = useMutation({
    mutationFn: (token: string) => call(authClient.revokeSession({ token })),
    onMutate: () => setError(null),
    onSuccess: () => setStatus("Device signed out."),
    onError,
    onSettled,
  });
  const revokeOthers = useMutation({
    mutationFn: () => call(authClient.revokeOtherSessions()),
    onMutate: () => setError(null),
    onSuccess: () => setStatus("All other devices signed out."),
    onError,
    onSettled,
  });

  if (sessions.isPending) {
    return (
      <div aria-hidden className="flex flex-col gap-4">
        <Skeleton className="h-12 bg-surface" />
        <Skeleton className="h-12 bg-surface" />
      </div>
    );
  }
  if (sessions.isError) return <FormError message="We couldn't load your devices. Try again later." />;

  const currentToken = current?.session.token;
  const list = [...sessions.data].sort((a, b) => Number(b.token === currentToken) - Number(a.token === currentToken));
  const others = list.filter((session) => session.token !== currentToken);

  return (
    <div className="flex flex-col">
      <ul className="flex flex-col divide-y border-y">
        {list.map((session) => {
          const isCurrent = session.token === currentToken;
          const label = deviceLabel(session.userAgent);
          return (
            <li key={session.token} className="flex items-center justify-between gap-4 py-4">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-body">{label}</span>
                <span className="text-caption text-muted-foreground">
                  {isCurrent ? "This device" : lastActive(session.updatedAt)}
                </span>
              </div>
              {!isCurrent && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={revokeOne.isPending && revokeOne.variables === session.token}
                  onClick={() => revokeOne.mutate(session.token)}
                  aria-label={`Sign out ${label}, ${lastActive(session.updatedAt).toLowerCase()}`}
                >
                  Sign out
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {others.length > 0 && (
        <Button
          type="button"
          variant="link"
          className="mt-6 self-start"
          disabled={revokeOthers.isPending}
          onClick={() => revokeOthers.mutate()}
        >
          Sign out of all other devices
        </Button>
      )}
      <FormError message={error} className="not-empty:mt-4 not-empty:mb-0" />
      <p role="status" className="text-caption not-empty:mt-4">
        {status}
      </p>
    </div>
  );
}
