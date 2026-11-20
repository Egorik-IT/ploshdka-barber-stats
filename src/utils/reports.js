import { fetchApi, readJsonResponse } from './api';

function waitForNextCheck(signal) {
    return new Promise(resolve => {
        const finish = () => {
            clearTimeout(timer);
            signal.removeEventListener('abort', finish);
            resolve();
        };
        const timer = setTimeout(finish, 3000);
        signal.addEventListener('abort', finish, { once: true });
        if (signal.aborted) finish();
    });
}

export async function loadReport(path, signal, onProgress) {
    while (!signal.aborted) {
        const data = await fetchApi(path, { signal }).then(readJsonResponse);
        signal.throwIfAborted();
        if (!data.pending) return data;
        onProgress(data.progress);
        await waitForNextCheck(signal);
    }
    signal.throwIfAborted();
}
