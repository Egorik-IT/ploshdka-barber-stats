import CalculationFields from '../components/CalculationFields';
import ApprovedRatesEditor from '../components/ApprovedRatesEditor';
import useViewMode from '../hooks/useViewMode';
import SettingsProfile from '../components/SettingsProfile';
import { useEffect, useState } from 'react';
import ThemeToggle from '../components/ThemeToggle';
import { fetchApi, readJsonResponse } from '../utils/api';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
import { calculationCategories } from '../../shared/calculationSettings';
import '../styles/reports.css';
import './SettingsPage.css';

export default function SettingsPage({ theme, toggleTheme }) {
    const { mode } = useViewMode();
    const [data, setData] = useState(null);
    const [saved, setSaved] = useState(null);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    useUnsavedChanges({ isDirty: JSON.stringify(data) !== JSON.stringify(saved) });
    useEffect(() => {
        const controller = new AbortController();
        fetchApi('/api/settings', { signal: controller.signal }).then(readJsonResponse).then(result => {
            if (!controller.signal.aborted) { setData(result); setSaved(result); }
        }).catch(err => { if (!controller.signal.aborted) setError(err.message); });
        return () => controller.abort();
    }, []);
    async function save(scope) {
        setSaving(true); setError(''); setMessage('');
        try {
            const result = await readJsonResponse(await fetchApi(`/api/settings/${scope}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data[scope]) }));
            setData(current => ({ ...current, [scope]: result })); setSaved(current => ({ ...current, [scope]: result })); setMessage('Настройки сохранены');
        } catch (err) { setError(err.message); } finally { setSaving(false); }
    }
    return <div className="report-content">
        <header className="report-heading"><h1>Настройки</h1><p>Оформление приложения и параметры расчётов</p></header>
        <SettingsProfile profile={data?.profile} />
        <section className="settings-panel"><h2>Оформление</h2><div className="settings-theme-row"><span>{theme === 'dark' ? 'Тёмная тема' : 'Светлая тема'}</span><ThemeToggle theme={theme} onToggle={toggleTheme} /></div></section>
        {error && <p className="report-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
        {!data ? <p>Загрузка настроек…</p> : <fieldset disabled={saving} style={{ border: 0, padding: 0, margin: 0 }}>
            {mode !== 'manager' && <section className="settings-panel"><h2>Параметры калькулятора</h2><p className="report-note">Не влияют на рейтинг и утверждённые ставки. Пустое поле — использовать утверждённую ставку сотрудника.</p><CalculationFields category={data.personalCategory} defaults={data.profile?.rates} value={data.personal} onChange={personal => setData(current => ({ ...current, personal }))} /><button onClick={() => save('personal')}>Сохранить личные параметры</button></section>}
            {mode === 'manager' && <section className="settings-panel"><h2>Параметры сети</h2><div className="settings-fields"><label>Срок активности клиента, месяцев<input type="number" min="1" max="120" value={data.network.activeMonths} onChange={event => setData(current => ({ ...current, network: { ...current.network, activeMonths: Number(event.target.value) } }))} /></label></div>{Object.entries(calculationCategories).map(([category, title]) => <div className="settings-category" key={category}><h3>{title}</h3><CalculationFields category={category} value={data.network[category]} onChange={value => setData(current => ({ ...current, network: { ...current.network, [category]: value } }))} /></div>)}<button onClick={() => save('network')}>Сохранить параметры сети</button></section>}
            {mode === 'manager' && <ApprovedRatesEditor employees={data.employees || []} network={saved.network} />}
        </fieldset>}
    </div>;
}
