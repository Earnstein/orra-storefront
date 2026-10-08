"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { FormError } from "@/components/auth/form-error";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { signOutDevice, signOutOtherDevices, type ActionResult } from "@/lib/account/actions";
import type { Device } from "@/lib/account/devices";
import { goToSignIn } from "@/lib/account/signed-out";

const SIGNED_OUT = "signed-out";

async function fetchDevices(): Promise<Device[]> {
  const response = await fetch("/api/account/devices", { cache: "no-store" });
  if (response.status === 401) throw new Error(SIGNED_OUT);
  if (!response.ok) throw new Error(`devices: ${response.status}`);
  return ((await response.json()) as { devices: Device[] }).devices;
}

/** Turns an action's typed failure into a thrown error, so mutations handle both the same way. */
async function unwrap(result: Promise<ActionResult>) {
  const outcome = await result;
  if (!outcome.ok) throw new Error(outcome.error === "signed-out" ? SIGNED_OUT : outcome.message);
}

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "Active today", "Active yesterday", "Active 3 days ago"… from the session's last refresh. */
function lastActive(updatedAt: string): string {
  const days = Math.round((new Date(updatedAt).getTime() - Date.now()) / 86_400_000);
  return days === 0 ? "Active today" : `Active ${relative.format(days, "day")}`;
}

/**
 * The account's signed-in devices: each with its browser and system and when it was last active;
 * this device first and marked, the others with a Sign out button, then "Sign out of all other
 * devices". The list comes from /api/account/devices and changes go through server actions, both
 * checked on the server, so no session token reaches the browser. A device signed out here is
 * refused by the account page and actions at once; its header may still greet it for up to
 * 5 minutes (the cookie cache).
 */
export function DevicesList() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  const devices = useQuery({
    queryKey: ["devices"],
    queryFn: fetchDevices,
    // A signed-out answer won't change on retry; go to sign in at once.
    retry: (failures, failure) => failure.message !== SIGNED_OUT && failures < 2,
  });

  useEffect(() => {
    if (devices.error?.message === SIGNED_OUT) goToSignIn();
  }, [devices.error]);

  const mutationOptions = {
    onMutate: () => {
      setError(null);
      setStatus("");
    },
    onError: (failure: Error) => {
      if (failure.message === SIGNED_OUT) return goToSignIn();
      setError(failure.message || "Something went wrong. Try again.");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["devices"] }),
  };
  const revokeOne = useMutation({
    mutationFn: (id: string) => unwrap(signOutDevice(id)),
    onSuccess: () => setStatus("Device signed out."),
    ...mutationOptions,
  });
  const revokeOthers = useMutation({
    mutationFn: () => unwrap(signOutOtherDevices()),
    onSuccess: () => setStatus("All other devices signed out."),
    ...mutationOptions,
  });

  if (devices.isPending) {
    return (
      <div aria-hidden className="flex flex-col gap-4">
        <Skeleton className="h-12 bg-surface" />
        <Skeleton className="h-12 bg-surface" />
      </div>
    );
  }
  if (devices.isError) return <FormError message="We couldn't load your devices. Try again later." />;

  const others = devices.data.filter((device) => !device.current);

  return (
    <div className="flex flex-col">
      <ul className="flex flex-col divide-y border-y">
        {devices.data.map((device) => (
          <li key={device.id} className="flex items-center justify-between gap-4 py-4">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-body">{device.label}</span>
              <span className="text-caption text-muted-foreground">
                {device.current ? "This device" : lastActive(device.updatedAt)}
              </span>
            </div>
            {!device.current && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={revokeOne.isPending && revokeOne.variables === device.id}
                onClick={() => revokeOne.mutate(device.id)}
                aria-label={`Sign out ${device.label}, ${lastActive(device.updatedAt).toLowerCase()}`}
              >
                Sign out
              </Button>
            )}
          </li>
        ))}
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
