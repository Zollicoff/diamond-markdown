# Diamond Markdown Plugins

Diamond Markdown loads vault-local plugins from:

```text
<vault>/.diamondmd/plugins/<plugin-id>/
```

Each plugin directory must contain a `plugin.json` manifest and an ESM entry
module. Plugin ids must match their folder names and use only letters, numbers,
underscores, and hyphens.

## Manifest

```json
{
  "id": "hello-diamond",
  "name": "Hello Diamond",
  "version": "0.1.0",
  "description": "Registers one command.",
  "entry": "main.js",
  "execution": "trusted",
  "commands": [
    { "id": "say-hello", "title": "Say Hello", "category": "plugin" }
  ]
}
```

`entry` defaults to `main.js` and must point to a `.js` or `.mjs` file inside
the plugin directory. `execution` defaults to `trusted`; set it to `worker` for
DOM-isolated command-only plugin logic.

## Install From URL

Settings -> Plugins can install a plugin from a remote manifest URL. Diamond
fetches the `plugin.json`, validates the manifest, fetches the declared entry
module beside that manifest, then writes both files into:

```text
<vault>/.diamondmd/plugins/<plugin-id>/
```

Manifest and entry URLs must use HTTPS, except localhost HTTP URLs are accepted
for development. Diamond rejects URL credentials, plugin id/folder mismatches,
absolute entry paths, `..` escapes, query/hash entry paths, and overwrite
attempts unless "replace existing" is checked.

## Catalog

Settings -> Plugins also includes a small curated catalog. Catalog entries are
served from `/api/plugins/catalog` and installed by catalog id. Catalog installs
reuse the same manifest parsing, replacement checks, and vault-local write path
as manual URL installs. That means catalog plugins are copied into the vault
under `.diamondmd/plugins/<plugin-id>/` and follow the same validation,
replacement, and runtime reload behavior.

## Entry Module

```js
export function activate(api) {
  api.registerCommand({
    id: 'say-hello',
    title: 'Say Hello',
    icon: '◇',
    category: 'plugin',
    exec() {
      api.notify(`Hello from ${api.pluginId}`);
    }
  });

  return () => {
    // Optional cleanup when the vault UI unloads.
  };
}
```

Commands are registered at vault boot with scoped runtime ids:

```text
plugin:<plugin-id>:<command-id>
```

The public API is intentionally small while the plugin system is young:

- `api.vaultId`
- `api.pluginId`
- `api.files.readNote(path)`
- `api.files.writeNote(path, content, options?)`
- `api.registerCommand(command)`
- `api.registerEditorCommand(command)`
- `api.registerMarkdownPostprocessor(processor)`
- `api.registerRightPanel(panel)`
- `api.registerSettingsPanel(panel)`
- `api.notify(message)`

## Execution Modes

Trusted plugins run as browser ESM in the Diamond Markdown app context. They can
use the full API, including UI renderers and markdown postprocessors, and should
only come from sources you trust.

Worker plugins declare `"execution": "worker"` in `plugin.json`. Diamond loads
their entry module inside a module Worker and currently exposes:

- `api.vaultId`
- `api.pluginId`
- `api.files.readNote(path)`
- `api.files.writeNote(path, content, options?)`
- `api.registerCommand(command)`
- `api.registerEditorCommand(command)`
- `api.registerRightPanel(panel)` for iframe panels only
- `api.registerSettingsPanel(panel)` for iframe panels only
- `api.notify(message)`

Worker command handlers receive a serializable command context, not live DOM or
raw app objects. Worker editor command handlers receive a promise-returning
editor proxy instead of the live CodeMirror object. Network APIs such as
`fetch`, `XMLHttpRequest`, `WebSocket`, and `EventSource` are disabled in the
worker bootstrap. This isolates command logic from the main app DOM, but it is
not yet a complete untrusted-plugin permission system.

## File Capabilities

Trusted and worker plugins can read and write markdown notes through the
host-mediated file capability:

```js
export function activate(api) {
  api.registerCommand({
    id: 'append-source',
    title: 'Append Source',
    async exec(context) {
      if (!context.notePath) return;
      const note = await api.files.readNote(context.notePath);
      await api.files.writeNote(note.path, `${note.content}\n\nSource: Diamond`, {
        expectedRevision: note.revision
      });
    }
  });
}
```

The capability only accepts relative markdown note paths. Absolute paths,
relative path traversal, hidden segments such as `.diamondmd`, and non-markdown
extensions are rejected by the host before a request reaches the server.
Returned note data is serializable: `path`, `content`, `revision`, `mtime`,
`frontmatter`, `body`, and `tags`.

## Editor Commands

Plugins can register commands that only appear when the active tab has a live
editor:

```js
export function activate(api) {
  api.registerEditorCommand({
    id: 'insert-callout',
    title: 'Insert Callout',
    exec(context) {
      context.editor.insertTemplate('> [!note] {{cursor}}');
      console.info(`Inserted into ${context.doc.path}`);
    }
  });
}
```

Editor command contexts include `editor`, `doc`, `notePath`, `paneId`, `tabId`,
`vaultId`, and `pluginId`. They reuse the main command palette and may define a
`when(context)` predicate for note-specific visibility.

Worker editor commands support the same registration shape, but `when` is not
available because functions cannot be moved across the Worker boundary. The
worker editor proxy currently supports `insert`, `insertTemplate`, `wrap`,
`prependLines`, `toggleHeading`, `insertWikilink`, `insertCodeBlock`,
`scrollToHeading`, and `focus`; each method returns a promise because the host
applies the mutation.

```js
export function activate(api) {
  api.registerEditorCommand({
    id: 'insert-source',
    title: 'Insert Source',
    async exec(context) {
      await context.editor.insertTemplate('Source: {{cursor}}');
    }
  });
}
```

## Settings Panels

Trusted plugins can add a small DOM-rendered settings panel to the Settings
tab:

```js
export function activate(api) {
  api.registerSettingsPanel({
    id: 'general',
    title: 'Hello Diamond',
    description: 'Settings owned by this plugin.',
    render(container, context) {
      container.innerHTML = `<button type="button">Ping ${context.pluginId}</button>`;
    }
  });
}
```

`render(container, context)` may return a cleanup function. Diamond calls that
cleanup when the vault UI unloads or the plugin runtime is disposed.

Trusted and worker plugins can also register sandboxed iframe settings panels
by providing `html` instead of `render`:

```js
export function activate(api) {
  api.registerSettingsPanel({
    id: 'safe-settings',
    title: 'Safe Settings',
    html: `
      <button id="status">Waiting</button>
      <script>
        window.addEventListener('message', (event) => {
          if (event.data?.type !== 'diamond:panel-context') return;
          document.getElementById('status').textContent = event.data.context.pluginId;
        });
      <\/script>
    `,
    height: 120
  });
}
```

Iframe panels run with `sandbox="allow-scripts"`. They receive panel context by
`postMessage` and cannot read the parent document.

## Right Panels

Trusted plugins can add note-aware DOM-rendered panels to the right sidebar:

```js
export function activate(api) {
  api.registerRightPanel({
    id: 'note-stats',
    title: 'Note Stats',
    render(container, context) {
      container.textContent = `${context.doc.path}: ${context.doc.body.length} chars`;
    }
  });
}
```

Right-panel renderers receive the active `doc` object. They rerender when the
active note changes, and may return a cleanup function.

Trusted and worker plugins can register right-sidebar iframe panels the same
way as settings panels. The posted context includes the active `doc`.

## Markdown Postprocessors

Plugins can enhance sanitized rendered markdown in Read mode:

```js
export function activate(api) {
  api.registerMarkdownPostprocessor({
    id: 'mark-todos',
    process(root, context) {
      for (const item of root.querySelectorAll('li')) {
        if (item.textContent?.startsWith('TODO')) item.classList.add('plugin-todo');
      }
      console.info(`Processed ${context.doc.path}`);
    }
  });
}
```

Postprocessors run after Diamond inserts the server-sanitized HTML and renders
Mermaid blocks. The context includes `doc`, `root`, `pluginId`, and
`processorId`. They may return a cleanup function, which runs before the preview
rerenders or unloads.

## Security Notes

Trusted plugins run in the main app context. Worker plugins isolate command
logic from the DOM, and iframe panels isolate plugin UI from the parent document.
Note file access and active-editor mutations go through host capability proxies.
Only install plugins you trust while the permission model remains young.
