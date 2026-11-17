import YclientsStaffBranches from '../components/YclientsStaffBranches';
import YclientsEmployeeDetails from '../components/YclientsEmployeeDetails';
import { isHttpUrl } from '../../shared/validation.js';
import { toggleStaffLink } from '../utils/yclients';
import { fetchApi, readJsonResponse } from '../utils/api';
import { getInitials, roleNames } from '../utils/users';

import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
    ArrowLeft,
    UserRound,
    Copy,
    Check,
    Eye,
    EyeOff,
    ShieldCheck,
    Save,
    RotateCcw,
    Search,
    Info,
} from 'lucide-react';

import './UserProfilePage.css';
import './UsersPage.css'; // Переиспользуем оформление выбора YCLIENTS из формы создания

function makeForm(user) {
    return {
        displayName: user.displayName || '',
        username: user.username || '',
        role: user.role || 'employee',
        isActive: Boolean(user.isActive),
        customPhotoUrl: user.customPhotoUrl || '',
        password: '',
        yclientsLinks: (user.yclientsLinks || []).map(link => ({
            branchId: Number(link.branchId),
            staffId: String(link.staffId),
        })),
    };
}

function getEditorSnapshot(form, overrides) {
    if (!form) return null;

    return JSON.stringify({
        displayName: form.displayName,
        username: form.username,
        role: form.role,
        isActive: form.isActive,
        customPhotoUrl: form.customPhotoUrl,
        password: form.password,
        yclientsLinks: [...form.yclientsLinks]
            .map(link => ({
                branchId: String(link.branchId),
                staffId: String(link.staffId),
            }))
            .sort((a, b) => a.branchId.localeCompare(b.branchId)),
        overrides,
    });
}

function readJson(response) {
    return readJsonResponse(response, {
        invalidJsonMessage: 'Сервер вернул не JSON. Проверь маршруты API.',
        errorMessage: 'Ошибка запроса',
    });
}

export default function UserProfilePage({ currentUser }) {
    const { id } = useParams();

    const [user, setUser] = useState(null);
    const [form, setForm] = useState(null);

    const [permissionGroups, setPermissionGroups] = useState([]);
    const [roleDefaultsByRole, setRoleDefaultsByRole] = useState({});
    const [overrides, setOverrides] = useState({});

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [saveError, setSaveError] = useState('');
    const [saveSuccess, setSaveSuccess] = useState('');

    const [copied, setCopied] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const [branches, setBranches] = useState([]);
    const [yclientsStaff, setYclientsStaff] = useState([]);
    const [staffSearch, setStaffSearch] = useState('');
    const [expandedBranches, setExpandedBranches] = useState({});
    const [branchesError, setBranchesError] = useState('');
    const [staffError, setStaffError] = useState('');

    const savedSnapshot = useRef(null);
    const hasUnsavedChanges =
        form !== null &&
        savedSnapshot.current !== null &&
        getEditorSnapshot(form, overrides) !== savedSnapshot.current;

    useEffect(() => {
        if (!hasUnsavedChanges) return;

        function handleBeforeUnload(event) {
            event.preventDefault();
            event.returnValue = '';
        }

        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [hasUnsavedChanges]);

    useEffect(() => {
        const controller = new AbortController();

        async function loadUser() {
            setLoading(true);
            setError('');
            setUser(null);
            setForm(null);
            setSaveError('');
            setSaveSuccess('');

            try {
                const [userResponse, defaultsResponse] = await Promise.all([
                    fetchApi(`/api/users/${id}`, {
                        signal: controller.signal,
                    }),

                    fetchApi('/api/users/permission-defaults', {
                        signal: controller.signal,
                    }),
                ]);

                const [result, defaultsResult] = await Promise.all([
                    readJson(userResponse),
                    readJson(defaultsResponse),
                ]);

                if (controller.signal.aborted) return;

                const initialForm = makeForm(result.user);
                const initialOverrides = result.permissionsOverride || {};

                savedSnapshot.current = getEditorSnapshot(
                    initialForm,
                    initialOverrides
                );

                setUser(result.user);
                setForm(initialForm);

                setPermissionGroups(result.permissionGroups || []);

                setRoleDefaultsByRole(
                    defaultsResult.defaultsByRole || {}
                );

                setOverrides(result.permissionsOverride || {});

                // Справочники загружаем отдельно: ошибка интеграции не должна
                // мешать редактированию остальных полей профиля.
                const [branchesResult, staffResult] = await Promise.allSettled([
                    fetchApi('/api/users/branches', {
                        signal: controller.signal,
                    }).then(readJson),
                    fetchApi('/api/yclients-staff', {
                        signal: controller.signal,
                    }).then(readJson),
                ]);

                if (controller.signal.aborted) return;

                if (branchesResult.status === 'fulfilled') {
                    setBranches(branchesResult.value.branches || []);
                    setBranchesError('');
                } else {
                    setBranchesError(branchesResult.reason.message);
                }

                if (staffResult.status === 'fulfilled') {
                    setYclientsStaff(staffResult.value.staff || []);
                    setStaffError('');
                } else {
                    setStaffError(staffResult.reason.message);
                }

            } catch (err) {
                if (controller.signal.aborted) return;

                console.error('Ошибка загрузки профиля:', err);
                setError(err.message);

            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            }
        }

        loadUser();

        return () => controller.abort();
    }, [id]);

    function updateForm(field, value) {
        setForm(current => ({
            ...current,
            [field]: value,
        }));

        setSaveError('');
        setSaveSuccess('');
    }

    function getDefaultValue(code) {
        return Boolean(roleDefaultsByRole[form?.role]?.[code]);
    }

    function getPermissionValue(code) {
        if (Object.prototype.hasOwnProperty.call(overrides, code)) {
            return overrides[code];
        }

        return getDefaultValue(code);
    }

    function togglePermission(code) {
        const nextValue = !getPermissionValue(code);
        const defaultValue = getDefaultValue(code);

        setOverrides(current => {
            const next = { ...current };

            if (nextValue === defaultValue) {
                delete next[code];
            } else {
                next[code] = nextValue;
            }

            return next;
        });

        setSaveError('');
        setSaveSuccess('');
    }

    function resetPermission(code) {
        setOverrides(current => {
            const next = { ...current };
            delete next[code];
            return next;
        });

        setSaveSuccess('');
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
                Number(branchId),
                staffId
            ),
        }));
        setSaveError('');
        setSaveSuccess('');
    }

    async function copyUsername() {
        if (!form) return;

        try {
            await navigator.clipboard.writeText(form.username);
            setCopied(true);

            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Ошибка копирования логина:', err);
        }
    }

    async function handleSave(event) {
        event.preventDefault();

        if (saving || !form) return;

        const displayName = form.displayName.trim();
        const username = form.username.trim();
        const customPhotoUrl = form.customPhotoUrl.trim();

        if (!displayName || !username) {
            setSaveError('Заполните имя и логин');
            return;
        }

        if (form.password && form.password.length < 8) {
            setSaveError('Новый пароль должен содержать минимум 8 символов');
            return;
        }

        if (customPhotoUrl && !isHttpUrl(customPhotoUrl)) {
            setSaveError('Укажите корректный URL аватарки');
            return;
        }

        try {
            setSaving(true);
            setSaveError('');
            setSaveSuccess('');

            const response = await fetchApi(`/api/users/${id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    displayName,
                    username,
                    role: form.role,
                    isActive: form.isActive,
                    customPhotoUrl: customPhotoUrl || null,
                    password: form.password,
                    permissionsOverride: overrides,
                    yclientsLinks: form.yclientsLinks.map(link => ({
                        branchId: Number(link.branchId),
                        staffId: String(link.staffId),
                    })),
                }),
            });

            const result = await readJson(response);

            const savedForm = makeForm(result.user);
            const savedOverrides = result.permissionsOverride || {};

            savedSnapshot.current = getEditorSnapshot(
                savedForm,
                savedOverrides
            );

            setUser(result.user);
            setForm(savedForm);

            setPermissionGroups(result.permissionGroups || []);
            // Стандарты ролей уже получены отдельным запросом.
            setOverrides(result.permissionsOverride || {});

            setShowPassword(false);
            setSaveSuccess('Изменения успешно сохранены');

            // При редактировании своего аккаунта изменения имени,
            // роли и аватара в Sidebar могут потребовать обновления страницы.
        } catch (err) {
            console.error('Ошибка сохранения пользователя:', err);
            setSaveError(err.message);
        } finally {
            setSaving(false);
        }
    }

    const displayedName = form?.displayName.trim() || user?.displayName;
    const displayedRole = roleNames[form?.role] || form?.role;
    const photo = form?.customPhotoUrl.trim() || user?.yclientsPhotoUrl;

    return (
        <div className="user-profile-content">
            <Link
                to="/users"
                className="user-profile-back"
                onClick={event => {
                    if (
                        hasUnsavedChanges &&
                        !window.confirm(
                            'Есть несохранённые изменения. Выйти без сохранения?'
                        )
                    ) {
                        event.preventDefault();
                    }
                }}
            >
                <ArrowLeft size={18} />
                <span>К списку пользователей</span>
            </Link>

            <div className="user-profile-heading">
                <h1>Профиль пользователя</h1>
                <p>Редактирование аккаунта и разрешений сотрудника</p>
            </div>

            {loading && (
                <div className="user-profile-message">
                    Загрузка профиля...
                </div>
            )}

            {!loading && error && (
                <div className="user-profile-message user-profile-error">
                    {error}
                </div>
            )}

            {!loading && !error && user && form && (
                <>
                    <div className="user-profile-card">
                        <div className="user-profile-avatar">
                            {photo ? (
                                <img
                                    key={photo}
                                    src={photo}
                                    alt={displayedName}
                                    onError={event => {
                                        event.currentTarget.style.display = 'none';
                                    }}
                                />
                            ) : (<span>{getInitials(displayedName)}</span>)}
                        </div>

                        <div className="user-profile-identity">
                            <div className="user-profile-name-row">
                                <h2>{displayedName}</h2>

                                {currentUser?.id === user.id && (
                                    <span className="user-profile-self-badge">
                                        Вы
                                    </span>
                                )}
                            </div>

                            <span className="user-profile-role">
                                {displayedRole}
                            </span>

                            <span
                                className={
                                    form.isActive
                                        ? 'user-profile-status is-active'
                                        : 'user-profile-status is-inactive'
                                }
                            >
                                <span className="user-profile-status-dot" />
                                {form.isActive ? 'Активен' : 'Неактивен'}
                            </span>
                        </div>
                    </div>

                    <form
                        className="user-profile-edit-form"
                        onSubmit={handleSave}
                    >
                        <section className="user-profile-section">
                            <div className="user-profile-section-heading">
                                <UserRound size={20} />
                                <h3>Данные аккаунта</h3>
                            </div>

                            <div className="user-profile-fields">
                                <div className="user-profile-field">
                                    <label
                                        className="user-profile-label"
                                        htmlFor="profile-display-name"
                                    >
                                        Имя
                                    </label>

                                    <input
                                        id="profile-display-name"
                                        className="user-profile-input"
                                        type="text"
                                        value={form.displayName}
                                        onChange={event =>
                                            updateForm(
                                                'displayName',
                                                event.target.value
                                            )
                                        }
                                        maxLength={150}
                                        required
                                        disabled={saving}
                                    />
                                </div>

                                <div className="user-profile-field">
                                    <label
                                        className="user-profile-label"
                                        htmlFor="profile-username"
                                    >
                                        Логин
                                    </label>

                                    <div className="user-profile-value-row">
                                        <input
                                            id="profile-username"
                                            className="user-profile-input"
                                            type="text"
                                            value={form.username}
                                            onChange={event =>
                                                updateForm(
                                                    'username',
                                                    event.target.value
                                                )
                                            }
                                            maxLength={150}
                                            required
                                            disabled={saving}
                                        />

                                        <button
                                            type="button"
                                            className="user-profile-copy"
                                            onClick={copyUsername}
                                            title={
                                                copied
                                                    ? 'Скопировано'
                                                    : 'Скопировать логин'
                                            }
                                        >
                                            {copied
                                                ? <Check size={16} />
                                                : <Copy size={16} />}
                                        </button>
                                    </div>
                                </div>

                                <div className="user-profile-field">
                                    <label
                                        className="user-profile-label"
                                        htmlFor="profile-role"
                                    >
                                        Роль
                                    </label>

                                    <select
                                        id="profile-role"
                                        className="user-profile-input"
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
                                        <option value="admin">
                                            Администратор
                                        </option>
                                        <option value="manager">
                                            Руководитель
                                        </option>
                                    </select>
                                </div>

                                <div className="user-profile-field">
                                    <span className="user-profile-label">
                                        Статус аккаунта
                                    </span>

                                    <label className="user-profile-checkbox">
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
                                </div>

                                <div className="user-profile-field">
                                    <label
                                        className="user-profile-label"
                                        htmlFor="profile-photo"
                                    >
                                        URL аватарки
                                    </label>

                                    <input
                                        id="profile-photo"
                                        className="user-profile-input"
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

                                <div className="user-profile-field">
                                    <label
                                        className="user-profile-label"
                                        htmlFor="profile-password"
                                    >
                                        Новый пароль
                                    </label>

                                    <div className="user-profile-password">
                                        <input
                                            id="profile-password"
                                            className="user-profile-input"
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
                                            placeholder="Оставьте пустым, чтобы не менять"
                                            autoComplete="new-password"
                                            disabled={saving}
                                        />

                                        <button
                                            type="button"
                                            className="user-profile-password-toggle"
                                            onClick={() =>
                                                setShowPassword(value => !value)
                                            }
                                            disabled={saving}
                                            aria-label={
                                                showPassword
                                                    ? 'Скрыть пароль'
                                                    : 'Показать пароль'
                                            }
                                        >
                                            {showPassword
                                                ? <EyeOff size={18} />
                                                : <Eye size={18} />}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </section>


                        <section className="user-profile-section user-profile-section-spaced">
                            <div className="user-profile-section-heading">
                                <UserRound size={20} />

                                <div>
                                    <h3>Данные сотрудника YCLIENTS</h3>

                                    <p className="user-profile-section-subtitle">
                                        Информация о сотруднике из подключённых филиалов.
                                        Данные обновляются при синхронизации YCLIENTS.
                                    </p>
                                </div>
                            </div>

                            <YclientsEmployeeDetails
                                links={user.yclientsLinks || []}
                                staff={yclientsStaff}
                                branches={branches}
                                error={staffError}
                            />
                        </section>


                        <section className="user-profile-section user-profile-section-spaced">
                            <div className="user-profile-section-heading">
                                <UserRound size={20} />
                                <div>
                                    <h3>Привязки YCLIENTS</h3>
                                    <p className="user-profile-section-subtitle">
                                        Один сотрудник на филиал. Уже выбранные привязки
                                        загружены из профиля пользователя.
                                    </p>
                                </div>
                            </div>

                            <div className="user-profile-permissions">
                                <div className="users-form-field">
                                    <label htmlFor="profile-staff-search">Поиск сотрудника</label>
                                    <div className="users-staff-search">
                                        <Search size={17} />
                                        <input
                                            id="profile-staff-search"
                                            type="search"
                                            value={staffSearch}
                                            onChange={event => setStaffSearch(event.target.value)}
                                            placeholder="Имя, должность или ID"
                                            disabled={saving}
                                        />
                                    </div>
                                </div>

                                {branchesError && <p className="users-form-error">Не удалось загрузить филиалы: {branchesError}</p>}
                                {staffError && <p className="users-form-error">Не удалось загрузить сотрудников: {staffError}</p>}
                                {!branchesError && branches.length === 0 && (
                                    <p className="users-form-hint">Активных филиалов пока нет.</p>
                                )}

                                <YclientsStaffBranches
                                    branches={branches}
                                    staff={yclientsStaff}
                                    links={form.yclientsLinks}
                                    search={staffSearch}
                                    expandedBranches={expandedBranches}
                                    onToggleBranch={toggleBranch}
                                    onToggleStaff={toggleStaff}
                                    disabled={saving}
                                    emptyMessage="Сотрудников пока нет. Синхронизируйте филиал."
                                />

                                {form.yclientsLinks.length > 0 && (
                                    <div className="users-staff-selection-summary">
                                        Выбрано привязок: {form.yclientsLinks.length}
                                    </div>
                                )}
                                {/* Не теряем привязки, если сотрудника больше нет в кэше */}
                                {form.yclientsLinks.filter(link => !branches.some(branch => String(branch.id) === String(link.branchId))).map(link => (
                                    <p key={link.branchId} className="users-form-hint">
                                        Сохранённая привязка: филиал {link.branchId}, сотрудник {link.staffId}
                                    </p>
                                ))}
                                <div className="users-staff-help">
                                    <Info size={17} />
                                    <p>
                                        Не нашли сотрудника? Перейдите во вкладку{' '}
                                        <Link to="/branches">«Филиалы»</Link> и синхронизируйте список.
                                    </p>
                                </div>
                            </div>
                        </section>

                        <section className="user-profile-section">
                            <div className="user-profile-section-heading">
                                <ShieldCheck size={20} />
                                <div>
                                    <h3>Разрешения пользователя</h3>
                                    <p className="user-profile-permissions-subtitle">
                                        Стандартные значения определяются ролью.
                                        Изменённые разрешения сохраняются отдельно.
                                    </p>
                                </div>
                            </div>

                            {permissionGroups.length === 0 ? (
                                <p className="user-profile-permissions-empty">
                                    Список разрешений пока не настроен.
                                </p>
                            ) : (
                                <div className="user-profile-permissions">
                                    {permissionGroups.map(group => (
                                        <div
                                            key={group.title}
                                            className="user-profile-permission-group"
                                        >
                                            <h4>{group.title}</h4>

                                            {group.permissions.map(permission => {
                                                const isEnabled =
                                                    getPermissionValue(
                                                        permission.code
                                                    );

                                                const isOverridden =
                                                    Object.prototype.hasOwnProperty.call(
                                                        overrides,
                                                        permission.code
                                                    );

                                                return (
                                                    <div
                                                        key={permission.code}
                                                        className="user-profile-permission-row"
                                                    >
                                                        <div className="user-profile-permission-info">
                                                            <span>
                                                                {permission.label}
                                                            </span>

                                                            <small>
                                                                {isOverridden
                                                                    ? 'Индивидуальное значение'
                                                                    : 'По умолчанию для роли'}
                                                            </small>
                                                        </div>

                                                        <div className="user-profile-permission-actions">
                                                            {isOverridden && (
                                                                <button
                                                                    type="button"
                                                                    className="user-profile-permission-reset"
                                                                    onClick={() =>
                                                                        resetPermission(
                                                                            permission.code
                                                                        )
                                                                    }
                                                                    title="Вернуть значение роли"
                                                                    aria-label={
                                                                        `Сбросить: ${permission.label}`
                                                                    }
                                                                    disabled={saving}
                                                                >
                                                                    <RotateCcw size={15} />
                                                                </button>
                                                            )}

                                                            <button
                                                                type="button"
                                                                role="switch"
                                                                aria-checked={isEnabled}
                                                                aria-label={permission.label}
                                                                className={
                                                                    isEnabled
                                                                        ? 'user-profile-switch is-on'
                                                                        : 'user-profile-switch'
                                                                }
                                                                onClick={() =>
                                                                    togglePermission(
                                                                        permission.code
                                                                    )
                                                                }
                                                                disabled={saving}
                                                            >
                                                                <span />
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>

                        <div className="user-profile-save-area">
                            <div className="user-profile-save-messages">
                                {saveError && (
                                    <p className="user-profile-save-error">
                                        {saveError}
                                    </p>
                                )}

                                {saveSuccess && (
                                    <p className="user-profile-save-success">
                                        {saveSuccess}
                                    </p>
                                )}
                            </div>

                            <button
                                type="submit"
                                className="user-profile-save-button"
                                disabled={saving}
                            >
                                <Save size={17} />
                                {saving
                                    ? 'Сохранение...'
                                    : 'Сохранить изменения'}
                            </button>
                        </div>
                    </form>
                </>
            )}
        </div>
    );
}
