import { setTimeout as delay } from 'node:timers/promises';

export function integrationError(message, status = 502) {
    return Object.assign(new Error(message), { status });
}

// Общая очередь для запросов всех филиалов в одном процессе сервера.
let queue = Promise.resolve();
let queued = 0;
export function requestYclients(path, body, shape = 'array') {
    if (queued >= 60) return Promise.reject(integrationError('Очередь YCLIENTS занята. Повторите запрос позже.', 503));
    queued++;
    const enqueuedAt = Date.now();
    const task = queue.then(async () => {
        if (Date.now() - enqueuedAt > 120000) throw integrationError('Истекло время ожидания YCLIENTS. Повторите запрос.', 503);
        const partner = process.env.YCLIENTS_PARTNER_TOKEN;
        const user = process.env.YCLIENTS_USER_TOKEN;
        if (!partner || !user) throw integrationError('Не настроены токены YCLIENTS', 503);
        try {
            let response;
            for (let attempt = 0; attempt < 3; attempt++) {
            response = await fetch(`https://api.yclients.com/api/v1${path}`, {
                method: body ? 'POST' : 'GET',
                headers: {
                    Accept: 'application/vnd.yclients.v2+json',
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${partner}, User ${user}`,
                },
                body: body ? JSON.stringify(body) : undefined,
                signal: AbortSignal.timeout(20000),
            });
            if (![429, 502, 503, 504].includes(response.status) || attempt === 2) break;
            const retryAfter = response.headers.get('retry-after');
            const seconds = Number(retryAfter);
            const wait = retryAfter && Number.isFinite(seconds) ? seconds * 1000 : 1000 * (attempt + 1);
            await response.body?.cancel();
            await delay(Math.max(400, Math.min(wait, 10000)));
            }
            if (!response.ok) throw integrationError(
                `YCLIENTS: HTTP ${response.status}. Проверьте доступ интеграции к данным филиала.`
            );
            const payload = await response.json();
            if (payload?.success !== true || (shape === 'array' ? !Array.isArray(payload.data) : !payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data))) {
                throw integrationError('YCLIENTS вернул неожиданный формат списка');
            }
            return payload;
        } catch (error) {
            if (error.status) throw error;
            throw integrationError('Не удалось прочитать ответ YCLIENTS. Повторите синхронизацию.');
        } finally {
            await delay(400);
        }
    });
    queue = task.catch(() => {});
    return task.finally(() => { queued--; });
}

export async function fetchCollection(requestPage, { paginated = true, onProgress = () => {} } = {}) {
    const items = new Map();
    for (let page = 1; page <= 10000; page++) {
        const { data, meta } = await requestPage(page);
        if (!Array.isArray(data)) throw integrationError('Некорректная коллекция YCLIENTS');
        const before = items.size;
        for (const item of data) {
            const id = String(item?.id ?? item?.good_id ?? '');
            if (!/^[1-9]\d*$/.test(id) || (typeof (item.id ?? item.good_id) === 'number' && !Number.isSafeInteger(item.id ?? item.good_id))) {
                throw integrationError('YCLIENTS вернул некорректный идентификатор');
            }
            items.set(id, { ...item, id });
        }
        onProgress(items.size);
        const total = meta?.total_count == null ? null : Number(meta.total_count);
        if (total !== null && (!Number.isSafeInteger(total) || total < 0)) throw integrationError('Некорректный размер коллекции');
        if (!paginated || !data.length || (total !== null && items.size >= total)) {
            if (total !== null && items.size !== total) throw integrationError('Получен неполный список YCLIENTS. Повторите синхронизацию.');
            return [...items.values()];
        }
        if (items.size === before) throw integrationError('YCLIENTS повторяет страницу. Синхронизация отменена.');
    }
    throw integrationError('Превышен размер выгрузки YCLIENTS');
}
