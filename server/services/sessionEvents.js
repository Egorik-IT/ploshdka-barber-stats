const connections = new Map();

export function watchSession(userId, response) {
    const key = String(userId);
    if (!connections.has(key)) connections.set(key, new Set());
    connections.get(key).add(response);
    response.on('close', () => {
        connections.get(key)?.delete(response);
        if (!connections.get(key)?.size) connections.delete(key);
    });
}

export function notifyAccountBlocked(userId) {
    for (const response of connections.get(String(userId)) || []) {
        response.write('event: blocked\ndata: {}\n\n');
        response.end();
    }
}
