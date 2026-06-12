import type { GEdge, GNode } from './sim';

export interface GraphApiNode {
	path: string;
	title: string;
	degree: number;
}

export interface GraphApiData {
	nodes: GraphApiNode[];
	edges: GEdge[];
}

export interface GraphSimulationData {
	nodes: GNode[];
	edges: GEdge[];
}

type RandomSource = () => number;

function initialCoordinate(random: RandomSource): number {
	return (random() - 0.5) * 400;
}

export function graphApiNodeToSimulationNode(
	node: GraphApiNode,
	random: RandomSource = Math.random
): GNode {
	return {
		path: node.path,
		title: node.title,
		degree: node.degree,
		x: initialCoordinate(random),
		y: initialCoordinate(random),
		vx: 0,
		vy: 0,
		fx: null,
		fy: null
	};
}

export function buildGraphSimulationData(
	data: GraphApiData,
	random: RandomSource = Math.random
): GraphSimulationData {
	const byPath = new Map<string, GNode>();
	for (const node of data.nodes) {
		byPath.set(node.path, graphApiNodeToSimulationNode(node, random));
	}

	return {
		nodes: [...byPath.values()],
		edges: data.edges.filter((edge) => byPath.has(edge.from) && byPath.has(edge.to))
	};
}
