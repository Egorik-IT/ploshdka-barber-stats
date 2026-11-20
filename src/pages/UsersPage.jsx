import useViewMode from '../hooks/useViewMode';
import { calculationCategories } from '../../shared/calculationSettings';
import YclientsStaffBranches from '../components/YclientsStaffBranches';
import { isHttpUrl } from '../../shared/validation.js';
import { toggleStaffLink } from '../utils/yclients';
import { fetchApi, readJsonResponse } from '../utils/api';
import { getInitials, roleNames } from '../utils/users';

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    Copy,
    Check,
    Plus,
    X,
    Eye,
    EyeOff,
    Search,
    Info,
} from 'lucide-react';

import './UsersPage.css';

function createEmptyForm() {
    return {
        displayName: '',
        username: '',
        password: '',
        role: 'employee',
        isActive: true,
        customPhotoUrl: '',
        yclientsLinks: [],
    };
}

export default function UsersPage({ currentUser }) {
    const {mode}=useViewMode();
    const [users, setUsers] = useState([]);
    const [branches, setBranches] = useState([]);
    const [yclientsStaff, setYclientsStaff] = useState([]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [copiedUserId, setCopiedUserId] = useState(null);

    const [showCreateForm, setShowCreateForm] = useState(false);
    const [form, setForm] = useState(createEmptyForm);
    const [showPassword, setShowPassword] = useState(false);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');

    const [branchesLoading, setBranchesLoading] = useState(false);
    const [branchesError, setBranchesError] = useState('');

    const [staffLoading, setStaffLoading] = useState(false);
    const [staffError, setStaffError] = useState('');
    const [staffSearch, setStaffSearch] = useState('');
    const [expandedBranches, setExpandedBranches] = useState({});

    async function loadUsers(signal) {
        const response = await fetchApi('/api/users', {
            signal,
        });

        const result = await readJsonResponse(response);

        return (result.users || []).filter(
            user => user.role !== 'developer'
        );
    }

    useEffect(() => {
        const controller = new AbortController();

        async function fetchUsers() {
            try {
                setLoading(true);
                setError('');

                const loadedUsers = await loadUsers(controller.signal);

                if (!controller.signal.aborted) {
                    setUsers(loadedUsers);
                }
            } catch (err) {
                if (controller.signal.aborted) return;

                console.error('Ошибка загрузки пользователей:', err);
                setError(err.message);
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            }
        }

        fetchUsers();

        return () => controller.abort();
    }, []);

    async function copyUsername(username, userId) {
        try {
            await navigator.clipboard.writeText(username);
            setCopiedUserId(userId);

            setTimeout(() => {
                setCopiedUserId(current =>
                    current === userId ? null : current
                );
            }, 2000);
        } catch (err) {
            console.error('Не удалось скопировать логин:', err);
        }
    }

    function updateForm(field, value) {
        setForm(current => ({
            ...current,
            [field]: value,
        }));
    }

    async function openCreateForm() {
        setForm(createEmptyForm());
        setFormError('');
        setShowPassword(false);

        setBranches([]);
        setYclientsStaff([]);
        setBranchesError('');
        setStaffError('');
        setStaffSearch('');
        setExpandedBranches({});

        setShowCreateForm(true);
        setBranchesLoading(true);
        setStaffLoading(true);

        const [branchesResult, staffResult] = await Promise.allSettled([
            fetchApi('/api/users/branches').then(readJsonResponse),

            fetchApi('/api/yclients-staff').then(readJsonResponse),
        ]);

        if (branchesResult.status === 'fulfilled') {
            setBranches(branchesResult.value.branches || []);
        } else {
            console.error(
                'Ошибка загрузки филиалов:',
                branchesResult.reason
            );
            setBranchesError(branchesResult.reason.message);
        }

        if (staffResult.status === 'fulfilled') {
            setYclientsStaff(staffResult.value.staff || []);
        } else {
            console.error(
                'Ошибка загрузки сотрудников YCLIENTS:',
                staffResult.reason
            );
            setStaffError(staffResult.reason.message);
        }

        setBranchesLoading(false);
        setStaffLoading(false);
    }

    function closeCreateForm() {
        if (saving) return;

        setShowCreateForm(false);
        setFormError('');
        setForm(createEmptyForm());
        setStaffSearch('');
        setExpandedBranches({});
    }

    function toggleBranch(branchId) {
        const key = String(branchId);

        setExpandedBranches(current => ({
            ...current,
            [key]: !current[key],
        }));
    }

    function toggleStaff(branchId, staffId) {
        if (saving) return;

        setForm(current => ({
            ...current,
            yclientsLinks: toggleStaffLink(
                current.yclientsLinks,
                String(branchId),
                staffId
            ),
        }));
    }

    async function handleCreateUser(event) {
        event.preventDefault();

        if (saving) return;

        const displayName = form.displayName.trim();
        const username = form.username.trim();
        const customPhotoUrl = form.customPhotoUrl.trim();

        if (!displayName || !username || !form.password) {
            setFormError('Заполните все обязательные поля');
            return;
        }

        if (form.password.length < 8) {
            setFormError('Пароль должен содержать минимум 8 символов');
            return;
        }

        if (customPhotoUrl && !isHttpUrl(customPhotoUrl)) {
            setFormError('Укажите корректный URL аватарки (http или https)');
            return;
        }

        const branchIds = new Set();

        for (const link of form.yclientsLinks) {
            const branchId = String(link.branchId);
            const staffId = String(link.staffId);

            if (
                !/^[1-9]\d*$/.test(branchId) ||
                !/^[1-9]\d*$/.test(staffId)
            ) {
                setFormError('Некорректная привязка YCLIENTS');
                return;
            }

            if (branchIds.has(branchId)) {
                setFormError('Один филиал нельзя указать дважды');
                return;
            }

            branchIds.add(branchId);
        }

        try {
            setSaving(true);
            setFormError('');

            const response = await fetchApi('/api/users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    displayName,
                    username,
                    password: form.password,
                    role: form.role,
                    isActive: form.isActive,
                    customPhotoUrl: customPhotoUrl || null,
                    yclientsLinks: form.yclientsLinks.map(link => ({
                        branchId: Number(link.branchId),
                        staffId: String(link.staffId),
                    })),
                }),
            });

            await readJsonResponse(response);

            setShowCreateForm(false);
            setForm(createEmptyForm());
            setShowPassword(false);

            try {
                const updatedUsers = await loadUsers();
                setUsers(updatedUsers);
                setError('');
            } catch (refreshError) {
                console.error(
                    'Пользователь создан, но список не обновился:',
                    refreshError
                );
                setError(
                    'Пользователь создан, но список не обновился. Обновите страницу.'
                );
            }
        } catch (err) {
            console.error('Ошибка создания пользователя:', err);
            setFormError(err.message);
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="users-content">
            <header className="users-heading">
                <h1>Пользователи</h1>
                <p>Управление пользователями системы</p>
            </header>

            <section className="users-section">
                <div className="users-section-heading">
                    <h2>Список пользователей</h2>

                    <button
                        type="button"
                        className="users-add-button"
                        onClick={openCreateForm}
                    >
                        <Plus size={17} />
                        <span>Добавить пользователя</span>
                    </button>
                </div>

                <div className="users-card">
                    {loading ? (
                        <p className="users-message">
                            Загрузка пользователей...
                        </p>
                    ) : error ? (
                        <p className="users-message users-error">
                            {error}
                        </p>
                    ) : users.length === 0 ? (
                        <p className="users-message">
                            Пользователей пока нет.
                        </p>
                    ) : (
                        <div className="users-table-wrapper">
                            <table className="users-table">
                                <thead>
                                    <tr>
                                        <th>Имя</th>
                                        <th>Логин</th>
                                        <th>Роль</th>
                                        <th>Статус</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {users.filter(user=>mode==='manager'||user.role==='employee').map(user => {
                                        const isCurrentUser =
                                            user.id === currentUser?.id;

                                        return (
                                            <tr key={user.id}>
                                                <td>
                                                    <div className="users-person">
                                                        <Link
                                                            to={`/users/${user.id}`}
                                                            className="users-person-link"
                                                        >
                                                            <div className="users-avatar">
                                                                {user.photo && (
                                                                    <img
                                                                        src={user.photo}
                                                                        alt={user.displayName}
                                                                        className="users-avatar-image"
                                                                        onError={event => {
                                                                            event.currentTarget.style.display = 'none';
                                                                        }}
                                                                    />
                                                                )}

                                                                <span className="users-avatar-initials">
                                                                    {getInitials(user.displayName)}
                                                                </span>
                                                            </div>

                                                            <span className="users-name">
                                                                {user.displayName}<small className="employee-category-label">{calculationCategories[user.calculationCategory] || 'Категория YCLIENTS не определена'}</small>
                                                            </span>
                                                        </Link>

                                                        {isCurrentUser && (
                                                            <span className="users-self-badge">
                                                                Вы
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>

                                                <td>
                                                    <div className="users-login">
                                                        <span>
                                                            {user.username}
                                                        </span>

                                                        <button
                                                            type="button"
                                                            className="users-copy-button"
                                                            onClick={() =>
                                                                copyUsername(
                                                                    user.username,
                                                                    user.id
                                                                )
                                                            }
                                                            title={
                                                                copiedUserId === user.id
                                                                    ? 'Скопировано'
                                                                    : 'Скопировать логин'
                                                            }
                                                            aria-label="Скопировать логин"
                                                        >
                                                            {copiedUserId === user.id
                                                                ? <Check size={15} />
                                                                : <Copy size={15} />}
                                                        </button>
                                                    </div>
                                                </td>

                                                <td>
                                                    {roleNames[user.role] ||
                                                        user.role}
                                                </td>

                                                <td>
                                                    <span
                                                        className={
                                                            user.isActive
                                                                ? 'users-status users-status-active'
                                                                : 'users-status users-status-inactive'
                                                        }
                                                    >
                                                        {user.isActive
                                                            ? 'Активен'
                                                            : 'Отключён'}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </section>

            {showCreateForm && (
                <div
                    className="users-modal-overlay"
                    onMouseDown={event => {
                        if (event.target === event.currentTarget) {
                            closeCreateForm();
                        }
                    }}
                >
                    <div
                        className="users-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="users-create-title"
                    >
                        <div className="users-modal-header">
                            <div>
                                <h2 id="users-create-title">
                                    Добавить пользователя
                                </h2>
                                <p>
                                    Создание нового аккаунта в системе
                                </p>
                            </div>

                            <button
                                type="button"
                                className="users-modal-close"
                                onClick={closeCreateForm}
                                disabled={saving}
                                aria-label="Закрыть"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <form
                            className="users-create-form"
                            onSubmit={handleCreateUser}
                        >
                            <div className="users-form-field">
                                <label htmlFor="users-display-name">
                                    Имя пользователя
                                </label>

                                <input
                                    id="users-display-name"
                                    type="text"
                                    value={form.displayName}
                                    onChange={event =>
                                        updateForm(
                                            'displayName',
                                            event.target.value
                                        )
                                    }
                                    placeholder="Имя и фамилия"
                                    required
                                    disabled={saving}
                                />
                            </div>

                            <div className="users-form-field">
                                <label htmlFor="users-username">
                                    Логин
                                </label>

                                <input
                                    id="users-username"
                                    type="text"
                                    value={form.username}
                                    onChange={event =>
                                        updateForm(
                                            'username',
                                            event.target.value
                                        )
                                    }
                                    placeholder="Логин для входа"
                                    autoComplete="off"
                                    required
                                    disabled={saving}
                                />
                            </div>

                            <div className="users-form-field">
                                <label htmlFor="users-password">
                                    Пароль
                                </label>

                                <div className="users-password-wrapper">
                                    <input
                                        id="users-password"
                                        type={
                                            showPassword
                                                ? 'text'
                                                : 'password'
                                        }
                                        value={form.password}
                                        onChange={event =>
                                            updateForm(
                                                'password',
                                                event.target.value
                                            )
                                        }
                                        placeholder="Минимум 8 символов"
                                        autoComplete="new-password"
                                        minLength={8}
                                        required
                                        disabled={saving}
                                    />

                                    <button
                                        type="button"
                                        className="users-password-toggle"
                                        onClick={() =>
                                            setShowPassword(current => !current)
                                        }
                                        disabled={saving}
                                        aria-label={
                                            showPassword
                                                ? 'Скрыть пароль'
                                                : 'Показать пароль'
                                        }
                                    >
                                        {showPassword
                                            ? <EyeOff size={17} />
                                            : <Eye size={17} />}
                                    </button>
                                </div>
                            </div>

                            <div className="users-form-field">
                                <label htmlFor="users-role">
                                    Роль
                                </label>

                                <select
                                    id="users-role"
                                    value={form.role}
                                    onChange={event =>
                                        updateForm(
                                            'role',
                                            event.target.value
                                        )
                                    }
                                    disabled={saving}
                                >
                                    <option value="employee">
                                        Сотрудник
                                    </option>
                                    <option value="admin" disabled={mode==='admin'}>Администратор</option>
                                    <option value="manager" disabled={mode==='admin' || currentUser?.role!=='developer'}>Руководитель</option>
                                </select>
                            </div>

                            <label className="users-active-field">
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
                                <span>Аккаунт активен</span>
                            </label>

                            <div className="users-form-divider" />

                            <div className="users-form-group-heading">
                                <h3>Аватар</h3>
                                <p>
                                    Необязательно. Если URL не указан,
                                    используется фото из YCLIENTS,
                                    когда сотрудник привязан и фото
                                    загружено. Иначе показываются инициалы.
                                </p>
                            </div>

                            <div className="users-form-field">
                                <label htmlFor="users-photo-url">
                                    URL аватарки
                                </label>

                                <input
                                    id="users-photo-url"
                                    type="url"
                                    value={form.customPhotoUrl}
                                    onChange={event =>
                                        updateForm(
                                            'customPhotoUrl',
                                            event.target.value
                                        )
                                    }
                                    placeholder="https://example.com/photo.jpg"
                                    disabled={saving}
                                />
                            </div>

                            <div className="users-form-divider" />

                            <div className="users-form-group-heading">
                                <h3>Привязки YCLIENTS</h3>
                                <p>
                                    Выберите сотрудника из нужного филиала.
                                    У одного человека могут быть разные
                                    YCLIENTS ID в разных филиалах.
                                </p>
                            </div>

                            <div className="users-form-field">
                                <label htmlFor="users-staff-search">
                                    Поиск сотрудника
                                </label>

                                <div className="users-staff-search">
                                    <Search size={17} />

                                    <input
                                        id="users-staff-search"
                                        type="search"
                                        value={staffSearch}
                                        onChange={event =>
                                            setStaffSearch(event.target.value)
                                        }
                                        placeholder="Имя, должность или ID"
                                        disabled={saving}
                                    />
                                </div>
                            </div>

                            {(branchesLoading || staffLoading) && (
                                <p className="users-message">
                                    Загрузка филиалов и сотрудников...
                                </p>
                            )}

                            {branchesError && (
                                <p className="users-form-error">
                                    Не удалось загрузить филиалы: {branchesError}
                                </p>
                            )}

                            {staffError && (
                                <p className="users-form-error">
                                    Не удалось загрузить сотрудников: {staffError}
                                </p>
                            )}

                            {!branchesLoading &&
                                !staffLoading &&
                                !branchesError &&
                                branches.length === 0 && (
                                    <p className="users-form-hint">
                                        Активных филиалов пока нет.
                                        Пользователя можно создать
                                        без привязки к YCLIENTS.
                                    </p>
                                )}

                            {!branchesLoading &&
                                !staffLoading &&
                                !branchesError &&
                                branches.length > 0 && (
                                    <YclientsStaffBranches
                                        branches={branches}
                                        staff={yclientsStaff}
                                        links={form.yclientsLinks}
                                        search={staffSearch}
                                        expandedBranches={expandedBranches}
                                        onToggleBranch={toggleBranch}
                                        onToggleStaff={toggleStaff}
                                        disabled={saving}
                                        emptyMessage="Сотрудников пока нет. Обновите список во вкладке «Филиалы»."
                                    />
                                )}

                            {form.yclientsLinks.length > 0 && (
                                <div className="users-staff-selection-summary">
                                    Выбрано привязок: {form.yclientsLinks.length}
                                </div>
                            )}

                            <div className="users-staff-help">
                                <Info size={17} />

                                <p>
                                    Не нашли нужного сотрудника?
                                    Перейдите во вкладку{' '}
                                    <Link
                                        to="/branches"
                                        onClick={event => {
                                            if (saving) {
                                                event.preventDefault();
                                            }
                                        }}
                                    >
                                        «Филиалы»
                                    </Link>
                                    {' '}и синхронизируйте сотрудников
                                    нужного филиала.
                                </p>
                            </div>

                            {formError && (
                                <p className="users-form-error">
                                    {formError}
                                </p>
                            )}

                            <div className="users-form-actions">
                                <button
                                    type="button"
                                    className="users-cancel-button"
                                    onClick={closeCreateForm}
                                    disabled={saving}
                                >
                                    Отмена
                                </button>

                                <button
                                    type="submit"
                                    className="users-submit-button"
                                    disabled={saving}
                                >
                                    {saving
                                        ? 'Создание...'
                                        : 'Создать пользователя'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
