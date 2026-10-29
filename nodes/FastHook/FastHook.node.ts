import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { operations, properties } from './descriptions';
import { identifier, list, operationError, transport } from './transport';

export class FastHook implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'FastHook',
		name: 'fastHook',
		icon: { light: 'file:fasthook.svg', dark: 'file:fasthook.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Read FastHook requests and delivery history or retry delivery',
		defaults: { name: 'FastHook' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [{ name: 'fastHookApi', required: true }],
		properties,
	};
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const output: INodeExecutionData[] = [];
		const request = transport(this);
		for (let i = 0; i < this.getInputData().length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				if (!operations[resource]?.some(([key]) => key === operation))
					throw new NodeOperationError(
						this.getNode(),
						'Select a supported FastHook resource and operation.',
						{ itemIndex: i },
					);
				const path = `/${resource}s`;
				let rows: IDataObject[];
				if (operation === 'getMany') {
					const from = Date.parse(this.getNodeParameter('from', i) as string);
					const rawTo = this.getNodeParameter('to', i) as string;
					const to = rawTo ? Date.parse(rawTo) : Date.now();
					if (!Number.isFinite(from) || !Number.isFinite(to) || from > to)
						throw new NodeOperationError(
							this.getNode(),
							'Set a valid From date at or before the To date.',
							{ itemIndex: i },
						);
					const filters = this.getNodeParameter('filters', i) as IDataObject;
					const query: IDataObject = {
						from: new Date(from).toISOString(),
						to: new Date(to).toISOString(),
					};
					for (const name of resource === 'attempt'
						? ['event_id', 'request_id', 'q']
						: ['source_id', 'q']) {
						if (typeof filters[name] === 'string' && filters[name].trim())
							query[name] = filters[name].trim();
					}
					if (resource === 'request' && this.getNodeParameter('includeData', i))
						query.include = 'data';
					const limit = this.getNodeParameter('returnAll', i)
						? Infinity
						: Number(this.getNodeParameter('limit', i));
					if (limit !== Infinity && (!Number.isInteger(limit) || limit < 1 || limit > 10000))
						throw new NodeOperationError(this.getNode(), 'Limit must be between 1 and 10000.', {
							itemIndex: i,
						});
					rows = await list(request, path, query, limit);
				} else {
					const id = identifier(this.getNodeParameter('resourceId', i) as string);
					const suffix =
						operation === 'trace'
							? '/trace'
							: ['replay', 'retry'].includes(operation)
								? '/retry'
								: operation === 'run'
									? '/run'
									: '';
					const method = ['replay', 'retry', 'run'].includes(operation) ? 'POST' : 'GET';
					rows = [
						await request(
							method,
							`${path}/${id}${suffix}`,
							{},
							operation === 'replay' ? {} : undefined,
						),
					];
				}
				output.push(...rows.map((json) => ({ json, pairedItem: { item: i } })));
			} catch (error) {
				const failure = operationError(this, error, i);
				if (!this.continueOnFail()) throw failure;
				output.push({ json: { error: failure.message }, pairedItem: { item: i } });
			}
		}
		return [output];
	}
}
