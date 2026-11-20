import { AsyncLocalStorage } from 'node:async_hooks';

const context = new AsyncLocalStorage();
export function recordFreshness(updatedAt, cached = false) {
    const state = context.getStore();
    if (!state) return;
    const time = new Date(updatedAt).getTime();
    if (Number.isFinite(time)) state.oldest = Math.min(state.oldest, time);
    state.cached ||= cached;
}
export function reportFreshness(req, res, next) {
    context.run({ oldest: Infinity, cached: false }, () => {
        const state = context.getStore();
        const send = res.json.bind(res);
        res.json = body => send(body && typeof body === 'object' ? { ...body,
            dataUpdatedAt: Number.isFinite(state.oldest) ? new Date(state.oldest).toISOString() : null,
            fromCache: state.cached } : body);
        next();
    });
}
