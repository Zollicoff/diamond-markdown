export interface PluginCommandManifest {
	id: string;
	title: string;
	icon?: string;
	category?: string;
}

export type PluginExecutionMode = 'trusted' | 'worker';

export interface PluginManifest {
	id: string;
	name: string;
	version: string;
	description?: string;
	author?: string;
	entry: string;
	execution: PluginExecutionMode;
	commands?: PluginCommandManifest[];
}

export interface PluginDescriptor {
	id: string;
	name: string;
	version: string;
	description?: string;
	author?: string;
	entry: string;
	execution: PluginExecutionMode;
	commands: PluginCommandManifest[];
	moduleUrl: string;
	enabled: boolean;
	error?: string;
}

export interface PluginListResponse {
	plugins: PluginDescriptor[];
}

export interface PluginInstallResponse extends PluginListResponse {
	plugin: PluginDescriptor;
	message: string;
}
