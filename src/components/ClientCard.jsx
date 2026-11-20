import ClientVisitHistory from './ClientVisitHistory';
import useViewMode from '../hooks/useViewMode';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fetchApi, readJsonResponse } from '../utils/api';
import { isHttpUrl } from '../../shared/validation';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
import useScrollLock from '../hooks/useScrollLock';

const labels = { phone: 'Телефон', email: 'Email', comment: 'Комментарий', birth_date: 'Дата рождения', sex: 'Пол', visits: 'Посещений', spent: 'Продано, ₽', paid: 'Оплачено, ₽', balance: 'Баланс, ₽', discount: 'Скидка, %', card: 'Номер карты', importance: 'Класс важности', last_change_date: 'Обновлено в YCLIENTS' };
export default function ClientCard({ branchId, person, onClose }) {
    useScrollLock();
    const { mode } = useViewMode();
    const [showHistory, setShowHistory] = useState(false);
    const dialog = useRef(null);
    const titleId = useId();
    const [attempt, setAttempt] = useState(0);
    const [card, setCard] = useState(null);
    const [url, setUrl] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const [failed, setFailed] = useState('');
    const { confirmLeave } = useUnsavedChanges({ isDirty: Boolean(card) && url !== card.customPhotoUrl });
    async function close() { if (!saving && await confirmLeave()) onClose(); }
    const path = `/api/clients/${person.id}/card?branchId=${branchId}`;
    useLayoutEffect(() => {
        const node = dialog.current;
        const previous = document.activeElement;
        node.showModal();
        return () => {
            node.close();
            if (previous?.isConnected) previous.focus({ preventScroll: true });
        };
    }, []);
    useEffect(() => {
        const controller = new AbortController();
        fetchApi(path, { signal: controller.signal }).then(readJsonResponse).then(data => {
            if (!controller.signal.aborted) { setCard(data); setUrl(data.customPhotoUrl); }
        }).catch(err => { if (!controller.signal.aborted) setError(err.message); });
        return () => controller.abort();
    }, [path, attempt]);
    async function save(event) {
        event.preventDefault(); setSaving(true); setError('');
        try {
            const result = await readJsonResponse(await fetchApi(path, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photoUrl: url }) }));
            setCard(current => ({ ...current, ...result })); setUrl(result.customPhotoUrl);
        } catch (err) { setError(err.message); } finally { setSaving(false); }
    }
    const image = url.trim() || card?.data.avatar_big || card?.data.avatar || card?.data.photo || '';
    return createPortal(<dialog ref={dialog} className="client-card" aria-labelledby={titleId} onClick={event => {
        if (event.target !== dialog.current) return;
        const rect = dialog.current.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) void close();
    }} onCancel={event => { event.preventDefault(); void close(); }}>
        <button className="client-card-close" onClick={close} disabled={saving}>Закрыть</button>
        <h2 id={titleId}>{person.displayName || [person.surname, person.name, person.patronymic].filter(Boolean).join(' ') || 'Клиент без имени'}</h2>
        {error && <p role="alert">{error}</p>}
        {!card ? error ? <button onClick={() => { setError(''); setAttempt(value => value + 1); }}>Повторить загрузку</button> : <p>Загрузка карточки…</p> : <>
            {card.warning && <p role="status">{card.warning}</p>}
            <div className="client-card-photo">{isHttpUrl(image) && failed !== image
                ? <img src={image} alt="Фото клиента" onError={() => setFailed(image)} /> : <span>Фото не загружено</span>}</div>
            <form onSubmit={save}><label>Ссылка на фото<input type="url" maxLength={2048} value={url} onChange={event => setUrl(event.target.value)} disabled={saving} /></label>
                <p>Пустое поле — использовать фото из YCLIENTS, если оно доступно.</p>
                <button disabled={saving || url === card.customPhotoUrl}>{saving ? 'Сохранение…' : 'Сохранить фото'}</button></form>
            <dl>{Object.entries(labels).filter(([key]) => mode !== 'barber' || !['spent', 'paid', 'balance', 'discount', 'card'].includes(key)).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{card.data[key] ?? '—'}</dd></div>)}</dl>
            {card.data.categories?.length > 0 && <p>Категории: {card.data.categories.map(item => item.title).join(', ')}</p>}
            <h3>История посещений</h3>
            <button onClick={() => setShowHistory(value => !value)}>{showHistory ? 'Свернуть историю' : 'Показать историю'}</button>
            {showHistory && <ClientVisitHistory branchId={branchId} clientId={person.id} />}
            {Object.entries(card.data.custom_fields || {}).map(([key, value]) => <p key={key}>{key}: {typeof value === 'object' ? JSON.stringify(value) : String(value)}</p>)}
        </>}
    </dialog>, document.body);
}
