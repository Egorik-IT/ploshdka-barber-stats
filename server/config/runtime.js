export function runtimeConfig(env = process.env) {
    const production = env.NODE_ENV === 'production';
    const origins = (env.APP_ORIGINS || (production ? '' : 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:3001,http://127.0.0.1:3001')).split(',').map(value => value.trim()).filter(Boolean);
    if (!origins.length || origins.some(origin => {
        try { const url = new URL(origin); return url.origin !== origin || !['http:', 'https:'].includes(url.protocol) || (production && url.protocol !== 'https:'); }
        catch { return true; }
    })) throw new Error('APP_ORIGINS должен содержать точные адреса сайта (в production только HTTPS)');
    if (production && (env.SESSION_SECRET || '').length < 32) throw new Error('SESSION_SECRET должен содержать не менее 32 символов');
    return { production, origins, port: Number(env.PORT || 3001), host: env.HOST || '127.0.0.1', trustProxy: env.TRUST_PROXY || false };
}

export const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' });
