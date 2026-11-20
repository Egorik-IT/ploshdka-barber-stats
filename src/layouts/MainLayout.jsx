import useViewMode, { canPreviewPage } from '../hooks/useViewMode';
import ViewModeTabs from '../components/ViewModeTabs';
import '../styles/reports.css';

import { Outlet, useLocation } from 'react-router-dom';

import Sidebar from '../components/Sidebar';
import './MainLayout.css';

export default function MainLayout({
    user,
    onLogout,
    theme,
}) {
    const { mode, canPreview } = useViewMode();
    const location = useLocation();
    return (
        <div
            className="main-layout"
            data-dashboard-theme={theme === 'light' ? 'light' : 'dark'}
        >
            <Sidebar
                user={user}
                onLogout={onLogout}
            />

            <main className="main-layout-content">
                <ViewModeTabs/>
                {canPreviewPage(mode, location.pathname) ? <Outlet /> : <div className="report-content"><h1>Раздел недоступен в этом режиме</h1><p>{canPreview ? 'Переключите предпросмотр на руководителя или выберите раздел в меню.' : 'Ваша роль не имеет доступа к этому разделу. Выберите раздел в меню.'}</p></div>}
            </main>
        </div>
    );
}
