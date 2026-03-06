/**
 * WizardPrompter — Abstract interface for wizard prompts.
 *
 * Allows mock injection for testing. The concrete implementation
 * wraps @clack/prompts.
 */

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
}

export interface WizardPrompter {
  intro(title: string): void;
  outro(message: string): void;
  note(message: string, title?: string): void;

  select<T extends string>(opts: {
    message: string;
    options: Array<{ value: T; label: string; hint?: string }>;
  }): Promise<T | symbol>;

  text(opts: {
    message: string;
    placeholder?: string;
    validate?: (value: string) => string | undefined;
  }): Promise<string | symbol>;

  password(opts: {
    message: string;
    validate?: (value: string) => string | undefined;
  }): Promise<string | symbol>;

  confirm(opts: {
    message: string;
    initialValue?: boolean;
  }): Promise<boolean | symbol>;

  spinner(): {
    start(message: string): void;
    stop(message?: string): void;
  };
}
