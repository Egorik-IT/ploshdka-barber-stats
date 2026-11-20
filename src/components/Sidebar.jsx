import useViewMode, { canPreviewPage } from '../hooks/useViewMode';
import { getInitials, roleNames as userRoleNames } from '../utils/users';

import { useState } from 'react';
import { NavLink } from 'react-router-dom';

import {
    LayoutDashboard,
    Users,
    Store,
    ChartNoAxesCombined,
    Wallet,
    Calculator,
    Settings,
    LogOut,
    Menu,
    X,
    PanelLeftClose,
    PanelLeftOpen,
} from 'lucide-react';

import './Sidebar.css';

const roleNames = { developer: 'Разработчик', ...userRoleNames };

const navigation = [
    { label: 'Главная', icon: LayoutDashboard, path: '/dashboard' },
    { label: 'Пользователи', icon: Users, path: '/users' },
    { label: 'Филиалы', icon: Store, path: '/branches' },
    { label: 'Клиенты', icon: Users, path: '/clients' },
    { label: 'Статистика сотрудников', icon: ChartNoAxesCombined, path: '/statistics' },
    { label: 'Калькулятор зарплаты', icon: Calculator, path: '/calculator' },
    { label: 'Финансы', icon: Wallet, path: '/finance' },
    { label: 'Настройки', icon: Settings, path: '/settings' },
];

export default function Sidebar({
    user,
    onLogout,
}) {
    const { mode } = useViewMode();
    const [menuOpen, setMenuOpen] = useState(false);

    const [collapsed, setCollapsed] = useState(
        () => localStorage.getItem('sidebarCollapsed') === 'true'
    );

    function toggleSidebar() {
        const next = !collapsed;

        setCollapsed(next);
        localStorage.setItem('sidebarCollapsed', String(next));
    }

    const displayName = user?.displayName || 'Пользователь';
    const roleName = roleNames[user?.role] || user?.role || 'Неизвестная роль';

    const initials = getInitials(displayName, '');

    return (
        <>
            {menuOpen && (
                <button
                    type="button"
                    className="sidebar-overlay"
                    onClick={() => setMenuOpen(false)}
                    aria-label="Закрыть меню"
                />
            )}

            <aside
                className={[
                    'sidebar',
                    collapsed ? 'sidebar-collapsed' : '',
                    menuOpen ? 'sidebar-open' : '',
                ].filter(Boolean).join(' ')}
            >
                <div className="sidebar-brand">
                    <div className="sidebar-brand-text">
                        <div className="sidebar-brand-title">
                            ПЛОЩАДКА
                        </div>

                        <div className="sidebar-brand-subtitle">
                            МЕСТНЫЙ БАРБЕРШОП
                        </div>
                    </div>

                    <button
                        type="button"
                        className="sidebar-collapse-button"
                        onClick={toggleSidebar}
                        title={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
                        aria-label={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
                    >
                        {collapsed
                            ? <PanelLeftOpen size={20} />
                            : <PanelLeftClose size={20} />
                        }
                    </button>

                    <button
                        type="button"
                        className="sidebar-close-button"
                        onClick={() => setMenuOpen(false)}
                        aria-label="Закрыть меню"
                    >
                        <X size={22} />
                    </button>
                </div>

                <nav className="sidebar-navigation" aria-label="Основное меню">
                    {navigation.filter(item => canPreviewPage(mode, item.path)).map((item) => {
                        const Icon = item.icon;

                        return (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                onClick={() => setMenuOpen(false)}
                                title={item.label}
                                className={({ isActive }) =>
                                    `sidebar-nav-item ${isActive ? 'sidebar-nav-active' : ''
                                    }`
                                }
                            >
                                <Icon size={20} strokeWidth={1.8} />
                                <span>{item.label}</span>
                            </NavLink>
                        );
                    })}
                </nav>

                <div className="sidebar-bottom">
                    <div
                        className="sidebar-profile"
                        title={`${displayName} — ${roleName}`}
                    >
                        <div className="sidebar-avatar">
                            {user?.photo ? (
                                <img
                                    src={user.photo}
                                    alt={displayName}
                                    className="sidebar-avatar-image"
                                />
                            ) : (
                                initials
                            )}
                        </div>

                        <div className="sidebar-profile-info">
                            <div className="sidebar-profile-name">
                                {displayName}
                            </div>

                            <div className="sidebar-profile-role">
                                {roleName}
                            </div>
                        </div>
                    </div>

                    <button
                        type="button"
                        className="sidebar-logout"
                        onClick={onLogout}
                        title="Выйти из аккаунта"
                    >
                        <LogOut size={19} />
                        <span>Выйти из аккаунта</span>
                    </button>
                </div>
            </aside>

            <div className="sidebar-mobile-header">
                <button
                    type="button"
                    className="sidebar-mobile-button"
                    onClick={() => setMenuOpen(true)}
                    aria-label="Открыть меню"
                >
                    <Menu size={23} />
                </button>
            </div>
        </>
    );
}
