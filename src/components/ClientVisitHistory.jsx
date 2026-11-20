import { useEffect, useState } from 'react';
import { fetchApi, readJsonResponse } from '../utils/api';
import money from '../utils/formatMoney';
import useViewMode from '../hooks/useViewMode';

export default function ClientVisitHistory({ branchId, clientId }) {
    const { mode } = useViewMode();
    const [result, setResult] = useState(null), [error, setError] = useState(''), [page, setPage] = useState(1);
    useEffect(() => {
        const controller = new AbortController();
        fetchApi(`/api/clients/${clientId}/history?branchId=${branchId}`, { signal: controller.signal }).then(readJsonResponse)
            .then(data => { if (!controller.signal.aborted) setResult(data); })
            .catch(err => { if (!controller.signal.aborted) setError(err.message); });
        return () => controller.abort();
    }, [branchId, clientId]);
    if (error) return <p className="report-error" role="alert">{error}</p>;
    if (!result) return <p role="status">Загрузка истории посещений…</p>;
    return <section className="client-history"><p className="report-note">Выполненные визиты. Связь между филиалами — по телефону.</p>
        {!result.visits.length ? <p>Посещений не найдено.</p> : result.visits.slice(0, page * 20).map(visit => <article key={visit.id}>
            <strong>{visit.date.replace('T', ' ').slice(0, 16)}</strong><span>{visit.branchName} · {visit.staffName}</span>
            <span>{visit.services.join(', ') || 'Услуги не указаны'}</span>{mode !== 'barber' && <span>{money(visit.amount)}</span>}
        </article>)}
        {result.visits.length > page * 20 && <button onClick={() => setPage(value => value + 1)}>Показать ещё</button>}
    </section>;
}
