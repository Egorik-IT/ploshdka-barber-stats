export function isPositiveIntegerString(value) {
    return typeof value === 'string' && /^[1-9]\d*$/.test(value);
}

export function isHttpUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}
