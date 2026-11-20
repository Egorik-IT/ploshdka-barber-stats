export async function fetchApi(path, options = {}) {
    const headers = new Headers(options.headers);
    if (!['GET', 'HEAD', 'OPTIONS'].includes((options.method || 'GET').toUpperCase())) headers.set('X-App-Request', '1');
    const response = await fetch(path, { credentials: 'include', ...options, headers });
    if (response.status === 401 && path !== '/api/auth/login') {
        window.dispatchEvent(new Event('session-expired'));
    }
    return response;
}

export async function readJsonResponse(response, {
    invalidJsonMessage = 'Сервер вернул не JSON. Проверь API и маршруты backend.',
    errorMessage = 'Ошибка запроса к серверу',
} = {}) {
    const contentType = response.headers.get('content-type') || '';

    if (!contentType.includes('application/json')) {
        throw new Error(invalidJsonMessage);
    }

    const result = await response.json();

    if (!response.ok) {
        throw new Error(result.message || errorMessage);
    }

    return result;
}
