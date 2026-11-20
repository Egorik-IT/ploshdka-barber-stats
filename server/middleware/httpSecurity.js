export function httpSecurity(config) {
    return (req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('X-Frame-Options', 'DENY');
        if (config.production) {
            res.setHeader('Strict-Transport-Security', 'max-age=31536000');
            res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
        }
        if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
        if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
            const origin = req.get('Origin');
            if (req.get('X-App-Request') !== '1' || (origin && !config.origins.includes(origin))) {
                return res.status(403).json({ message: 'Недопустимый источник запроса. Обновите страницу.' });
            }
            if (req.headers['content-length'] !== '0' && req.headers['content-length'] && !req.is('application/json')) {
                return res.status(415).json({ message: 'Ожидается JSON' });
            }
        }
        next();
    };
}
