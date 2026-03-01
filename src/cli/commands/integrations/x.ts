import { connectorCommand } from "./_connector.js";

export const command = connectorCommand("x", "X/Twitter (tweets, users, DMs, timelines)", [
  "\nCall X (Twitter) API v2 methods through the connector.",
  "\nShorthand (aliases):",
  "  post      → tweets.create    (requires OAuth 1.0a credentials)",
  "  search    → tweets.search",
  "  timeline  → users.timeline",
  "  like      → likes.create",
  "  retweet   → retweets.create",
  "  bookmark  → bookmarks.list",
  "  follow    → users.follow",
  "  dm        → dm.send",
  "\nDot-notation methods:",
  "  tweets    get | search | create | delete",
  "  users     get | by_username | followers | following | timeline",
  "  likes     create | delete",
  "  retweets  create",
  "  bookmarks list",
  "  lists     list | get",
  "  dm        send | list",
  "  mute      create | delete",
  "\nFlags:",
  "  --id <id>              Tweet or user ID",
  "  --user-id <id>         User ID (for likes, follows, etc.)",
  "  --tweet-id <id>        Tweet ID",
  "  --target-user-id <id>  Target user for follow/mute",
  "  --username <name>      Username (without @)",
  "  --text <text>          Tweet text",
  "  --query <text>         Search query",
  "  --limit <n>            Max results",
], {
  // X-specific: remaining positionals join into text or query
  prepareParams(method, params, rest) {
    if (rest.length > 0 && !params.text && !params.query) {
      const joined = rest.join(" ");
      if (method === "search" || method === "tweets.search") {
        params.query = joined;
      } else {
        params.text = joined;
      }
    } else if (rest[0] && !params.id) {
      params.id = rest[0];
    }
  },
});
