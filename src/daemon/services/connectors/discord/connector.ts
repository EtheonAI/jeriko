/**
 * Discord connector — guilds, channels, messages, and users.
 *
 * Extends BearerConnector for OAuth2 Bearer token auth with refresh.
 * Discord Bot tokens are permanent, but OAuth user tokens have refresh.
 */

import { BearerConnector } from "../base.js";

export class DiscordConnector extends BearerConnector {
  readonly name = "discord";
  readonly version = "1.0.0";

  protected readonly auth = {
    baseUrl: "https://discord.com/api/v10",
    tokenVar: "DISCORD_BOT_TOKEN",
    refreshTokenVar: "DISCORD_REFRESH_TOKEN",
    clientIdVar: "DISCORD_OAUTH_CLIENT_ID",
    clientSecretVar: "DISCORD_OAUTH_CLIENT_SECRET",
    tokenUrl: "https://discord.com/api/oauth2/token",
    healthPath: "/users/@me",
    label: "Discord",
  };

  // ---------------------------------------------------------------------------
  // Auth — Discord bot tokens use "Bot" prefix, OAuth tokens use "Bearer"
  // ---------------------------------------------------------------------------

  protected override async buildAuthHeader(): Promise<string> {
    const token = await this.getToken();
    // Bot tokens start with specific patterns; OAuth tokens don't
    const isBot = /^[A-Za-z0-9]{24,}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}$/.test(token);
    return isBot ? `Bot ${token}` : `Bearer ${token}`;
  }

  // ---------------------------------------------------------------------------
  // Aliases
  // ---------------------------------------------------------------------------

  protected override aliases(): Record<string, string> {
    return {
      guilds: "guilds.list",
      channels: "channels.list",
      messages: "messages.list",
    };
  }

  // ---------------------------------------------------------------------------
  // API method dispatch — Discord REST API v10
  // ---------------------------------------------------------------------------

  protected handlers() {
    return {
      // Guilds
      "guilds.list": () => this.get("/users/@me/guilds"),
      "guilds.get": (p: Record<string, unknown>) =>
        this.get(`/guilds/${p.id}`),
      "guilds.channels": (p: Record<string, unknown>) =>
        this.get(`/guilds/${p.id}/channels`),
      "guilds.members": (p: Record<string, unknown>) =>
        this.get(`/guilds/${p.id}/members?limit=${p.limit ?? 100}`),

      // Channels
      "channels.get": (p: Record<string, unknown>) =>
        this.get(`/channels/${p.id}`),
      "channels.create": (p: Record<string, unknown>) =>
        this.post(`/guilds/${p.guild_id}/channels`, {
          name: p.name, type: p.type ?? 0, topic: p.topic,
        }),
      "channels.update": (p: Record<string, unknown>) =>
        this.patch(`/channels/${p.id}`, { name: p.name, topic: p.topic }),
      "channels.delete": (p: Record<string, unknown>) =>
        this.del(`/channels/${p.id}`),

      // Messages
      "messages.list": (p: Record<string, unknown>) =>
        this.get(`/channels/${p.channel}/messages?limit=${p.limit ?? 50}`),
      "messages.get": (p: Record<string, unknown>) =>
        this.get(`/channels/${p.channel}/messages/${p.id}`),
      "messages.send": (p: Record<string, unknown>) =>
        this.post(`/channels/${p.channel}/messages`, {
          content: p.content ?? p.text, embeds: p.embeds, tts: p.tts,
        }),
      "messages.update": (p: Record<string, unknown>) =>
        this.patch(`/channels/${p.channel}/messages/${p.id}`, {
          content: p.content ?? p.text, embeds: p.embeds,
        }),
      "messages.delete": (p: Record<string, unknown>) =>
        this.del(`/channels/${p.channel}/messages/${p.id}`),

      // Reactions
      "reactions.add": (p: Record<string, unknown>) =>
        this.put(`/channels/${p.channel}/messages/${p.id}/reactions/${encodeURIComponent(String(p.emoji))}/@me`, {}),
      "reactions.remove": (p: Record<string, unknown>) =>
        this.del(`/channels/${p.channel}/messages/${p.id}/reactions/${encodeURIComponent(String(p.emoji))}/@me`),

      // Users
      "users.me": () => this.get("/users/@me"),
      "users.get": (p: Record<string, unknown>) =>
        this.get(`/users/${p.id}`),

      // Roles
      "roles.list": (p: Record<string, unknown>) =>
        this.get(`/guilds/${p.guild_id}/roles`),
    };
  }
}
