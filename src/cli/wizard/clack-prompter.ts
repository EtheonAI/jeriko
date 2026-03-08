/**
 * ClackPrompter — Concrete WizardPrompter wrapping @clack/prompts.
 *
 * Wraps clack's validate callbacks to guard against `undefined`/`null`
 * values that clack can pass internally before validation runs,
 * which would otherwise crash its renderer with `.trim()` on undefined.
 */

import * as clack from "@clack/prompts";
import type { WizardPrompter } from "./prompter.js";

/**
 * Wrap a validate function to safely handle undefined/null values.
 * Clack's internal state can be undefined before user types anything,
 * and its renderer calls .trim() on the raw value — crashing if undefined.
 */
function safeValidate(
  validate?: (value: string) => string | undefined,
): ((value: string | undefined) => string | Error | undefined) | undefined {
  if (!validate) return undefined;
  return (value: string | undefined) => validate(value ?? "");
}

export class ClackPrompter implements WizardPrompter {
  intro(title: string): void {
    clack.intro(title);
  }

  outro(message: string): void {
    clack.outro(message);
  }

  note(message: string, title?: string): void {
    clack.note(message, title);
  }

  async select<T extends string>(opts: {
    message: string;
    options: Array<{ value: T; label: string; hint?: string }>;
  }): Promise<T | symbol> {
    return clack.select({
      message: opts.message,
      options: opts.options as any,
    }) as Promise<T | symbol>;
  }

  async text(opts: {
    message: string;
    placeholder?: string;
    validate?: (value: string) => string | undefined;
  }): Promise<string | symbol> {
    return clack.text({
      message: opts.message,
      placeholder: opts.placeholder,
      defaultValue: "",
      validate: safeValidate(opts.validate),
    });
  }

  async password(opts: {
    message: string;
    validate?: (value: string) => string | undefined;
  }): Promise<string | symbol> {
    return clack.password({
      message: opts.message,
      validate: safeValidate(opts.validate),
    });
  }

  async confirm(opts: {
    message: string;
    initialValue?: boolean;
  }): Promise<boolean | symbol> {
    return clack.confirm(opts);
  }

  spinner(): { start(message: string): void; stop(message?: string): void } {
    return clack.spinner();
  }
}
