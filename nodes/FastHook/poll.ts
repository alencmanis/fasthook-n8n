import type { IDataObject } from 'n8n-workflow';
import { list } from './transport';
import type { Request } from './transport';

export interface Checkpoint {
	fingerprint: string;
	start: number;
	until: number;
	seen: Record<string, number>;
}
const overlap = 5 * 60 * 1000;

export async function pollRequests(
	request: Request,
	checkpoint: Checkpoint | undefined,
	fingerprint: string,
	sourceId: string,
	manual: boolean,
	now: number,
): Promise<{ rows: IDataObject[]; checkpoint?: Checkpoint }> {
	const query: IDataObject = {
		status: 'accepted',
		include: 'data',
		...(sourceId ? { source_id: sourceId } : {}),
	};
	if (manual)
		return {
			rows: await list(
				request,
				'/requests',
				{ ...query, from: new Date(now - 86400000).toISOString(), to: new Date(now).toISOString() },
				1,
			),
		};
	if (!checkpoint || checkpoint.fingerprint !== fingerprint) {
		// Authenticate before considering the first poll successful, without emitting history.
		await list(
			request,
			'/requests',
			{ ...query, from: new Date(now - 1000).toISOString(), to: new Date(now).toISOString() },
			1,
		);
		return { rows: [], checkpoint: { fingerprint, start: now, until: now, seen: {} } };
	}
	const from = Math.max(checkpoint.start, checkpoint.until - overlap);
	const until = Math.max(now, checkpoint.until);
	const rows = await list(
		request,
		'/requests',
		{ ...query, from: new Date(from).toISOString(), to: new Date(until).toISOString() },
		Infinity,
	);
	const seen: Record<string, number> = {};
	for (const [id, time] of Object.entries(checkpoint.seen))
		if (time >= until - overlap) seen[id] = time;
	const fresh: IDataObject[] = [];
	for (const row of rows) {
		if (
			typeof row.id !== 'string' ||
			typeof row.ingested_at !== 'string' ||
			!Number.isFinite(Date.parse(row.ingested_at))
		)
			throw new Error('FastHook returned a request without a valid ID or ingestion time.');
		const time = Date.parse(row.ingested_at);
		if (time < checkpoint.start || time > until) continue;
		if (checkpoint.seen[row.id] === undefined && seen[row.id] === undefined) fresh.push(row);
		seen[row.id] = time;
	}
	fresh.sort(
		(a, b) =>
			Date.parse(a.ingested_at as string) - Date.parse(b.ingested_at as string) ||
			String(a.id).localeCompare(String(b.id)),
	);
	return { rows: fresh, checkpoint: { fingerprint, start: checkpoint.start, until, seen } };
}
