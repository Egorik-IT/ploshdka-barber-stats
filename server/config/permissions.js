/*
    ПЛОЩАДКА — система разрешений

    Стандартные разрешения задаются в коде.
    Индивидуальные изменения хранятся в user_permissions.

    Пока разрешения только настраиваются и сохраняются.
    Проверки доступа по ролям не применяются.
*/

// Все доступные разрешения
export const PERMISSIONS = Object.freeze({
    USERS_VIEW: 'users.view',
    USERS_CREATE: 'users.create',
    USERS_EDIT: 'users.edit',
    USERS_BLOCK: 'users.block',

    ROLES_MANAGE: 'roles.manage',

    STATISTICS_VIEW: 'statistics.view',

    SALARY_VIEW: 'salary.view',
    SALARY_EDIT: 'salary.edit',
});

// Стандартные разрешения каждой роли
export const ROLE_PERMISSIONS = {
    developer: Object.values(PERMISSIONS),

    manager: [
        PERMISSIONS.USERS_VIEW,
        PERMISSIONS.USERS_CREATE,
        PERMISSIONS.USERS_EDIT,
        PERMISSIONS.USERS_BLOCK,
        PERMISSIONS.STATISTICS_VIEW,
        PERMISSIONS.SALARY_VIEW,
    ],

    admin: [
        PERMISSIONS.USERS_VIEW,
        PERMISSIONS.STATISTICS_VIEW,
    ],

    employee: [],
};

// Группы разрешений для интерфейса
export const permissionGroups = [
    {
        title: 'Пользователи',
        permissions: [
            {
                code: PERMISSIONS.USERS_VIEW,
                label: 'Просмотр пользователей',
            },
            {
                code: PERMISSIONS.USERS_CREATE,
                label: 'Создание пользователей',
            },
            {
                code: PERMISSIONS.USERS_EDIT,
                label: 'Редактирование пользователей',
            },
            {
                code: PERMISSIONS.USERS_BLOCK,
                label: 'Блокировка пользователей',
            },
        ],
    },
    {
        title: 'Роли',
        permissions: [
            {
                code: PERMISSIONS.ROLES_MANAGE,
                label: 'Управление ролями',
            },
        ],
    },
    {
        title: 'Статистика',
        permissions: [
            {
                code: PERMISSIONS.STATISTICS_VIEW,
                label: 'Просмотр статистики',
            },
        ],
    },
    {
        title: 'Зарплаты',
        permissions: [
            {
                code: PERMISSIONS.SALARY_VIEW,
                label: 'Просмотр зарплат',
            },
            {
                code: PERMISSIONS.SALARY_EDIT,
                label: 'Редактирование зарплат',
            },
        ],
    },
];

// Все коды разрешений
export const permissionCodes = Object.values(PERMISSIONS);

// Получение стандартных разрешений выбранной роли
export function getDefaultPermissions(role) {
    const allowed = new Set(ROLE_PERMISSIONS[role] || []);

    return Object.fromEntries(
        permissionCodes.map(code => [
            code,
            allowed.has(code),
        ])
    );
}