import type { INodeProperties } from 'n8n-workflow';

export const operations: Record<string, Array<[string, string, string]>> = {
	request: [
		['get', 'Get', 'Get a request'],
		['getMany', 'Get Many', 'Get many requests'],
		['trace', 'Get Trace', 'Get a request delivery trace'],
		['replay', 'Replay', 'Replay a request without modifying its payload'],
	],
	event: [
		['get', 'Get', 'Get an event'],
		['getMany', 'Get Many', 'Get many events'],
		['retry', 'Retry Delivery', 'Retry delivery of an event'],
	],
	attempt: [
		['get', 'Get', 'Get an attempt'],
		['getMany', 'Get Many', 'Get many attempts'],
	],
	source: [['run', 'Run Now', 'Queue a polling source run']],
};

export const properties: INodeProperties[] = [
	{
		displayName: 'Resource',
		name: 'resource',
		type: 'options',
		noDataExpression: true,
		default: 'request',
		options: [
			{ name: 'Attempt', value: 'attempt' },
			{ name: 'Event', value: 'event' },
			{ name: 'Request', value: 'request' },
			{ name: 'Source', value: 'source' },
		],
	},
	...Object.entries(operations)
		.filter(([resource]) => resource !== 'source')
		.map(
			([resource, entries]): INodeProperties => ({
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: [resource] } },
				default: 'get',
				options: entries.map(([value, name, description]) => ({
					name,
					value,
					description,
					action: description,
				})),
			}),
		),
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['source'] } },
		default: 'run',
		options: [
			{
				name: 'Run Now',
				value: 'run',
				description: 'Queue a polling source run',
				action: 'Queue a polling source run',
			},
		],
	},
	{
		displayName: 'ID',
		name: 'resourceId',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { hide: { operation: ['getMany'] } },
		description: 'FastHook request, event, attempt or source ID from the dashboard',
	},
	{
		displayName:
			'This queues a real operation in FastHook and may repeat downstream actions. Requires control:execute. Check delivery history before retrying an ambiguous failure.',
		name: 'writeNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { operation: ['replay', 'retry', 'run'] } },
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: { show: { operation: ['getMany'] } },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		typeOptions: { minValue: 1, maxValue: 10000 },
		description: 'Max number of results to return',
		displayOptions: { show: { operation: ['getMany'], returnAll: [false] } },
	},
	{
		displayName: 'From',
		name: 'from',
		type: 'dateTime',
		required: true,
		default: '',
		description: 'Beginning of the search range',
		displayOptions: { show: { operation: ['getMany'] } },
	},
	{
		displayName: 'To',
		name: 'to',
		type: 'dateTime',
		default: '',
		description: 'End of the search range. Leave empty for the current time.',
		displayOptions: { show: { operation: ['getMany'] } },
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: { operation: ['getMany'] } },
		options: [
			{
				displayName: 'Source ID',
				name: 'source_id',
				type: 'string',
				default: '',
				displayOptions: { show: { '/resource': ['request', 'event'] } },
			},
			{
				displayName: 'Event ID',
				name: 'event_id',
				type: 'string',
				default: '',
				displayOptions: { show: { '/resource': ['attempt'] } },
			},
			{
				displayName: 'Request ID',
				name: 'request_id',
				type: 'string',
				default: '',
				displayOptions: { show: { '/resource': ['attempt'] } },
			},
			{
				displayName: 'Search',
				name: 'q',
				type: 'string',
				default: '',
				description: 'Search text supported by the selected resource',
			},
		],
	},
	{
		displayName: 'Include Request Data',
		name: 'includeData',
		type: 'boolean',
		default: false,
		description: 'Whether to include the stored request payload',
		displayOptions: { show: { resource: ['request'], operation: ['getMany'] } },
	},
];
