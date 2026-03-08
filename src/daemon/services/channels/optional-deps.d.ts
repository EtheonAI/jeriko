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

declare module "qrcode" {
  export function toBuffer(
    data: string,
    opts?: { type?: string; width?: number; margin?: number },
  ): Promise<Buffer>;
  export function toString(
    data: string,
    opts?: { type?: string; width?: number; margin?: number },
  ): Promise<string>;
}
