import { useState } from 'react';
import ReportBarChart from './ReportBarChart';

const metrics = { visits: 'Выполненные визиты', noShows: 'Неявки', services: 'Оказанные услуги' };

export default function ActivityChart({ days = [], revenueOnly = false }) {
    const [metric, setMetric] = useState('visits');
    const field = revenueOnly ? 'revenue' : metric;
    const monthly = days.length > 45;
    const grouped = new Map();
    for (const day of days) {
        const key = monthly ? day.date.slice(0, 7) : day.date;
        grouped.set(key, (grouped.get(key) || 0) + Number(day[field] || 0));
    }
    const data = [...grouped].map(([date, value]) => ({ id: date, value,
        label: monthly ? `${date.slice(5, 7)}.${date.slice(0, 4)}` : `${date.slice(8, 10)}.${date.slice(5, 7)}` }));
    return <div className="report-section">
        {!revenueOnly && <div className="report-tabs" role="group" aria-label="Показатель графика">
            {Object.entries(metrics).map(([key, label]) => <button key={key} aria-pressed={metric === key} onClick={() => setMetric(key)}>{label}</button>)}
        </div>}
        <ReportBarChart title={revenueOnly ? 'Выручка услуг по времени' : metrics[field]} data={data} unit={revenueOnly ? '₽' : ''}
            description={`${monthly ? 'По месяцам' : 'По дням'} выбранного периода. ${revenueOnly ? 'Стоимость услуг выполненных визитов; косметика и ручные выплаты не включены.' : 'Визиты считаются по записям, а не по уникальным клиентам. Услуги — только в выполненных визитах.'}`} />
    </div>;
}
