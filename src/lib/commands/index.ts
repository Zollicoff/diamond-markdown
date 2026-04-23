/**
 * Public surface for the command system. Call `registerBuiltinCommands`
 * exactly once at app boot (already handled by the vault shell).
 */

import { registerFsCommands } from './builtin/fs';
import { registerTabCommands } from './builtin/tabs';
import { registerViewCommands } from './builtin/view';

let initialized = false;

export function registerBuiltinCommands(): void {
	if (initialized) return;
	initialized = true;
	registerFsCommands();
	registerTabCommands();
	registerViewCommands();
}

export { exec, get, list, register, unregister } from './registry';
export type { CommandDef, CommandContext } from './registry';
