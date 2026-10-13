import { z } from "zod";

/**
 * A US phone number as people type it ("(201) 555-0123", "201.555.0123", "+1 201 555 0123") in
 * E.164 form ("+12015550123"), or null. Ten digits, or eleven starting with the country code 1;
 * area and exchange codes never start with 0 or 1.
 */
export function usPhone(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(national)) return null;
  return `+1${national}`;
}

export const phoneSchema = z
  .string()
  .trim()
  .refine((value) => value.length > 0, "Enter a phone number for delivery.")
  .refine((value) => value.length === 0 || usPhone(value) !== null, "Enter a US phone number, e.g. (201) 555-0123.");
