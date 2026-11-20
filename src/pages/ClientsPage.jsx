import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { fetchApi, readJsonResponse } from '../utils/api';
import '../styles/reports.css';
import './ClientsPage.css';
import ClientCard from '../components/ClientCard';
import useViewMode, { canPreviewPage } from '../hooks/useViewMode';

function BranchClients({ branch, search, incomplete }) {
    const [selected, setSelected] = useState(null);
    const [open, setOpen] = useState(Boolean(search));
    const [page, setPage] = useState(1);
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [retry, setRetry] = useState(0);
    const expanded = open;
    useEffect(() => {
        const controller = new AbortController();
        async function load() {
            setLoading(true);
            setError('');
            const query = new URLSearchParams({ branchId: branch.id, search, page, incomplete, countOnly: !expanded });
            await fetchApi(`/api/clients?${query}`, { signal: controller.signal })
                .then(readJsonResponse)
                .then(data => { if (!controller.signal.aborted) setResult(data); })
                .catch(err => { if (!controller.signal.aborted) setError(err.message); })
                .finally(() => { if (!controller.signal.aborted) setLoading(false); });
        }
        void load();
        return () => controller.abort();
    }, [branch.id, branch.directorySyncedAt, expanded, search, page, retry, incomplete]);

    return <section className="report-card clients-branch">
        <button className="clients-branch-toggle" onClick={() => setOpen(value => !value)}
            aria-expanded={expanded} aria-controls={`clients-${branch.id}`}>
            {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            <strong>{branch.name}</strong><span>{error ? '—' : result?.total ?? '…'}</span>
        </button>
        {expanded && <div id={`clients-${branch.id}`}>
            <p>{branch.directorySyncedAt
                ? `Обновлено: ${new Date(branch.directorySyncedAt).toLocaleString('ru-RU')}`
                : 'Клиенты ещё не загружены. Запустите синхронизацию в разделе «Филиалы».'}</p>
            {loading ? <p role="status">Загрузка клиентов…</p>
                : error ? <div className="report-error" role="alert">{error} <button onClick={() => setRetry(value => value + 1)}>Повторить</button></div>
                    : result?.clients.length ? <>
                        <div className="clients-table-wrap"><table className="clients-table">
                            <thead><tr><th>Клиент</th><th>Телефон</th></tr></thead>
                            <tbody>{result.clients.map(person => <tr key={person.id}>
                                <td><button className="client-name-button" onClick={() => setSelected(person)}>{incomplete ? 'Без имени' : person.displayName || [person.surname, person.name, person.patronymic].filter(Boolean).join(' ') || 'Без имени'}</button></td>
                                <td>{person.phone || '—'}</td>

                            </tr>)}</tbody>
                        </table></div>
                    </> : <p>{search ? 'По вашему запросу клиентов не найдено.' : 'Список клиентов пуст.'}</p>}
            {result && !error && <div className="clients-pagination">
                <button disabled={loading || page === 1} onClick={() => setPage(value => value - 1)}>Назад</button>
                <span>Страница {page} · Найдено: {result.total}</span>
                <button disabled={loading || page * result.pageSize >= result.total} onClick={() => setPage(value => value + 1)}>Далее</button>
            </div>}
        </div>}
        {selected && <ClientCard branchId={branch.id} person={selected} onClose={() => setSelected(null)} />}
    </section>;
}

export default function ClientsPage() {
    const { mode } = useViewMode();
    const [incomplete, setIncomplete] = useState(false);
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [retry, setRetry] = useState(0);
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
        return () => clearTimeout(timer);
    }, [search]);
    useEffect(() => {
        const controller = new AbortController();
        async function load() {
            setLoading(true);
            setError('');
            await fetchApi('/api/branches', { signal: controller.signal }).then(readJsonResponse)
                .then(data => { if (!controller.signal.aborted) setBranches(data.branches.filter(branch => branch.isActive)); })
                .catch(err => { if (!controller.signal.aborted) setError(err.message); })
                .finally(() => { if (!controller.signal.aborted) setLoading(false); });
        }
        void load();
        return () => controller.abort();
    }, [retry]);
    return <div className="report-content">
        <header className="report-heading"><h1>Клиенты</h1><p>Клиенты барбершопа по филиалам</p></header>
        <div className="report-tabs clients-tabs"><button onClick={() => setIncomplete(false)} aria-pressed={!incomplete}>Клиенты</button><button onClick={() => setIncomplete(true)} aria-pressed={incomplete}>Неполные клиенты</button></div>
        <div className="report-filters clients-filters">
            <label>Поиск по имени, телефону, email или комментарию<input value={search} maxLength={150}
                onChange={event => setSearch(event.target.value)} placeholder="Найти клиента" type="search" /></label>
            {canPreviewPage(mode, '/branches') && <Link className="clients-sync-link" to="/branches"><RefreshCw size={16} aria-hidden="true" />Синхронизация филиалов</Link>}
        </div>
        {loading ? <p role="status">Загрузка филиалов…</p> : error
            ? <div className="report-error" role="alert">{error} <button onClick={() => setRetry(value => value + 1)}>Повторить</button></div>
            : branches.length ? branches.map(branch => <BranchClients key={`${branch.id}:${debouncedSearch}:${incomplete}`} branch={branch} search={debouncedSearch} incomplete={incomplete} />)
                : <p className="report-note">Нет активных филиалов. Добавьте филиал и выполните синхронизацию.</p>}
    </div>;
}
