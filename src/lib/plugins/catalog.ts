import type { PluginCatalogItem, PluginManifest } from './types';

interface PluginCatalogDefinition {
	manifest: PluginManifest;
	tags: string[];
	source: string;
}

const SCRATCHPAD_HELPER_SOURCE = `
export function activate(api) {
  api.notify('Scratchpad helper ready');
  api.registerCommand({
    id: 'scratchpad-status',
    title: 'Catalog Scratchpad Status',
    category: 'plugin',
    exec(context) {
      return { notify: 'Scratchpad helper sees ' + (context.notePath ?? 'no active note') };
    }
  });
}
`;

const TODO_HIGHLIGHTER_SOURCE = `
const STYLE_ID = 'diamond-catalog-todo-highlighter-style';

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = '.diamond-catalog-todo { border-left: 3px solid var(--accent); padding-left: 0.55rem; }';
  document.head.append(style);
}

export function activate(api) {
  api.registerMarkdownPostprocessor({
    id: 'todo-highlighter',
    process(root) {
      ensureStyle();
      const marked = [];
      for (const item of root.querySelectorAll('li, p')) {
        if (/\\bTODO\\b/i.test(item.textContent ?? '')) {
          item.classList.add('diamond-catalog-todo');
          marked.push(item);
        }
      }
      return () => {
        for (const item of marked) item.classList.remove('diamond-catalog-todo');
      };
    }
  });
}
`;

export const PLUGIN_CATALOG: PluginCatalogDefinition[] = [
	{
		manifest: {
			id: 'scratchpad-helper',
			name: 'Scratchpad Helper',
			version: '0.1.0',
			description: 'Adds a worker-backed command that reports the active note context.',
			author: 'Diamond Markdown',
			entry: 'main.js',
			execution: 'worker',
			commands: [{ id: 'scratchpad-status', title: 'Catalog Scratchpad Status', category: 'plugin' }]
		},
		tags: ['commands', 'worker', 'starter'],
		source: SCRATCHPAD_HELPER_SOURCE.trimStart()
	},
	{
		manifest: {
			id: 'todo-highlighter',
			name: 'TODO Highlighter',
			version: '0.1.0',
			description: 'Highlights TODO items in Read mode using a markdown postprocessor.',
			author: 'Diamond Markdown',
			entry: 'main.js',
			execution: 'trusted',
			commands: []
		},
		tags: ['markdown', 'read-mode', 'starter'],
		source: TODO_HIGHLIGHTER_SOURCE.trimStart()
	}
];

export function pluginCatalogItems(origin: string): PluginCatalogItem[] {
	return PLUGIN_CATALOG.map(({ manifest, tags }) => ({
		id: manifest.id,
		name: manifest.name,
		version: manifest.version,
		description: manifest.description ?? '',
		author: manifest.author,
		execution: manifest.execution,
		tags,
		commands: manifest.commands ?? [],
		manifestUrl: `${origin}/api/plugins/catalog/${encodeURIComponent(manifest.id)}/plugin.json`
	}));
}

export function pluginCatalogDefinition(id: string): PluginCatalogDefinition | undefined {
	return PLUGIN_CATALOG.find((plugin) => plugin.manifest.id === id);
}
