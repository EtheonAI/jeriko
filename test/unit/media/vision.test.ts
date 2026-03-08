// Unit tests — Vision content blocks and driver conversion.
//
// Tests the ContentBlock types, messageText() helper, and how each driver
// converts multi-modal messages to its native API format.

import { describe, it, expect } from "bun:test";
import {
  messageText,
  type DriverMessage,
  type ContentBlock,
  type TextBlock,
  type ImageBlock,
} from "../../../src/daemon/agent/drivers/index.js";
import {
  convertToAnthropicMessages,
} from "../../../src/daemon/agent/drivers/anthropic-shared.js";

// ---------------------------------------------------------------------------
// messageText() helper
// ---------------------------------------------------------------------------

describe("messageText()", () => {
  it("returns plain string content directly", () => {
    const msg: DriverMessage = { role: "user", content: "hello" };
    expect(messageText(msg)).toBe("hello");
  });

  it("extracts text from ContentBlock array", () => {
    const msg: DriverMessage = {
      role: "user",
      content: [
        { type: "text", text: "What is in this image?" },
      ],
    };
    expect(messageText(msg)).toBe("What is in this image?");
  });

  it("ignores image blocks when extracting text", () => {
    const msg: DriverMessage = {
      role: "user",
      content: [
        { type: "image", data: "base64data", mediaType: "image/png" },
        { type: "text", text: "Describe this" },
      ],
    };
    expect(messageText(msg)).toBe("Describe this");
  });

  it("joins multiple text blocks with newlines", () => {
    const msg: DriverMessage = {
      role: "user",
      content: [
        { type: "text", text: "First part" },
        { type: "image", data: "base64", mediaType: "image/jpeg" },
        { type: "text", text: "Second part" },
      ],
    };
    expect(messageText(msg)).toBe("First part\nSecond part");
  });

  it("returns empty string for empty ContentBlock array", () => {
    const msg: DriverMessage = { role: "user", content: [] };
    expect(messageText(msg)).toBe("");
  });

  it("returns empty string for array with only image blocks", () => {
    const msg: DriverMessage = {
      role: "user",
      content: [
        { type: "image", data: "base64", mediaType: "image/png" },
      ],
    };
    expect(messageText(msg)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// ContentBlock types
// ---------------------------------------------------------------------------

describe("ContentBlock types", () => {
  it("TextBlock has correct shape", () => {
    const block: TextBlock = { type: "text", text: "hello" };
    expect(block.type).toBe("text");
    expect(block.text).toBe("hello");
  });

  it("ImageBlock has correct shape", () => {
    const block: ImageBlock = {
      type: "image",
      data: "iVBORw0KGgo...",
      mediaType: "image/png",
    };
    expect(block.type).toBe("image");
    expect(block.data).toBe("iVBORw0KGgo...");
    expect(block.mediaType).toBe("image/png");
  });

  it("ContentBlock union accepts both types", () => {
    const blocks: ContentBlock[] = [
      { type: "text", text: "What is this?" },
      { type: "image", data: "base64data", mediaType: "image/jpeg" },
    ];
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.type).toBe("text");
    expect(blocks[1]!.type).toBe("image");
  });
});

// ---------------------------------------------------------------------------
// Anthropic driver conversion
// ---------------------------------------------------------------------------

describe("Anthropic convertToAnthropicMessages() — vision", () => {
  it("converts plain string user messages unchanged", () => {
    const messages: DriverMessage[] = [
      { role: "user", content: "Hello" },
    ];
    const { messages: converted } = convertToAnthropicMessages(messages);
    expect(converted).toHaveLength(1);
    expect(converted[0]!.content).toBe("Hello");
  });

  it("converts ContentBlock[] user messages to Anthropic image blocks", () => {
    const messages: DriverMessage[] = [
      {
        role: "user",
        content: [
          { type: "image", data: "base64ImageData", mediaType: "image/jpeg" },
          { type: "text", text: "What is in this photo?" },
        ],
      },
    ];

    const { messages: converted } = convertToAnthropicMessages(messages);
    expect(converted).toHaveLength(1);

    const content = converted[0]!.content;
    expect(Array.isArray(content)).toBe(true);

    const blocks = content as Array<Record<string, unknown>>;
    expect(blocks).toHaveLength(2);

    // First block: image
    expect(blocks[0]!.type).toBe("image");
    const source = blocks[0]!.source as Record<string, unknown>;
    expect(source.type).toBe("base64");
    expect(source.media_type).toBe("image/jpeg");
    expect(source.data).toBe("base64ImageData");

    // Second block: text
    expect(blocks[1]!.type).toBe("text");
    expect(blocks[1]!.text).toBe("What is in this photo?");
  });

  it("handles system messages with string content", () => {
    const messages: DriverMessage[] = [
      { role: "system", content: "You are a helpful assistant" },
      { role: "user", content: "Hello" },
    ];
    const { system, messages: converted } = convertToAnthropicMessages(messages);
    expect(system).toBe("You are a helpful assistant");
    expect(converted).toHaveLength(1);
  });

  it("handles tool result messages with string content", () => {
    const messages: DriverMessage[] = [
      { role: "tool", content: '{"result": "ok"}', tool_call_id: "tc-1" },
    ];
    const { messages: converted } = convertToAnthropicMessages(messages);
    expect(converted).toHaveLength(1);
    const content = converted[0]!.content as Array<Record<string, unknown>>;
    expect(content[0]!.type).toBe("tool_result");
    expect(content[0]!.content).toBe('{"result": "ok"}');
  });

  it("handles assistant messages with tool calls and string content", () => {
    const messages: DriverMessage[] = [
      {
        role: "assistant",
        content: "Let me help",
        tool_calls: [{
          id: "tc-1",
          name: "bash",
          arguments: '{"command": "ls"}',
        }],
      },
    ];
    const { messages: converted } = convertToAnthropicMessages(messages);
    expect(converted).toHaveLength(1);
    const content = converted[0]!.content as Array<Record<string, unknown>>;
    expect(content).toHaveLength(2);
    expect(content[0]!.type).toBe("text");
    expect(content[0]!.text).toBe("Let me help");
    expect(content[1]!.type).toBe("tool_use");
  });

  it("handles mixed conversation with vision and non-vision messages", () => {
    const messages: DriverMessage[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi! How can I help?" },
      {
        role: "user",
        content: [
          { type: "image", data: "base64data", mediaType: "image/png" },
          { type: "text", text: "What is this?" },
        ],
      },
    ];

    const { messages: converted } = convertToAnthropicMessages(messages);
    expect(converted).toHaveLength(3);

    // First message: plain string
    expect(converted[0]!.content).toBe("Hello");

    // Second message: plain string
    expect(converted[1]!.content).toBe("Hi! How can I help?");

    // Third message: content blocks
    const blocks = converted[2]!.content as Array<Record<string, unknown>>;
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.type).toBe("image");
    expect(blocks[1]!.type).toBe("text");
  });
});

// ---------------------------------------------------------------------------
// DriverMessage backward compatibility
// ---------------------------------------------------------------------------

describe("DriverMessage backward compatibility", () => {
  it("string content works everywhere", () => {
    const msg: DriverMessage = {
      role: "user",
      content: "plain text",
    };
    expect(typeof msg.content).toBe("string");
    expect(messageText(msg)).toBe("plain text");
  });

  it("ContentBlock[] content is optional — not required", () => {
    // This verifies the union type doesn't break existing code
    const messages: DriverMessage[] = [
      { role: "system", content: "system prompt" },
      { role: "user", content: "user message" },
      { role: "assistant", content: "response" },
      { role: "tool", content: "result", tool_call_id: "tc-1" },
    ];
    for (const msg of messages) {
      expect(typeof msg.content).toBe("string");
    }
  });
});
