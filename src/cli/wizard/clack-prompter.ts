/**
 * ClackPrompter — Concrete WizardPrompter wrapping @clack/prompts.
 */

import * as clack from "@clack/prompts";
import type { WizardPrompter } from "./prompter.js";

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
      validate: opts.validate as any,
    });
  }

  async password(opts: {
    message: string;
    validate?: (value: string) => string | undefined;
  }): Promise<string | symbol> {
    return clack.password({
      message: opts.message,
      validate: opts.validate as any,
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
