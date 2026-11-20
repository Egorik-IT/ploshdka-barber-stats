import money from '../utils/formatMoney';

export default function RankingSalary({ row }) {
    const details=row.salaryBreakdown;
    return <div className="ranking-salary">
        {details&&<div className="ranking-salary-details">
            <span>Минимум за часы: <b>{details.hourlyMinimum===null?'Ставка не задана':money(details.hourlyMinimum)}</b>
                <small>{Number(details.hours).toLocaleString('ru-RU',{maximumFractionDigits:2})} ч × {details.rate==null?'—':money(details.rate)}</small></span>
            <span>Выручка услуг: {money(details.revenue)} × {details.percent??'—'}%</span>
        </div>}
        <strong className="ranking-salary-total">{row.commission==null?row.salaryError||'Процент не задан':money(row.commission)}</strong>
    </div>;
}
