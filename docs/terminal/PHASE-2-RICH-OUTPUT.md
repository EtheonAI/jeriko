# Phase 2: Rich Output

**Duration:** Week 3-4
**Depends on:** Phase 1 complete
**Goal:** Polished output rendering, drag-drop, conversation memory, global hotkey. The app feels like a finished product.

---

## Objectives

1. Output component library — 15+ specialized renderers
2. Tool result classification — detect result type, route to correct component
3. Animations — fade-in, streaming, pulse, transitions
4. Drag and drop — files, images, text
5. Conversation persistence — auto-save, restore on launch
6. Global command history — persistent across sessions
7. Global hotkey — summon Jeriko from anywhere
8. System tray icon — always running in background
9. Welcome message with suggestions — disappears after first command
10. Error recovery components — friendly errors with suggestions
11. Inline action buttons — [Open], [Copy], [Retry] in output blocks
12. Output virtualization — handle long sessions without lag

---

## Output Component Library

### 1. CommandBlock

Echoes user's input:

```
> search my documents for tax forms
```

Simple. User's text prefixed with dimmed chevron. Clicking copies the command.

### 2. ThinkingIndicator

Appears immediately when processing starts:

```
● Thinking...  (3s)
```

- Pulsing dot animation
- Elapsed timer updates every second
- Replaced by first real output (reasoning, tool call, or response)

### 3. ReasoningBlock

AI's internal reasoning (from extended thinking):

```
╭─ Reasoning ──────────────────────────────────────────╮
│ The user wants to find tax-related documents.        │
│ I'll search ~/Documents for PDF files containing     │
│ "tax" in the filename or content...                  │
╰──────────────────────────────────────────────────────╯
```

- Collapsed by default (shows first 2 lines + "Show more")
- Click to expand full reasoning
- Dim text color — secondary information
- Optional — hidden entirely if user prefers (setting)

### 4. ToolCallCard

Shows when a tool starts executing:

```
┌ Running: search files ─────────────────────────────────┐
│  Pattern: *.pdf   Path: ~/Documents   Query: "tax"     │
└────────────────────────────────────────────────────────┘
```

- Appears instantly when tool_call status fires
- Shows tool name + key parameters (readable, not raw JSON)
- Subtle border-left accent color (info blue)
- When tool completes: transforms into ToolResultBlock with result

### 5. FileListResult

For `list_files` and `search_files` results:

```
┌ Files Found ───────────────────────────────────────────┐
│  📄 tax_return_2025.pdf      145 KB   Jan 15   [Open]  │
│  📄 tax_documents_q4.pdf      89 KB   Dec 20   [Open]  │
│  📄 w2_form_2025.pdf          22 KB   Feb 1    [Open]  │
└────────────────────────────────────────────────────────┘
```

- File icon based on extension (📄 PDF, 📊 spreadsheet, 📝 text, 📁 folder, 🖼 image)
- File name (clickable — opens file)
- Size (human-readable)
- Modified date (relative or absolute)
- [Open] button — uses Electron `shell.openPath()`
- [Show in Finder/Explorer] on hover

Implementation:
```tsx
function FileListResult({ files }: { files: FileInfo[] }) {
  return (
    <div className="card file-list">
      <div className="card-header">Files Found</div>
      {files.map((file) => (
        <div key={file.path} className="file-row">
          <span className="file-icon">{getFileIcon(file.ext)}</span>
          <span className="file-name" onClick={() => openFile(file.path)}>
            {file.name}
          </span>
          <span className="file-size dim">{formatSize(file.size)}</span>
          <span className="file-date dim">{formatDate(file.modified)}</span>
          <button className="file-action" onClick={() => openFile(file.path)}>
            Open
          </button>
        </div>
      ))}
    </div>
  );
}
```

### 6. FileActionCard

For `write_file` and `edit_file` results:

**Write:**
```
┌ Created ───────────────────────────────────────────────┐
│  ✓ ~/Documents/meeting_notes.md                        │
│  1.2 KB written                                        │
│  [Open]  [Open in editor]                              │
└────────────────────────────────────────────────────────┘
```

**Edit (diff view):**
```
┌ Edited: config.json ──────────────────────────────────┐
│  - "port": 3000                                        │
│  + "port": 8080                                        │
│  [Open]  [Undo]                                        │
└────────────────────────────────────────────────────────┘
```

### 7. CodeBlock

For `read_file` and `bash` output that looks like code:

```
┌ ~/src/index.js ────────────────────────────────── [Copy] ┐
│  1  const express = require('express');                    │
│  2  const app = express();                                │
│  3                                                        │
│  4  app.get('/', (req, res) => {                         │
│  5    res.send('Hello World');                            │
│  6  });                                                  │
└──────────────────────────────────────────────────────────┘
```

- Syntax highlighting (lightweight: keywords, strings, comments, numbers)
- Line numbers
- Filename in header
- [Copy] button copies content without line numbers
- Scrollable if content is long (max-height: 400px)

### 8. WebSearchResults

For `web_search` results:

```
┌ Search: "best project management tools 2026" ─────────┐
│                                                         │
│  Linear — Issue tracking for modern teams               │
│  linear.app                                             │
│                                                         │
│  Notion — All-in-one workspace                          │
│  notion.so                                              │
│                                                         │
│  Height — Autonomous project management                 │
│  height.app                                             │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

- Title (clickable — opens in browser)
- URL in dim text
- Snippet/description
- Max 5 results shown, [Show more] expands

### 9. SystemInfoResult

For `jeriko sys` output:

```
┌ System ────────────────────────────────────────────────┐
│                                                         │
│  CPU    ████████░░░░░░░░  48%    Apple M2 Pro           │
│  RAM    ██████████░░░░░░  62%    10.2 / 16 GB           │
│  Disk   ████████████████  89%    445 / 500 GB           │
│  Battery ████████████░░░  80%    Charging                │
│                                                         │
│  Uptime: 4 days, 7 hours                               │
└─────────────────────────────────────────────────────────┘
```

- Progress bars with color coding (green < 60%, yellow 60-80%, red > 80%)
- Clean labels
- Updates once (not live — user can ask again)

### 10. ImagePreview

For `screenshot` results and dropped images:

```
┌ Screenshot ────────────────────────────────────────────┐
│                                                         │
│  [Inline image preview, max 400px tall]                │
│                                                         │
│  2560×1440  1.8 MB  ~/Desktop/screenshot.png           │
│  [Open]  [Copy]  [Save as...]                          │
└─────────────────────────────────────────────────────────┘
```

- Image rendered inline using `<img>` tag with `file://` protocol
- Max height 400px, aspect ratio preserved
- Click image to open full size in system viewer
- Metadata below: dimensions, size, path

### 11. ConfirmationPrompt

For destructive actions:

```
┌ ⚠ Confirm ────────────────────────────────────────────┐
│                                                         │
│  This will delete 3 files:                              │
│                                                         │
│    old_backup.zip         1.2 GB                       │
│    temp_download.dmg      890 MB                       │
│    cache.dat              45 MB                        │
│                                                         │
│  Total: 2.1 GB will be freed                           │
│                                                         │
│  [Delete]                      [Cancel]                 │
└─────────────────────────────────────────────────────────┘
```

- Warning color accent (yellow border)
- Clear description of what will happen
- Action buttons: primary action on left, cancel on right
- Cancel is default (pressing Enter = cancel, not delete)
- Keyboard: `y` = proceed, `n` or `Escape` = cancel

### 12. SecurityWarning

When `security.js` blocks a command:

```
┌ Blocked ───────────────────────────────────────────────┐
│                                                         │
│  I blocked a potentially dangerous command:             │
│  rm -rf /                                              │
│                                                         │
│  This command could delete all files on your computer.  │
│  If you intended something else, try rephrasing.        │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

- Red border accent
- Explains what was blocked and why in plain language
- No "proceed anyway" — blocked means blocked

### 13. ErrorRecovery

When something fails:

```
┌ Error ─────────────────────────────────────────────────┐
│                                                         │
│  I couldn't find "report.pdf" in your Documents.       │
│                                                         │
│  Did you mean:                                         │
│    quarterly_report.pdf (Documents)                     │
│    report_draft.docx (Desktop)                         │
│                                                         │
│  [Open first match]  [Search everywhere]                │
└─────────────────────────────────────────────────────────┘
```

- Friendly, non-technical error message
- Suggestions when possible
- Action buttons to recover

### 14. StreamedResponse

AI's final text response:

- Text appears character by character (streaming)
- Markdown rendered: bold, italic, links, lists, code blocks, tables
- Links clickable (open in system browser)
- Code blocks in response get syntax highlighting
- Text wraps naturally (not monospace for prose)

### 15. ParallelResults

For `parallel_tasks` output:

```
┌ Parallel Tasks (3/3 complete) ─────────────────────────┐
│                                                         │
│  ✓ Search files          Found 12 results   (0.8s)     │
│  ✓ Check system status   All healthy         (0.3s)     │
│  ✓ Web search            5 results           (1.2s)     │
│                                                         │
│  [Expand results]                                       │
└─────────────────────────────────────────────────────────┘
```

- Progress bar while running (2/3 complete)
- Each sub-task shows status
- Expandable to see full results of each

---

## Tool Result Classification

The main process needs to classify tool results to tell the renderer which component to use:

```typescript
// src/main/classify.ts

interface ClassifiedResult {
  component: string;
  data: any;
}

function classifyToolResult(toolName: string, input: any, result: string): ClassifiedResult {
  switch (toolName) {
    case 'list_files':
      return { component: 'FileListResult', data: parseFileList(result) };

    case 'search_files':
      return { component: 'SearchResults', data: parseSearchResults(result) };

    case 'read_file':
      return { component: 'CodeBlock', data: { content: result, filename: input.path } };

    case 'write_file':
      return { component: 'FileActionCard', data: { action: 'created', path: input.path } };

    case 'edit_file':
      return { component: 'FileActionCard', data: { action: 'edited', path: input.path, old: input.old_string, new: input.new_string } };

    case 'web_search':
      return { component: 'WebSearchResults', data: parseSearchResults(result) };

    case 'screenshot':
      return { component: 'ImagePreview', data: { path: extractPath(result) } };

    case 'bash':
      if (isSystemInfo(result)) return { component: 'SystemInfoResult', data: parseSystemInfo(result) };
      return { component: 'CodeBlock', data: { content: result, language: 'bash' } };

    case 'parallel_tasks':
      return { component: 'ParallelResults', data: parseParallelResults(result) };

    default:
      return { component: 'GenericResult', data: { text: result } };
  }
}
```

The classification happens in the main process before sending the tool_result status event. The renderer receives `{ component, data }` and renders the correct component.

---

## Drag and Drop

### Implementation

```tsx
// In App.tsx or OutputArea.tsx
function handleDrop(e: React.DragEvent) {
  e.preventDefault();
  e.stopPropagation();

  const items = Array.from(e.dataTransfer.items);

  for (const item of items) {
    if (item.kind === 'file') {
      const file = item.getAsFile();
      if (!file) continue;

      // File drop
      const filePath = (file as any).path;  // Electron adds .path
      handleFileDrop(filePath, file.name, file.size, file.type);

    } else if (item.kind === 'string' && item.type === 'text/plain') {
      // Text drop
      item.getAsString((text) => {
        handleTextDrop(text);
      });
    }
  }
}

function handleFileDrop(filePath: string, name: string, size: number, type: string) {
  // Add a drop-received block to output
  addBlock({
    type: 'file_drop',
    data: { path: filePath, name, size, type },
    actions: getDropActions(type),
  });
}

function getDropActions(mimeType: string): DropAction[] {
  if (mimeType.startsWith('image/')) {
    return ['Describe it', 'Extract text', 'Edit', 'Email it'];
  }
  if (mimeType === 'application/pdf') {
    return ['Summarize', 'Extract text', 'Convert', 'Email it'];
  }
  return ['Summarize', 'Convert', 'Email it', 'Open'];
}
```

### Drop Zone Visual

When dragging over the window:

```css
.app.drag-over::after {
  content: 'Drop here';
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(88, 166, 255, 0.1);
  border: 2px dashed var(--accent);
  border-radius: 8px;
  margin: 8px;
  font-size: 18px;
  color: var(--accent);
  z-index: 50;
  pointer-events: none;
}
```

---

## Conversation Persistence

### Auto-Save

```typescript
// In useJeriko hook, after each AI response completes
useEffect(() => {
  if (!isProcessing && blocks.length > 0) {
    window.api.saveTabs(tabs.map((tab) => ({
      ...tab,
      history: tab.id === activeTabId ? blocks : tab.history,
    })));
  }
}, [isProcessing, blocks.length]);
```

### Conversation Storage Format

Each tab's conversation is stored as JSONL:

```
~/.jeriko/terminal/conversations/{tabId}.jsonl
```

Each line is one message:
```json
{"role":"user","content":"search my documents for tax forms","timestamp":"2026-02-25T10:30:00Z"}
{"role":"assistant","content":"Found 3 tax-related documents...","timestamp":"2026-02-25T10:30:05Z","toolCalls":[...]}
```

Metadata sidecar:
```json
// {tabId}.meta.json
{
  "id": "abc123",
  "label": "Tax documents",
  "createdAt": "2026-02-25T10:30:00Z",
  "lastActiveAt": "2026-02-25T10:35:00Z",
  "messageCount": 12
}
```

### History File

Global command history:

```
~/.jeriko/terminal/history.jsonl
```

Max 10,000 entries. FIFO rotation (oldest entries removed when limit reached).

---

## Global Hotkey

```typescript
// src/main/hotkey.ts
import { globalShortcut, BrowserWindow } from 'electron';

export function registerHotkey(mainWindow: BrowserWindow, accelerator: string) {
  // Unregister previous if exists
  globalShortcut.unregisterAll();

  globalShortcut.register(accelerator, () => {
    if (mainWindow.isVisible() && mainWindow.isFocused()) {
      // Already visible and focused — hide
      mainWindow.hide();
    } else if (mainWindow.isVisible()) {
      // Visible but not focused — focus
      mainWindow.focus();
    } else {
      // Hidden — show and focus
      mainWindow.show();
      mainWindow.focus();
    }

    // Always focus the prompt input
    mainWindow.webContents.send('focus-prompt');
  });
}
```

Default accelerator: `CommandOrControl+Shift+Space`

User can change in Settings. New shortcut validated (not conflicting with system shortcuts).

---

## System Tray

```typescript
// src/main/tray.ts
import { Tray, Menu, nativeImage } from 'electron';

export function createTray(mainWindow: BrowserWindow): Tray {
  const icon = nativeImage.createFromPath(
    path.join(__dirname, '..', 'resources', 'tray-icon.png')
  ).resize({ width: 16, height: 16 });

  const tray = new Tray(icon);

  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Jeriko', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.quit(); } },
  ]));

  tray.on('click', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  return tray;
}
```

Closing the window hides to tray instead of quitting:

```typescript
mainWindow.on('close', (e) => {
  if (!app.isQuitting) {
    e.preventDefault();
    mainWindow.hide();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
});
```

---

## Output Virtualization

For long sessions (hundreds of output blocks), rendering all blocks causes lag. Use virtualization:

```tsx
// Simple approach: only render blocks in viewport + buffer
function VirtualizedOutputArea({ blocks }) {
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 50 });

  function handleScroll(e) {
    // Calculate which blocks are visible based on scroll position
    // Update visibleRange
    // Keep a buffer of 20 blocks above and below viewport
  }

  return (
    <div className="output-area" onScroll={handleScroll}>
      <div style={{ height: estimatedHeightBefore }} />
      {blocks.slice(visibleRange.start, visibleRange.end).map(renderBlock)}
      <div style={{ height: estimatedHeightAfter }} />
    </div>
  );
}
```

Only implement if performance issues are observed. Start with simple rendering — React handles hundreds of DOM nodes fine for most use cases.

---

## Acceptance Criteria

Phase 2 is complete when ALL of the following are true:

- [ ] All 15 output components render correctly
- [ ] Tool results are classified and routed to correct components
- [ ] File results show [Open] buttons that work (opens file in system)
- [ ] Code blocks have syntax highlighting and [Copy] button
- [ ] Image previews display inline
- [ ] System info shows progress bar gauges
- [ ] Confirmation prompt blocks until user responds
- [ ] Security warnings render with red accent
- [ ] Error messages are friendly with recovery suggestions
- [ ] Streaming text renders character by character (not batched)
- [ ] Output blocks fade in with animation
- [ ] Thinking indicator pulses and shows elapsed time
- [ ] Drag and drop: files show action options
- [ ] Drag and drop: images show preview
- [ ] Drag and drop: text shows content
- [ ] Conversations auto-save on each response
- [ ] Tabs restore with full history on app restart
- [ ] Command history persists between sessions
- [ ] Up/Down arrow cycles through persistent history
- [ ] Global hotkey summons/hides Jeriko
- [ ] System tray icon present
- [ ] Close window hides to tray (doesn't quit)
- [ ] Tray click reopens window
- [ ] Welcome message shows on empty tabs
- [ ] Welcome message disappears after first command
- [ ] Long sessions (100+ blocks) don't cause visible lag
- [ ] All clickable elements have hover states
- [ ] All animations are 150ms or less (never feel sluggish)
