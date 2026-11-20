import { useEffect } from 'react';
import { fetchApi } from '../utils/api';

export default function useSessionStatus(user, onExpired, onUpdated) {
    const userId = user?.id;
    useEffect(() => {
        if (!userId) return;
        const controller = new AbortController();
        const events = new EventSource('/api/auth/events', { withCredentials: true });
        const check = () => {
            void fetchApi('/api/auth/me', { signal: controller.signal }).then(async response => {
                if (response.ok && onUpdated) {
                    const data = await response.json();
                    if (!controller.signal.aborted) onUpdated(current => current?.id === data.user.id ? data.user : current);
                }
            }).catch(() => {});
        };
        events.addEventListener('blocked', onExpired);
        events.addEventListener('error', check);
        window.addEventListener('session-expired', onExpired);
        window.addEventListener('focus', check);
        const timer = setInterval(check, 30000);
        return () => {
            controller.abort(); events.close(); clearInterval(timer);
            window.removeEventListener('session-expired', onExpired);
            window.removeEventListener('focus', check);
        };
    }, [userId, onExpired, onUpdated]);
}
