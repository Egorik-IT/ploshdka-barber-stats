import ReportFreshness from '../components/ReportFreshness';
import { useEffect, useRef, useState } from 'react';
import { fetchApi, readJsonResponse } from '../utils/api';
import usePeriod from '../hooks/usePeriod';
import useViewMode from '../hooks/useViewMode';
import PeriodFields from '../components/PeriodFields';
import EmployeeStatistics from '../components/EmployeeStatistics';
import EmployeeRanking from '../components/EmployeeRanking';
import { loadReport } from '../utils/reports';
import '../styles/reports.css';

export default function StatisticsPage() {
    const { mode } = useViewMode();
    const period = usePeriod();
    const request = useRef(null);
    const [users, setUsers] = useState([]);
    const [currentUser, setCurrentUser] = useState(null);
    const [tab, setTab] = useState('employee');
    const [userId, setUserId] = useState('');
    const [result, setResult] = useState(null);
    const [progress, setProgress] = useState([]);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        const controller = new AbortController();
        Promise.all(['/api/reports/employees', '/api/auth/me'].map(path =>
            fetchApi(path, { signal: controller.signal }).then(readJsonResponse)))
            .then(([employees, auth]) => {
                if (!controller.signal.aborted) { setUsers(employees.users); setCurrentUser(auth.user); }
            })
            .catch(error => { if (!controller.signal.aborted) setError(error.message); });
        return () => { controller.abort(); request.current?.abort(); };
    }, []);

    function changeTab(next) {
        request.current?.abort();
        setTab(next); setBusy(false); setResult(null); setProgress([]); setError('');
    }
    async function load() {
        request.current?.abort();
        const controller = new AbortController();
        request.current = controller;
        setBusy(true); setError(''); setResult(null); setProgress([]);
        try {
            const query = { ...period.dates, userId:mode === 'barber' ? currentUser?.id : userId, statistics:'true', view:mode };
            if (tab === 'employee' && !query.userId) throw new Error('Выберите сотрудника');
            const path = '/api/reports/' + (tab === 'ranking' ? 'ranking' : 'employee') + '?' + new URLSearchParams(query);
            const data = await loadReport(path, controller.signal, setProgress);
            if (!controller.signal.aborted) setResult({ ...data, query, tab });
        } catch (error) {
            if (!controller.signal.aborted) setError(error.message);
        } finally {
            if (!controller.signal.aborted) setBusy(false);
        }
    }
    return <div className="report-content">
        <header className="report-heading"><h1>Статистика сотрудников</h1><p>Клиенты, услуги, рабочие часы и косметика</p></header>
        {mode !== 'barber' && <div className="report-tabs">
            <button aria-pressed={tab === 'employee'} onClick={() => changeTab('employee')}>Сотрудник</button>
            <button aria-pressed={tab === 'ranking'} onClick={() => changeTab('ranking')}>Рейтинг</button>
        </div>}
        <div className="report-filters statistics-filters">
            {mode !== 'barber' && tab === 'employee' && <label>Сотрудник
                <select value={userId} onChange={event => setUserId(event.target.value)}>
                    <option value="">Выберите сотрудника</option>
                    {users.filter(user => user.role !== 'developer').map(user => <option key={user.id} value={user.id}>{user.displayName}</option>)}
                </select>
            </label>}
            <PeriodFields {...period}/>
        </div>
        <button disabled={busy || period.invalidDates} onClick={load}>{busy ? 'Загрузка…' : 'Показать'}</button>
        {busy && <p role="status">Первая загрузка истории сотрудника может занять несколько минут. Повторные отчёты используют кэш.
            {progress.map((branch, index) => <span className="history-progress" key={branch.branch + index}>
                {branch.branch}: {branch.count.toLocaleString('ru-RU')} записей{branch.status === 'done' ? ' — готово' : ''}
            </span>)}
        </p>}
        {error && <p className="report-error" role="alert">{error}</p>}
        {result && <p className="report-note">{result.employeeName && <strong>{result.employeeName} · </strong>}Период отчёта: {result.query.start} — {result.query.end}</p>}
 <ReportFreshness report={result} />
        {result?.tab === 'employee' && <EmployeeStatistics result={result}/>}
        {result?.tab === 'ranking' && <EmployeeRanking result={result} mode={mode}/>}
    </div>;
}
