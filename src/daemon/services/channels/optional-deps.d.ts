// Type declarations for optional dependencies.
// These packages are not installed by default — they are optional peer deps
// that users install only if they want to use the corresponding channel.

declare module "discord.js" {
  export class Client {
    constructor(opts: any);
    on(event: string, handler: (...args: any[]) => void): void;
    login(token: string): Promise<void>;
    destroy(): Promise<void>;
    channels: { fetch(id: string): Promise<any> };
    user?: { id: string; username: string };
  }

  export enum GatewayIntentBits {
    Guilds = 1,
    GuildMessages = 2,
    MessageContent = 32768,
    DirectMessages = 4096,
  }

  export class ActionRowBuilder<T = any> {
    addComponents(...components: T[]): this;
  }

  export class ButtonBuilder {
    setLabel(label: string): this;
    setStyle(style: number): this;
    setCustomId(id: string): this;
    setURL(url: string): this;
  }

  export enum ButtonStyle {
    Primary = 1,
    Secondary = 2,
    Success = 3,
    Danger = 4,
    Link = 5,
  }

  export class AttachmentBuilder {
    constructor(file: Buffer | string, opts?: { name?: string; description?: string });
  }

  export interface Message {
    id: string;
    author: { id: string; bot: boolean; displayName?: string; username: string };
    content: string;
    channelId: string;
    guildId: string | null;
    channel: {
      isDMBased(): boolean;
      send(content: string | object): Promise<Message>;
      sendTyping(): Promise<void>;
    };
    reference?: { messageId?: string };
    attachments: Map<string, {
      id: string;
      url: string;
      proxyURL: string;
      name: string | null;
      contentType: string | null;
      size: number;
    }>;
    edit(content: string | object): Promise<Message>;
    delete(): Promise<void>;
    reply(content: string | object): Promise<Message>;
  }
}

declare module "qrcode-terminal" {
  export function generate(
    data: string,
    opts?: { small?: boolean },
    callback?: (text: string) => void,
  ): void;
  export function setErrorLevel(level: string): void;
}

declare module "@slack/bolt" {
  export class App {
    constructor(opts: any);
    message(handler: (args: any) => Promise<void> | void): void;
    action(actionId: string | RegExp, handler: (args: any) => Promise<void> | void): void;
    start(port?: number): Promise<void>;
    stop(): Promise<void>;
    client: {
      chat: {
        postMessage(opts: any): Promise<{ ok: boolean; ts?: string; channel?: string }>;
        update(opts: any): Promise<{ ok: boolean }>;
        delete(opts: any): Promise<{ ok: boolean }>;
      };
      files: {
        uploadV2(opts: any): Promise<{ ok: boolean; files?: any[] }>;
        completeUploadExternal?(opts: any): Promise<any>;
      };
      conversations: {
        info(opts: any): Promise<{ ok: boolean; channel?: { is_im?: boolean } }>;
      };
      users: {
        info(opts: any): Promise<{ ok: boolean; user?: { real_name?: string; name?: string } }>;
      };
    };
  }

  export interface MessageEvent {
    channel: string;
    channel_type?: string;
    subtype?: string;
    text?: string;
    user?: string;
    thread_ts?: string;
    files?: Array<{
      id: string;
      name?: string;
      mimetype?: string;
      url_private?: string;
      url_private_download?: string;
      filetype?: string;
      size?: number;
    }>;
  }
}
