import { useState } from 'react';
import CalculationFields from './CalculationFields';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
import { fetchApi, readJsonResponse } from '../utils/api';

export default function ApprovedRatesEditor({ employees, network }) {
    const [saved, setSaved] = useState(() => Object.fromEntries(employees.map(user => [user.id, user.approvedRates])));
    const [userId, setUserId] = useState('');
    const [values, setValues] = useState({});
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const employee = employees.find(user => String(user.id) === userId);
    const dirty = Boolean(employee) && JSON.stringify(values) !== JSON.stringify(saved[userId] || {});
    const { confirmLeave } = useUnsavedChanges({ isDirty: dirty });

    async function select(next) {
        if (!await confirmLeave()) return;
        setUserId(next);
        setValues(saved[next] || {});
        setError('');
        setMessage('');
    }

    async function save() {
        setBusy(true); setError(''); setMessage('');
        try {
            const result = await fetchApi(`/api/settings/employees/${userId}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values),
            }).then(readJsonResponse);
            setSaved(current => ({ ...current, [userId]: result }));
            setValues(result);
            setMessage('Ставки сохранены. Новые расчёты и отчёты используют эти значения.');
        } catch (err) { setError(err.message); }
        finally { setBusy(false); }
    }

    return <section className="settings-panel">
        <h2>Утверждённые ставки сотрудников</h2>
        <p className="report-note">Пустое поле — ставка категории. Ноль — явное значение. Эти параметры используются в рейтинге и калькуляторе руководителя.</p>
        <fieldset disabled={busy} className="settings-approved-fields">
            <div className="settings-fields"><label>Сотрудник
                <select value={userId} onChange={event => void select(event.target.value)}>
                    <option value="">Выберите сотрудника</option>
                    {employees.map(user => <option key={user.id} value={user.id}>{user.displayName} · {user.categoryLabel}</option>)}
                </select>
            </label></div>
            {employee && (employee.category ? <>
                <CalculationFields category={employee.category} value={values} onChange={next => { setValues(next); setMessage(''); }} defaults={network[employee.category]} />
                <button type="button" disabled={!dirty} onClick={save}>{busy ? 'Сохранение…' : 'Сохранить ставки'}</button>
            </> : <p>Категория не определена. Проверьте привязку и специализацию в YCLIENTS.</p>)}
        </fieldset>
        {error && <p className="report-error" role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
    </section>;
}
