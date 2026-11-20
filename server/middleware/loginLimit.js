// Ограничение действует в одном процессе. Для нескольких серверов нужно общее хранилище.
export function createLoginLimit({ now = Date.now, windowMs = 15 * 60 * 1000 } = {}) {
    const attempts = new Map();
    return (req, res, next) => {
        const time = now();
        for (const [key, entry] of attempts) if (entry.expires <= time) attempts.delete(key);
        const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase().slice(0, 150) : '';
        const keys = [[`ip:${req.ip}`, 100], [`login:${req.ip}:${username}`, 10]];
        if (attempts.size >= 10000 && keys.some(([key]) => !attempts.has(key))) {
            return res.status(429).json({ message: 'Слишком много попыток входа. Повторите позже.' });
        }
        for (const [key, maximum] of keys) {
            const entry = attempts.get(key);
            if (entry?.count >= maximum) {
                res.setHeader('Retry-After', Math.ceil((entry.expires - time) / 1000));
                return res.status(429).json({ message: 'Слишком много попыток входа. Повторите позже.' });
            }
        }
        for (const [key] of keys) {
            const entry = attempts.get(key) || { count: 0, expires: time + windowMs };
            entry.count++;
            attempts.set(key, entry);
        }
        next();
    };
}
