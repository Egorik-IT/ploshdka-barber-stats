import { fetchApi, readJsonResponse } from '../utils/api';

import { useEffect, useState } from 'react';

import {
    Plus,
    Pencil,
    X,
    Store,
    Copy,
    Check,
    RefreshCw,
} from 'lucide-react';

import './BranchesPage.css';

function emptyForm() {
    return {
        name: '',
        yclientsCompanyId: '',
        isActive: true,
    };
}


function formatSyncDate(value) {
    if (!value) {
        return 'Ещё не выполнялась';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return 'Дата неизвестна';
    }

    return date.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function readApiResponse(response) {
    return readJsonResponse(response, {
        invalidJsonMessage: 'Сервер вернул не JSON. Проверьте подключение API.',
    });
}

async function loadBranches(signal) {
        const response = await fetchApi('/api/branches', {
            signal,
        });

        const result = await readApiResponse(response);

        return result.branches || [];
    }

export default function BranchesPage() {
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [modalOpen, setModalOpen] = useState(false);
    const [editingBranch, setEditingBranch] = useState(null);
    const [form, setForm] = useState(emptyForm);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');

    const [copiedId, setCopiedId] = useState(null);
    const [syncMessage, setSyncMessage] = useState('');
    const [syncingBranchId, setSyncingBranchId] = useState(null);
    const hasRunningSync = branches.some(branch => branch.syncJob?.status === 'running');

    useEffect(() => {
        if (!hasRunningSync) return;
        const controller = new AbortController();
        let timer;
        async function poll() {
            try {
                const updated = await loadBranches(controller.signal);
                if (!controller.signal.aborted) setBranches(updated);
            } catch {
                if (!controller.signal.aborted) setSyncMessage('Не удалось проверить синхронизацию. Повторяем проверку…');
            }
            if (!controller.signal.aborted) timer = setTimeout(poll, 2000);
        }
        timer = setTimeout(poll, 2000);
        return () => { controller.abort(); clearTimeout(timer); };
    }, [hasRunningSync]);


    useEffect(() => {
        const controller = new AbortController();

        async function fetchBranches() {
            try {
                setLoading(true);
                setError('');

                const result = await loadBranches(
                    controller.signal
                );

                if (!controller.signal.aborted) {
                    setBranches(result);
                }
            } catch (err) {
                if (controller.signal.aborted) {
                    return;
                }

                console.error(
                    'Ошибка загрузки филиалов:',
                    err
                );

                setError(err.message);
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            }
        }

        fetchBranches();

        return () => controller.abort();
    }, []);

    function openCreate() {
        setEditingBranch(null);
        setForm(emptyForm());
        setFormError('');
        setModalOpen(true);
    }

    function openEdit(branch) {
        setEditingBranch(branch);

        setForm({
            name: branch.name,
            yclientsCompanyId:
                branch.yclientsCompanyId || '',
            isActive: branch.isActive,
        });

        setFormError('');
        setModalOpen(true);
    }

    function closeModal() {
        if (saving) {
            return;
        }

        setModalOpen(false);
        setEditingBranch(null);
        setForm(emptyForm());
        setFormError('');
    }

    function updateForm(field, value) {
        setForm(current => ({
            ...current,
            [field]: value,
        }));
    }

    async function handleSave(event) {
        event.preventDefault();

        if (saving) {
            return;
        }

        const name = form.name.trim();
        const companyId = form.yclientsCompanyId.trim();

        if (!name) {
            setFormError('Укажите название филиала');
            return;
        }

        if (
            companyId &&
            !/^[1-9]\d*$/.test(companyId)
        ) {
            setFormError(
                'YCLIENTS Company ID должен быть положительным числом'
            );
            return;
        }

        try {
            setSaving(true);
            setFormError('');

            const url = editingBranch
                ? `/api/branches/${editingBranch.id}`
                : '/api/branches';

            const response = await fetchApi(url, {
                method: editingBranch ? 'PATCH' : 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name,
                    yclientsCompanyId: companyId || null,
                    isActive: form.isActive,
                }),
            });

            await readApiResponse(response);

            setModalOpen(false);
            setEditingBranch(null);
            setForm(emptyForm());

            try {
                const updated = await loadBranches();

                setBranches(updated);
                setError('');
            } catch (refreshError) {
                console.error(
                    'Ошибка обновления списка:',
                    refreshError
                );

                setError(
                    'Изменения сохранены, но список не обновился. Обновите страницу.'
                );
            }
        } catch (err) {
            console.error(
                'Ошибка сохранения филиала:',
                err
            );

            setFormError(err.message);
        } finally {
            setSaving(false);
        }
    }

    async function copyCompanyId(value, id) {
        try {
            await navigator.clipboard.writeText(value);

            setCopiedId(id);

            setTimeout(() => {
                setCopiedId(current =>
                    current === id ? null : current
                );
            }, 2000);
        } catch (err) {
            console.error(
                'Ошибка копирования ID:',
                err
            );
        }
    }

    async function handleSync(branch) {
        if (syncingBranchId !== null) {
            return;
        }

        if (!branch.isActive) {
            setSyncMessage('Нельзя синхронизировать отключённый филиал.');
            return;
        }

        if (!branch.yclientsCompanyId) {
            setSyncMessage(
                `У филиала «${branch.name}» не указан YCLIENTS Company ID.`
            );
            return;
        }

        try {
            setSyncingBranchId(branch.id);
            setSyncMessage('');

            const response = await fetchApi(
                `/api/branches/${branch.id}/sync`,
                {
                    method: 'POST',
                }
            );

            const result = await readApiResponse(response);

            setBranches(current => current.map(item => item.id === branch.id ? { ...item, syncJob: result } : item));
            setSyncMessage(`Синхронизация филиала «${branch.name}» запущена. Можно продолжать работу.`);

            // Обновляем количество сотрудников
            // и дату последней синхронизации.
            try {
                const updatedBranches = await loadBranches();

                setBranches(updatedBranches);
                setError('');
            } catch (refreshError) {
                console.error(
                    'Ошибка обновления филиалов после синхронизации:',
                    refreshError
                );

                setSyncMessage(
                    `Филиал «${branch.name}» синхронизирован. ` +
                    `Получено сотрудников: ${result.staffCount}. ` +
                    'Но список не обновился. Обновите страницу.'
                );
            }
        } catch (err) {
            console.error(
                `Ошибка синхронизации филиала ${branch.id}:`,
                err
            );

            setSyncMessage(
                `Не удалось синхронизировать филиал «${branch.name}»: ` +
                err.message
            );
        } finally {
            setSyncingBranchId(null);
        }
    }

    return (
        <div className="branches-content">
            <header className="branches-heading">
                <h1>Филиалы</h1>

                <p>
                    Управление филиалами барбершопа
                    и их привязками к YCLIENTS
                </p>
            </header>

            <section>
                <div className="branches-section-heading">
                    <h2>Список филиалов</h2>

                    <button
                        type="button"
                        className="branches-add-button"
                        onClick={openCreate}
                    >
                        <Plus size={17} />
                        Добавить филиал
                    </button>
                </div>

                {syncMessage && (
                    <div
                        className="branches-sync-notice"
                        role="status"
                    >
                        <span>{syncMessage}</span>

                        <button
                            type="button"
                            onClick={() => setSyncMessage('')}
                            aria-label="Закрыть сообщение"
                        >
                            <X size={17} />
                        </button>
                    </div>
                )}

                <div className="branches-card">
                    {loading ? (
                        <p className="branches-message">
                            Загрузка филиалов...
                        </p>
                    ) : error ? (
                        <p className="branches-message branches-error">
                            {error}
                        </p>
                    ) : branches.length === 0 ? (
                        <div className="branches-empty">
                            <Store size={30} />

                            <h3>Филиалов пока нет</h3>

                            <p>
                                Добавьте первый филиал,
                                чтобы затем привязывать сотрудников.
                            </p>
                        </div>
                    ) : (
                        <div className="branches-table-wrapper">
                            <table className="branches-table">
                                <thead>
                                    <tr>
                                        <th>Название</th>
                                        <th>YCLIENTS Company ID</th>
                                        <th>Статус</th>
                                        <th>Сотрудники</th>
                                        <th>Клиенты</th>
                                        <th>Синхронизация</th>
                                        <th>Действия</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {branches.map(branch => (
                                        <tr key={branch.id}>
                                            <td>
                                                <div className="branches-name-cell">
                                                    <div className="branches-icon">
                                                        <Store size={19} />
                                                    </div>

                                                    <span className="branches-name">
                                                        {branch.name}
                                                    </span>
                                                </div>
                                            </td>

                                            <td>
                                                {branch.yclientsCompanyId ? (
                                                    <div className="branches-id-cell">
                                                        <span>
                                                            {branch.yclientsCompanyId}
                                                        </span>

                                                        <button
                                                            type="button"
                                                            className="branches-copy-button"
                                                            onClick={() =>
                                                                copyCompanyId(
                                                                    branch.yclientsCompanyId,
                                                                    branch.id
                                                                )
                                                            }
                                                            title="Скопировать ID"
                                                            aria-label="Скопировать ID"
                                                        >
                                                            {copiedId === branch.id
                                                                ? <Check size={15} />
                                                                : <Copy size={15} />}
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="branches-muted">
                                                        Не указан
                                                    </span>
                                                )}
                                            </td>

                                            <td>
                                                <span
                                                    className={
                                                        branch.isActive
                                                            ? 'branches-status branches-status-active'
                                                            : 'branches-status branches-status-inactive'
                                                    }
                                                >
                                                    {branch.isActive
                                                        ? 'Активен'
                                                        : 'Отключён'}
                                                </span>
                                            </td>

                                            <td>
                                                <span className="branches-staff-count">
                                                    {branch.staffCount ?? 0}
                                                </span>
                                            </td>

                                            <td>{branch.clientCount ?? 0}</td>
                                            <td>
                                                <span className="branches-sync-date" role="status">
                                                    {formatSyncDate(
                                                        branch.directorySyncedAt
                                                    )}
                                                    {branch.syncJob?.status === 'running' && <><br />
                                                        {{ staff: 'Сотрудники', clients: 'Клиенты', services: 'Услуги', goods: 'Товары' }[branch.syncJob.stage]}: {branch.syncJob.count}…
                                                    </>}
                                                    {branch.syncJob?.status === 'error' && <><br />{branch.syncJob.message}</>}
                                                    {branch.syncJob?.status === 'done' && <><br />
                                                        Готово: клиентов {branch.syncJob.result.counts.clients}, услуг {branch.syncJob.result.counts.services}, товаров {branch.syncJob.result.counts.goods}
                                                    </>}
                                                </span>
                                            </td>

                                            <td>
                                                <div className="branches-actions">
                                                    <button
                                                        type="button"
                                                        className="branches-sync-button"
                                                        onClick={() => handleSync(branch)}
                                                        disabled={
                                                            syncingBranchId !== null ||
                                                            branch.syncJob?.status === 'running' ||
                                                            !branch.isActive ||
                                                            !branch.yclientsCompanyId
                                                        }
                                                        title={
                                                            !branch.yclientsCompanyId
                                                                ? 'Сначала укажите YCLIENTS Company ID'
                                                                : !branch.isActive
                                                                    ? 'Филиал отключён'
                                                                    : 'Синхронизировать сотрудников, клиентов, услуги и товары'
                                                        }
                                                    >
                                                        <RefreshCw
                                                            size={15}
                                                            className={
                                                                (syncingBranchId === branch.id || branch.syncJob?.status === 'running')
                                                                    ? 'branches-sync-spinning'
                                                                    : ''
                                                            }
                                                        />

                                                        {(syncingBranchId === branch.id || branch.syncJob?.status === 'running')
                                                            ? 'Синхронизация...'
                                                            : 'Синхронизировать'}
                                                    </button>

                                                    <button
                                                        type="button"
                                                        className="branches-edit-button"
                                                        disabled={branch.syncJob?.status === 'running'}
                                                        onClick={() =>
                                                            openEdit(branch)
                                                        }
                                                    >
                                                        <Pencil size={15} />
                                                        Изменить
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </section>

            {modalOpen && (
                <div
                    className="branches-modal-overlay"
                    onMouseDown={event => {
                        if (event.target === event.currentTarget) {
                            closeModal();
                        }
                    }}
                >
                    <div
                        className="branches-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="branches-modal-title"
                    >
                        <div className="branches-modal-header">
                            <div>
                                <h2 id="branches-modal-title">
                                    {editingBranch
                                        ? 'Редактировать филиал'
                                        : 'Добавить филиал'}
                                </h2>

                                <p>
                                    Данные филиала в системе «ПЛОЩАДКА»
                                </p>
                            </div>

                            <button
                                type="button"
                                className="branches-close-button"
                                onClick={closeModal}
                                disabled={saving}
                                aria-label="Закрыть"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <form
                            className="branches-form"
                            onSubmit={handleSave}
                        >
                            <div className="branches-form-field">
                                <label htmlFor="branch-name">
                                    Название филиала
                                </label>

                                <input
                                    id="branch-name"
                                    type="text"
                                    maxLength={150}
                                    value={form.name}
                                    onChange={event =>
                                        updateForm(
                                            'name',
                                            event.target.value
                                        )
                                    }
                                    placeholder="Например, Центр"
                                    required
                                    disabled={saving}
                                />
                            </div>

                            <div className="branches-form-field">
                                <label htmlFor="branch-company-id">
                                    YCLIENTS Company ID
                                </label>

                                <input
                                    id="branch-company-id"
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[1-9][0-9]*"
                                    value={form.yclientsCompanyId}
                                    onChange={event =>
                                        updateForm(
                                            'yclientsCompanyId',
                                            event.target.value
                                        )
                                    }
                                    placeholder="Например, 123456"
                                    disabled={saving}
                                />

                                <p className="branches-field-hint">
                                    Необязательно. ID филиала
                                    в YCLIENTS можно добавить позже.
                                </p>
                            </div>

                            <label className="branches-active-field">
                                <input
                                    type="checkbox"
                                    checked={form.isActive}
                                    onChange={event =>
                                        updateForm(
                                            'isActive',
                                            event.target.checked
                                        )
                                    }
                                    disabled={saving}
                                />

                                <span>Филиал активен</span>
                            </label>

                            {formError && (
                                <p className="branches-form-error">
                                    {formError}
                                </p>
                            )}

                            <div className="branches-form-actions">
                                <button
                                    type="button"
                                    className="branches-cancel-button"
                                    onClick={closeModal}
                                    disabled={saving}
                                >
                                    Отмена
                                </button>

                                <button
                                    type="submit"
                                    className="branches-submit-button"
                                    disabled={saving}
                                >
                                    {saving
                                        ? 'Сохранение...'
                                        : editingBranch
                                            ? 'Сохранить изменения'
                                            : 'Добавить филиал'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
