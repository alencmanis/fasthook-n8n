const { test } = require('node:test');
const assert = require('node:assert/strict');
const { list, identifier, transport } = require('../dist/nodes/FastHook/transport');
const { pollRequests } = require('../dist/nodes/FastHook/poll');
const { FastHook } = require('../dist/nodes/FastHook/FastHook.node');
const { FastHookTrigger } = require('../dist/nodes/FastHook/FastHookTrigger.node');
const { FastHookApi } = require('../dist/credentials/FastHookApi.credentials');
const now = Date.parse('2026-10-29T12:00:00Z');
const row = (id, time) => ({
	id,
	ingested_at: new Date(time).toISOString(),
	data: { hello: 'world' },
});
const page = (models, next = null) => ({ models, next_cursor: next });
const state = () => ({ fingerprint: 'a', start: now - 60000, until: now - 30000, seen: {} });
const node = {
	name: 'FastHook',
	type: 'fastHook',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

test('pagination carries fixed filters and caps requested/output count', async () => {
	const queries = [];
	const rows = await list(
		async (method, path, qs) => {
			queries.push(qs);
			return queries.length === 1 ? page([{ id: 'a' }], 'c1') : page([{ id: 'b' }, { id: 'c' }]);
		},
		'/requests',
		{ from: 'fixed', source_id: 'src_a' },
		2,
	);
	assert.deepEqual(rows, [{ id: 'a' }, { id: 'b' }]);
	assert.deepEqual(queries[1], { from: 'fixed', source_id: 'src_a', limit: 1, cursor: 'c1' });
});
test('attempt pagination uses pagination.next', async () => {
	let calls = 0;
	const rows = await list(
		async () => ({ models: [{ id: ++calls }], pagination: { next: calls === 1 ? 'c' : null } }),
		'/attempts',
		{},
		Infinity,
	);
	assert.equal(rows.length, 2);
});
test('incomplete pages fail instead of silently returning partial data', async () => {
	await assert.rejects(
		list(async () => ({ ...page([]), partial: true }), '/requests', {}, Infinity),
		/incomplete/,
	);
});
test('repeated pagination cursor fails', async () => {
	await assert.rejects(
		list(async () => page([], 'loop'), '/requests', {}, Infinity),
		/repeated/,
	);
});
test('pagination overflow fails rather than dropping data', async () => {
	let count = 0;
	await assert.rejects(
		list(async () => page([], String(++count)), '/requests', {}, Infinity),
		/100 pages/,
	);
	assert.equal(count, 100);
});
test('malformed page fails', async () => {
	await assert.rejects(
		list(async () => ({ models: null }), '/requests', {}, 1),
		/invalid/,
	);
});
test('first poll validates credentials and emits no history', async () => {
	let calls = 0;
	const r = await pollRequests(
		async () => {
			calls++;
			return page([row('req_old', now - 1000)]);
		},
		undefined,
		'a',
		'',
		false,
		now,
	);
	assert.equal(calls, 1);
	assert.deepEqual(r.rows, []);
	assert.equal(r.checkpoint.start, now);
});
test('initial auth failure does not initialize checkpoint', async () => {
	await assert.rejects(
		pollRequests(
			async () => {
				throw new Error('401');
			},
			undefined,
			'a',
			'',
			false,
			now,
		),
		/401/,
	);
});
test('manual test returns real payload and never mutates saved state', async () => {
	const s = state(),
		before = structuredClone(s);
	const r = await pollRequests(
		async () => page([row('req_real', now - 1000)]),
		s,
		'a',
		'',
		true,
		now,
	);
	assert.equal(r.rows[0].id, 'req_real');
	assert.equal(r.checkpoint, undefined);
	assert.deepEqual(s, before);
});
test('poll orders pages oldest first, ignores duplicates and catches late requests', async () => {
	const s = state();
	s.seen.req_seen = now - 20000;
	let n = 0;
	const r = await pollRequests(
		async () =>
			++n === 1
				? page([row('req_new', now - 1000), row('req_seen', now - 20000)], 'next')
				: page([row('req_late', now - 40000), row('req_new', now - 1000)]),
		s,
		'a',
		'src_one',
		false,
		now,
	);
	assert.deepEqual(
		r.rows.map((x) => x.id),
		['req_late', 'req_new'],
	);
	const second = await pollRequests(
		async () => page(r.rows),
		r.checkpoint,
		'a',
		'src_one',
		false,
		now + 1000,
	);
	assert.deepEqual(second.rows, []);
});
test('poll failure on second page leaves existing checkpoint unchanged', async () => {
	const s = state(),
		before = structuredClone(s);
	let n = 0;
	await assert.rejects(
		pollRequests(
			async () => (++n === 1 ? page([row('req_a', now)], 'next') : { ...page([]), partial: true }),
			s,
			'a',
			'',
			false,
			now,
		),
		/incomplete/,
	);
	assert.deepEqual(s, before);
});
test('changing source or credential restarts without historical burst', async () => {
	const r = await pollRequests(
		async () => page([row('req_a', now - 1000)]),
		state(),
		'b',
		'src_new',
		false,
		now,
	);
	assert.deepEqual(r.rows, []);
	assert.equal(r.checkpoint.fingerprint, 'b');
});
test('invalid ingestion time does not advance state', async () => {
	await assert.rejects(
		pollRequests(
			async () => page([{ id: 'a', ingested_at: 'invalid' }]),
			state(),
			'a',
			'',
			false,
			now,
		),
		/ingestion/,
	);
});
test('IDs cannot change the API route', () => {
	assert.equal(identifier(' req_123 '), 'req_123');
	for (const id of ['', '../sources', 'https://evil.example', 'req_1?token=x', 'x%2Fy'])
		assert.throws(() => identifier(id));
});
function ctx(params, count = 1) {
	const calls = [];
	return {
		calls,
		getNode: () => node,
		getInputData: () => Array.from({ length: count }, () => ({ json: {} })),
		getNodeParameter: (key, i) =>
			typeof params[key] === 'function' ? params[key](i) : params[key],
		continueOnFail: () => false,
		helpers: {
			httpRequestWithAuthentication: async (auth, options) => {
				calls.push({ auth, ...options });
				return { ok: true };
			},
		},
	};
}
test('all ten operations map to exact allowed endpoints', async () => {
	for (const [resource, operation, method, suffix] of [
		['request', 'get', 'GET', ''],
		['request', 'trace', 'GET', '/trace'],
		['request', 'replay', 'POST', '/retry'],
		['event', 'get', 'GET', ''],
		['event', 'retry', 'POST', '/retry'],
		['attempt', 'get', 'GET', ''],
		['source', 'run', 'POST', '/run'],
	]) {
		const c = ctx({ resource, operation, resourceId: 'id_123' });
		await new FastHook().execute.call(c);
		assert.equal(c.calls[0].url, `https://api.fasthook.io/v1/${resource}s/id_123${suffix}`);
		assert.equal(c.calls[0].method, method);
		assert.deepEqual(c.calls[0].body, operation === 'replay' ? {} : undefined);
	}
	for (const resource of ['request', 'event', 'attempt']) {
		const c = ctx({
			resource,
			operation: 'getMany',
			from: '2026-10-28T00:00:00Z',
			to: '2026-10-29T00:00:00Z',
			filters: {},
			returnAll: false,
			limit: 1,
		});
		c.helpers.httpRequestWithAuthentication = async (_, options) => {
			c.calls.push(options);
			return page([{ id: 'found' }]);
		};
		const r = await new FastHook().execute.call(c);
		assert.equal(c.calls[0].url, `https://api.fasthook.io/v1/${resource}s`);
		assert.equal(r[0][0].json.id, 'found');
	}
});
test('per-input expressions and item linking are preserved', async () => {
	const c = ctx({ resource: 'request', operation: 'get', resourceId: (i) => `req_${i}` }, 2);
	const r = await new FastHook().execute.call(c);
	assert.equal(c.calls[1].url.endsWith('/req_1'), true);
	assert.deepEqual(r[0][1].pairedItem, { item: 1 });
});
test('transport prevents redirects and sanitizes errors without repeating writes', async () => {
	const c = ctx({});
	let calls = 0;
	c.helpers.httpRequestWithAuthentication = async (_, options) => {
		calls++;
		assert.equal(options.disableFollowRedirect, true);
		throw { statusCode: 403, message: 'SECRET', request: { headers: { authorization: 'SECRET' } } };
	};
	await assert.rejects(
		transport(c)('POST', '/requests/req_a/retry', {}, {}),
		(e) => !JSON.stringify(e).includes('SECRET') && e.message.includes('403'),
	);
	assert.equal(calls, 1);
});
test('continue-on-fail returns a sanitized linked error', async () => {
	const c = ctx({ resource: 'request', operation: 'get', resourceId: 'req_a' });
	c.continueOnFail = () => true;
	c.helpers.httpRequestWithAuthentication = async () => {
		throw { statusCode: 401, message: 'SECRET' };
	};
	const r = await new FastHook().execute.call(c);
	assert.match(r[0][0].json.error, /401/);
	assert.deepEqual(r[0][0].pairedItem, { item: 0 });
});
test('credentials are password fields, read-only test and matching node references', () => {
	const credential = new FastHookApi();
	assert.equal(credential.properties[0].typeOptions.password, true);
	assert.equal(credential.test.request.method, 'GET');
	for (const n of [new FastHook(), new FastHookTrigger()])
		assert.equal(n.description.credentials[0].name, credential.name);
});
