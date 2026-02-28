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
  }
  export enum GatewayIntentBits {
    Guilds = 1,
    GuildMessages = 2,
    MessageContent = 32768,
    DirectMessages = 4096,
  }
  export interface Message {
    author: { id: string; bot: boolean; displayName?: string; username: string };
    content: string;
    channelId: string;
    guildId: string | null;
    channel: { isDMBased(): boolean };
    reference?: { messageId?: string };
  }
}

declare module "@slack/bolt" {
  export class App {
    constructor(opts: any);
    message(handler: (args: any) => Promise<void> | void): void;
    start(port?: number): Promise<void>;
    stop(): Promise<void>;
    client: { chat: { postMessage(opts: any): Promise<any> } };
  }
  export interface MessageEvent {
    channel: string;
    channel_type?: string;
    subtype?: string;
    text?: string;
    user?: string;
    thread_ts?: string;
  }
}

