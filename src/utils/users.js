export { roleNames } from '../../shared/users.js';

export function getInitials(name, fallback = '?') {
    return (name || '')
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map(word => word[0])
        .join('')
        .toUpperCase() || fallback;
}
