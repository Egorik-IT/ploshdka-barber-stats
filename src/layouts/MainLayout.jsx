
import { Outlet } from 'react-router-dom';

import Sidebar from '../components/Sidebar';
import './MainLayout.css';

export default function MainLayout({
    user,
    onLogout,
    theme,
    toggleTheme,
}) {
    return (
        <div
            className="main-layout"
            data-dashboard-theme={theme === 'light' ? 'light' : 'dark'}
        >
            <Sidebar
                user={user}
                onLogout={onLogout}
                theme={theme}
                toggleTheme={toggleTheme}
            />

            <main className="main-layout-content">
                <Outlet />
            </main>
        </div>
    );
}
