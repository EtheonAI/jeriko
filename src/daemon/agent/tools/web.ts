// Tool — Web search.

import { registerTool } from "./registry.js";
import type { ToolDefinition } from "./registry.js";

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

async function execute(args: Record<string, unknown>): Promise<string> {
  const query = args.query as string;
  const maxResults = (args.max_results as number) ?? 5;

  if (!query) return JSON.stringify({ ok: false, error: "query is required" });

  // Use DuckDuckGo HTML search as a free, no-API-key fallback.
  // Production deployments can override with SERP API, Brave Search, etc.
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  try {
    const resp = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Jeriko/1.0 (CLI Agent Toolkit)",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) {
      return JSON.stringify({ ok: false, error: `Search request failed: HTTP ${resp.status}` });
    }

    const html = await resp.text();
    const results = parseSearchResults(html, maxResults);

    if (results.length === 0) {
      return `No results found for "${query}"`;
    }

    return results
      .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
      .join("\n\n");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ ok: false, error: `Search failed: ${msg}` });
  }
}

/** Parse DuckDuckGo HTML results into structured data. */
function parseSearchResults(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = [];

  // Extract result blocks: DuckDuckGo uses class="result__a" for links.
  const linkRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi;
  const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/gi;

  const links: Array<{ url: string; title: string }> = [];
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(html)) !== null) {
    if (links.length >= maxResults) break;
    const url = decodeURIComponent(match[1] ?? "").replace(/.*uddg=/, "").replace(/&.*/, "");
    const title = stripHtml(match[2] ?? "");
    if (url && title) {
      links.push({ url, title });
    }
  }

  const snippets: string[] = [];
  while ((match = snippetRegex.exec(html)) !== null) {
    snippets.push(stripHtml(match[1] ?? ""));
  }

  for (let i = 0; i < links.length; i++) {
    results.push({
      title: links[i]!.title,
      url: links[i]!.url,
      snippet: snippets[i] ?? "",
    });
  }

  return results;
}

/** Strip HTML tags from a string. */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').trim();
}

export const webTool: ToolDefinition = {
  id: "web_search",
  name: "web_search",
  description: "Search the web and return results with titles, URLs, and snippets.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "The search query" },
      max_results: { type: "number", description: "Max results to return (default: 5)" },
    },
    required: ["query"],
  },
  execute,
  aliases: ["web", "internet_search", "ddg_search"],
};

registerTool(webTool);
