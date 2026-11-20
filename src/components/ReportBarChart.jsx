import { useId } from 'react';
import './ReportBarChart.css';

export default function ReportBarChart({ title, description, data, unit = '' }) {
    const titleId = useId();
    const rows = data.filter(row => row.value != null && Number.isFinite(Number(row.value)));
    const maximum = Math.max(1, ...rows.map(row => Math.abs(Number(row.value))));
    const format = value => `${Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ''}`;
    return <section className="report-chart" aria-labelledby={titleId}>
        <h3 id={titleId}>{title}</h3>
        {description && <p className="report-note">{description}</p>}
        {!rows.length ? <p>Нет данных для построения графика.</p> : <>
            {rows.every(row => Number(row.value) === 0) && <p className="report-note">За выбранный период значения равны нулю.</p>}
            <ul className="report-chart-bars">
                {rows.map((row, index) => <li key={row.id ?? index}>
                    <span className="report-chart-label">{row.label}</span>
                    <div className="report-chart-track" aria-hidden="true">
                        <div className={row.value < 0 ? 'report-chart-bar is-negative' : 'report-chart-bar'}
                            style={{ width: `${Math.abs(Number(row.value)) / maximum * 100}%` }} />
                    </div>
                    <span className="report-chart-value">{format(row.value)}</span>
                </li>)}
            </ul>
            {rows.some(row => row.value < 0) && <p className="report-note">Отрицательные значения отмечены знаком «−»; длина полосы показывает модуль суммы.</p>}
        </>}
    </section>;
}
