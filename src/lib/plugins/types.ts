export interface PluginCommandManifest {
	id: string;
	title: string;
	icon?: string;
	category?: string;
}

export interface PluginManifest {
	id: string;
	name: string;
	version: string;
	description?: string;
	author?: string;
	entry: string;
	commands?: PluginCommandManifest[];
}

export interface PluginDescriptor {
	id: string;
	name: string;
	version: string;
	description?: string;
	author?: string;
	entry: string;
	commands: PluginCommandManifest[];
	moduleUrl: string;
	enabled: boolean;
	error?: string;
}

export interface PluginListResponse {
	plugins: PluginDescriptor[];
}
