import { NodeConnectionTypes } from 'n8n-workflow';
import type {
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IPollFunctions,
} from 'n8n-workflow';
import { identifier, operationError, transport } from './transport';
import { pollRequests } from './poll';
import type { Checkpoint } from './poll';

export class FastHookTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'FastHook Trigger',
		name: 'fastHookTrigger',
		icon: { light: 'file:fasthook.svg', dark: 'file:fasthook.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: 'New Request',
		description: 'Start a workflow when FastHook accepts a new request',
		defaults: { name: 'FastHook Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		polling: true,
		credentials: [{ name: 'fastHookApi', required: true }],
		properties: [
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				options: [{ name: 'New Request', value: 'newRequest' }],
				default: 'newRequest',
			},
			{
				displayName: 'Source ID',
				name: 'sourceId',
				type: 'string',
				default: '',
				description:
					'Optional source ID from FastHook. Leave empty to listen to all sources in the key’s project.',
			},
			{
				displayName:
					'Active workflows start listening from the first poll. Manual tests return the latest accepted request from the past 24 hours without changing the checkpoint.',
				name: 'pollNotice',
				type: 'notice',
				default: '',
			},
		],
	};
	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		try {
			const rawSource = (this.getNodeParameter('sourceId') as string).trim();
			const source = rawSource ? identifier(rawSource) : '';
			const credentialsId = this.getNode().credentials?.fastHookApi?.id ?? '';
			const fingerprint = JSON.stringify([credentialsId, source]);
			const state = this.getWorkflowStaticData('node');
			const result = await pollRequests(
				transport(this),
				state.checkpoint as unknown as Checkpoint | undefined,
				fingerprint,
				source,
				this.getMode() === 'manual',
				Date.now(),
			);
			if (result.checkpoint) state.checkpoint = result.checkpoint as unknown as IDataObject;
			return result.rows.length ? [result.rows.map((json) => ({ json }))] : null;
		} catch (error) {
			throw operationError(this, error);
		}
	}
}
