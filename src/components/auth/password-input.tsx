"use client";

import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useState } from "react";

import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";

type PasswordInputProps = Omit<React.ComponentProps<"input">, "type">;

/**
 * A password field with a show/hide toggle. The toggle keeps one label ("Show password") and
 * reports its state with aria-pressed, so screen readers hear "Show password, toggle, pressed".
 */
export function PasswordInput(props: PasswordInputProps) {
  const [shown, setShown] = useState(false);
  return (
    <InputGroup>
      <InputGroupInput {...props} type={shown ? "text" : "password"} />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-sm"
          aria-label="Show password"
          aria-pressed={shown}
          aria-controls={props.id}
          onClick={() => setShown((value) => !value)}
        >
          {shown ? <EyeOffIcon /> : <EyeIcon />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
