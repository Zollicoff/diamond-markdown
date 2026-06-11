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
  "commands": [
    { "id": "say-hello", "title": "Say Hello", "category": "plugin" }
  ]
}
```

`entry` defaults to `main.js` and must point to a `.js` or `.mjs` file inside
the plugin directory.

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
- `api.registerCommand(command)`
- `api.registerMarkdownPostprocessor(processor)`
- `api.registerRightPanel(panel)`
- `api.registerSettingsPanel(panel)`
- `api.notify(message)`

## Settings Panels

Plugins can add a small settings panel to the Settings tab:

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

## Right Panels

Plugins can add note-aware panels to the right sidebar:

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

Current plugins run as browser ESM in the Diamond Markdown app context. Only
install plugins you trust. Sandboxed UI/worker execution is a planned v0.5
follow-up before treating untrusted third-party plugins as safe.
