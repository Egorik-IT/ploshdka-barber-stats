
import {
    Wallet,
    CalendarDays,
    Users,
    Store,
} from 'lucide-react';

import './DashboardPage.css';

const stats = [
    { title: 'Выручка за сегодня', icon: Wallet },
    { title: 'Записи сегодня', icon: CalendarDays },
    { title: 'Сотрудники', icon: Users },
    { title: 'Филиалы', icon: Store },
];

export default function DashboardPage({ user }) {
    const displayName = user?.displayName || 'Пользователь';

    return (
        <div className="dashboard-content">
            <div className="dashboard-heading">
                <h1>Главная</h1>
                <p>Здравствуйте, {displayName}!</p>
            </div>

            <section className="dashboard-section">
                <div className="dashboard-section-heading">
                    <h2>Обзор</h2>
                </div>

                <div className="dashboard-stats-grid">
                    {stats.map((stat) => {
                        const Icon = stat.icon;

                        return (
                            <div
                                className="dashboard-stat-card"
                                key={stat.title}
                            >
                                <div className="dashboard-stat-top">
                                    <span>{stat.title}</span>

                                    <div className="dashboard-stat-icon">
                                        <Icon
                                            size={20}
                                            strokeWidth={1.8}
                                        />
                                    </div>
                                </div>

                                <div className="dashboard-stat-value">
                                    —
                                </div>

                                <div className="dashboard-stat-description">
                                    Данные пока не подключены
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>
        </div>
    );
}
