/**
 * Markdown Subsystem — type contracts.
 *
 * Small closed vocabulary for the parsed block stream the renderer consumes.
 * The parser produces MarkdownBlock[]; the renderer converts them to ANSI.
 */

export type TableAlignment = "left" | "center" | "right";

/**
 * A parsed block from the markdown source. The parser groups input lines
 * into one of these variants; the renderer dispatches on the `type` field.
 */
export type MarkdownBlock =
  | { readonly type: "code"; readonly language: string; readonly content: string }
  | {
      readonly type: "table";
      readonly rows: readonly (readonly string[])[];
      readonly alignments: readonly TableAlignment[];
    }
  | { readonly type: "text"; readonly lines: readonly string[] };
