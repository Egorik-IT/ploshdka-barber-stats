import money from '../utils/formatMoney';
import { calculateServicePay } from '../../shared/salary';

export default function CalculationDetails({ item }) {
    if (!['services', 'admin'].includes(item.type)) return null;
    const hours = item.days.reduce((sum, day) => sum + Number(day.hours), 0);
    const revenue = item.days.reduce((sum, day) => sum + Number(day.services || 0), 0);
    let minimum = null;
    let commission = null;
    try {
        minimum = calculateServicePay({ hours, revenue, rate: item.rate, percent: 0 }).hourlyMinimum;
    } catch { /* Незаполненная ставка: показываем прочерк. */ }
    try {
        commission = calculateServicePay({ hours, revenue, rate: 0, percent: item.percent }).serviceCommission;
    } catch { /* Незаполненный процент: показываем прочерк. */ }
    return <div className="calculation-details">
        <div><span>Часы по графику</span><strong>{hours.toLocaleString('ru-RU',{maximumFractionDigits:2})} ч</strong></div>
        <div><span>За часы · {minimum === null ? '—' : item.rate} ₽/ч</span><strong>{minimum===null?'—':money(minimum)}</strong></div>
        {item.type==='services'&&<>
            <div><span>Выручка услуг сотрудника</span><strong>{money(revenue)}</strong></div>
            <div><span>Барберу по проценту · {commission === null ? '—' : item.percent}%</span><strong>{commission===null?'—':money(commission)}</strong></div>
            <p className="report-note">{item.mode==='daily'?'Итог — сумма дневных максимумов; суммы выше приведены за весь период.':'Итог — большая из сумм за часы и по проценту за весь период.'}</p>
        </>}
    </div>;
}
