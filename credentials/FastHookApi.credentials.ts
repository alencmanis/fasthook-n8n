import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class FastHookApi implements ICredentialType {
	name = 'fastHookApi';
	displayName = 'FastHook API';
	documentationUrl = 'https://www.fasthook.io';
	icon = 'file:../nodes/FastHook/fasthook.svg' as const;
	properties: INodeProperties[] = [
		{
			displayName: 'Project API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description:
				'FastHook project key with control:read. Writes also need control:execute and their explicit operation grant.',
		},
	];
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: { headers: { Authorization: '=Bearer {{$credentials.apiKey}}' } },
	};
	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.fasthook.io/v1',
			url: '/requests',
			method: 'GET',
			qs: { limit: 1 },
		},
	};
}
