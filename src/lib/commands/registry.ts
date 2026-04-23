/**
 * Command registry. Every user-facing action registers here so context
 * menus, future command palette, and hotkey routing all read from a
 * single list. Plugins will register here too.
 *
 * `exec` receives a context object — the minimum info the command
 * needs. Keep context generic; specific commands cast from it.
 */

export interface CommandContext {
	vaultId?: string;
	node?: { path: string; type: 'file' | 'directory'; name: string };
	paneId?: string;
	tabId?: string;
	selection?: string;
	[key: string]: unknown;
}

export interface CommandDef {
	id: string;
	title: string;
	icon?: string;
	shortcut?: string; // display string like "⌘S"
	category?: string;
	when?: (ctx: CommandContext) => boolean;
	exec: (ctx: CommandContext) => void | Promise<void>;
}

const registry = new Map<string, CommandDef>();

export function register(cmd: CommandDef): void {
	registry.set(cmd.id, cmd);
}

export function unregister(id: string): void {
	registry.delete(id);
}

export function get(id: string): CommandDef | undefined {
	return registry.get(id);
}

export function list(): CommandDef[] {
	return [...registry.values()];
}

export async function exec(id: string, ctx: CommandContext = {}): Promise<void> {
	const cmd = registry.get(id);
	if (!cmd) {
		console.warn(`[commands] unknown id: ${id}`);
		return;
	}
	if (cmd.when && !cmd.when(ctx)) return;
	await cmd.exec(ctx);
}
