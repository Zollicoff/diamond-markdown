import { spawnSync } from 'node:child_process';

function npmExecPath() {
	return process.env.npm_execpath || process.env.NPM_CLI_JS || '';
}

export function commandSpec(command, args = []) {
	if (process.platform === 'win32' && (command === 'npm' || command === 'npx')) {
		const npmCli = npmExecPath();
		if (npmCli) {
			if (command === 'npm') {
				return {
					command: process.execPath,
					args: [npmCli, ...args],
					display: formatCommand(command, args)
				};
			}
			return {
				command: process.execPath,
				args: [npmCli, 'exec', '--', ...args],
				display: formatCommand(command, args)
			};
		}
		return {
			command: `${command}.cmd`,
			args,
			display: formatCommand(command, args)
		};
	}

	return {
		command,
		args,
		display: formatCommand(command, args)
	};
}

export function formatCommand(command, args = []) {
	return [command, ...args].join(' ');
}

export function spawnCommandSync(command, args = [], options = {}) {
	const spec = commandSpec(command, args);
	return spawnSync(spec.command, spec.args, options);
}
