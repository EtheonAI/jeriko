// Type declarations for optional dependencies.
// These packages are not installed by default — they are optional peer deps
// that users install only if they want to use the corresponding channel.

declare module "qrcode-terminal" {
  export function generate(
    data: string,
    opts?: { small?: boolean },
    callback?: (text: string) => void,
  ): void;
  export function setErrorLevel(level: string): void;
}
