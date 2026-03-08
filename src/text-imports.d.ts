// Type declarations for Bun's `import ... with { type: "text" }` on non-.ts files.
// Bun inlines these at compile time; TypeScript needs the module shape declared.

declare module "*.md" {
  const content: string;
  export default content;
}

declare module "*.sql" {
  const content: string;
  export default content;
}
