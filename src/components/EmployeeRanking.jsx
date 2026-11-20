import ReportBarChart from './ReportBarChart';
import { useState } from 'react';
import RankingSalary from './RankingSalary';

export default function EmployeeRanking({ result, mode }) {
    const [metric, setMetric] = useState(mode === 'manager' ? 'commission' : 'services');
    const [serviceId, setServiceId] = useState('');
    const labels = {
        ...(mode === 'manager' ? { commission: 'Заработок по проценту с услуг' } : {}),
        services: 'Количество услуг', hours: 'Отработанные часы', products: 'Продажи косметики',
    };
    function value(row) {
        return metric === 'services' && serviceId ? row.serviceCounts[serviceId] || 0 : row[metric];
    }
    const rows = result.rows.filter(row => metric !== 'commission' || row.category !== 'admin')
        .sort((first, second) => (value(second) ?? -1) - (value(first) ?? -1));

    return <>
        <div className="report-filters statistics-ranking-filters">
            <label>Показатель<select value={metric} onChange={event => setMetric(event.target.value)}>
                {Object.entries(labels).map(([key, title]) => <option key={key} value={key}>{title}</option>)}
            </select></label>
            {metric === 'services' && <label>Услуга<select value={serviceId} onChange={event => setServiceId(event.target.value)}>
                <option value="">Все услуги</option>
                {result.services.map(service => <option key={service.id} value={service.id}>{service.title}</option>)}
            </select></label>}
        </div>
        {metric === 'commission' && <p className="report-note">Место в рейтинге определяется заработком с услуг: выручка × процент. Минимум за часы показан слева для сравнения. Косметика и премии не включены. Утверждённые ставки сотрудника имеют приоритет перед параметрами категории сети. Личные настройки пробного калькулятора не учитываются.</p>}
        {metric === 'services' && <p className="report-note">Варианты одной услуги объединены: описания ваксинга, варианты написания удлинённой стрижки и цены «счастливых часов». Комплексы и разные процедуры считаются отдельно.</p>}
        <ReportBarChart title={`Сравнение сотрудников: ${labels[metric].toLowerCase()}`}
            description="Первые 10 сотрудников по выбранному показателю. Полный список — в таблице ниже. Неизвестные значения не отображаются."
            unit={metric === 'commission' || metric === 'products' ? '₽' : metric === 'hours' ? 'ч' : ''}
            data={rows.filter(row => value(row) != null).slice(0, 10).map(row => ({ id: row.id, label: row.name, value: value(row) }))} />
        <div className="clients-table-wrap"><table className="clients-table">
            <thead><tr><th>Место</th><th>Сотрудник</th><th>{labels[metric]}</th></tr></thead>
            <tbody>{rows.map((row, index) => <tr key={row.id}>
                <td>{index + 1}</td><td>{row.name}<small className="employee-category-label">{row.categoryLabel}</small></td>
                <td>{metric === 'commission' ? <RankingSalary row={row} /> : value(row) == null ? '—' : Number(value(row)).toLocaleString('ru-RU', { maximumFractionDigits: 2 })}</td>
            </tr>)}</tbody>
        </table></div>
    </>;
}
