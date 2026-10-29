import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import type { IDataObject, IExecuteFunctions, IPollFunctions } from 'n8n-workflow';

export type Context = IExecuteFunctions | IPollFunctions;
export type Request = (
	method: 'GET' | 'POST',
	path: string,
	qs?: IDataObject,
	body?: IDataObject,
) => Promise<IDataObject>;

export function transport(context: Context): Request {
	return async (method, path, qs = {}, body) => {
		try {
			return (await context.helpers.httpRequestWithAuthentication.call(context, 'fastHookApi', {
				method,
				url: `https://api.fasthook.io/v1${path}`,
				qs,
				...(body === undefined ? {} : { body }),
				json: true,
				timeout: 30000,
				disableFollowRedirect: true,
			})) as IDataObject;
		} catch (error: unknown) {
			// Never pass HTTP request options (which contain credentials) to error output.
			const raw = error as {
				statusCode?: number;
				httpCode?: string;
				response?: { status?: number };
			};
			const status = Number(raw?.statusCode ?? raw?.httpCode ?? raw?.response?.status) || undefined;
			const description =
				status === 401
					? 'Reconnect with a valid FastHook project API key.'
					: status === 403
						? 'Check the project, control:read / control:execute scopes, and explicit execute operation grants.'
						: status === 429
							? 'FastHook rate limit reached. Wait before trying again.'
							: method === 'POST'
								? 'Check FastHook delivery history before retrying: the operation may already have been accepted.'
								: 'Check the identifiers and filters in FastHook, then try again.';
			throw new NodeApiError(
				context.getNode(),
				{},
				{
					message: `FastHook request failed${status ? ` (HTTP ${status})` : ''}`,
					description,
					httpCode: status ? String(status) : undefined,
				},
			);
		}
	};
}

export function identifier(value: string): string {
	const id = value.trim();
	if (!/^[a-zA-Z0-9_-]+$/.test(id))
		throw new Error('Enter a FastHook identifier from the dashboard, not a URL.');
	return id;
}

export async function list(
	request: Request,
	path: string,
	query: IDataObject,
	limit: number,
): Promise<IDataObject[]> {
	const output: IDataObject[] = [];
	const cursors = new Set<string>();
	let cursor: string | undefined;
	for (let pageNumber = 0; pageNumber < 100; pageNumber++) {
		const page = await request('GET', path, {
			...query,
			limit: Math.min(100, limit - output.length),
			...(cursor ? { cursor } : {}),
		});
		if (page.partial === true)
			throw new Error(
				'FastHook returned an incomplete page. No polling checkpoint was advanced. Try again later.',
			);
		if (
			!Array.isArray(page.models) ||
			page.models.some((row) => !row || typeof row !== 'object' || Array.isArray(row))
		)
			throw new Error('FastHook returned an invalid list response.');
		output.push(...(page.models as IDataObject[]));
		const next =
			page.next_cursor ?? page.next ?? (page.pagination as IDataObject | undefined)?.next;
		if (!next || output.length >= limit) return output.slice(0, limit);
		if (typeof next !== 'string' || cursors.has(next))
			throw new Error('FastHook returned an invalid or repeated pagination cursor.');
		cursors.add(next);
		cursor = next;
	}
	throw new Error(
		'More than 100 pages matched. Narrow the time range or source, or poll more frequently.',
	);
}

export function operationError(
	context: Context,
	error: unknown,
	itemIndex?: number,
): NodeOperationError | NodeApiError {
	return error instanceof NodeApiError || error instanceof NodeOperationError
		? error
		: new NodeOperationError(context.getNode(), error as Error, { itemIndex });
}
