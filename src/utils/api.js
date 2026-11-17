export function fetchApi(path, options = {}) {
    return fetch(path, { credentials: 'include', ...options });
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
