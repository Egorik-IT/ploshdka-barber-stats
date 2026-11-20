import PeriodFields from './PeriodFields';
import { getPeriodDates } from '../utils/periods';
import CalculationDetails from './CalculationDetails';
import money from '../utils/formatMoney';
import { calculationNames } from '../../shared/calculationSettings';

function NumberField({ label, value, onChange, max = 100000000 }) {
    return <label>{label}
        <input type="number" min="0" max={max} step="any" value={value ?? ''}
            onChange={event => onChange(event.target.value)} />
    </label>;
}

export default function SalaryCalculationCard({ item, update, load, onRemove, value }) {
    const isManual = item.type === 'manual';
    const isAdmin = item.type === 'admin';
    const isServices = item.type === 'services';
    const isProducts = item.type === 'products';

    function change(values) {
        update(item.id, values);
    }

    function changePeriod(periodPreset) {
        const dates = periodPreset === 'custom' ? {} : getPeriodDates(periodPreset);
        change({ periodPreset, ...dates, loaded: false });
    }

    function changePreset(preset) {
        change({ preset, amount: preset === 'free' ? '' : item[preset] ?? '' });
    }

    function changeCleaning(dayId, cleaning) {
        change({ days: item.days.map(day => day.id === dayId ? { ...day, cleaning } : day) });
    }

    return <section className="salary-calculation">
        <div className="salary-card-heading">
            <h3>{calculationNames[item.type]}</h3>
            <button onClick={onRemove}>Удалить</button>
        </div>
        <div className="salary-fields">
            {!isManual && <PeriodFields period={item.periodPreset} dates={item} disabled={item.loading}
                changePeriod={changePeriod}
                changeDate={(field, date) => change({ [field]: date, periodPreset: 'custom', loaded: false })} />}
            {(isServices || isAdmin) && <NumberField label="Ставка, ₽ / час" value={item.rate}
                onChange={rate => change({ rate })} />}
            {(isServices || isProducts) && <NumberField label="Процент, %" max={100} value={item.percent}
                onChange={percent => change({ percent })} />}
            {isAdmin && <NumberField label="Уборка, ₽ / смена" value={item.cleaningRate}
                onChange={cleaningRate => change({ cleaningRate })} />}
            {isManual && <>
                {item.category === 'admin' && <label>Начисление
                    <select value={item.preset} onChange={event => changePreset(event.target.value)}>
                        <option value="free">Свободная сумма</option>
                        <option value="seniorBonus">Премия старшего администратора</option>
                        <option value="contentBonus">Премия за контент</option>
                    </select>
                </label>}
                <NumberField label="Сумма, ₽" value={item.amount} onChange={amount => change({ amount })} />
            </>}
            {isServices && <label>Система оплаты
                <select value={item.mode} onChange={event => change({ mode: event.target.value })}>
                    <option value="period">Максимум за период</option>
                    <option value="daily">Максимум за каждый день</option>
                </select>
            </label>}
        </div>
        {!isManual && <button className="salary-load-button" disabled={item.loading} onClick={() => load(item)}>
            {item.loading ? 'Загрузка…' : 'Загрузить данные за период'}
        </button>}
        {item.error && <p className="report-error">{item.error}</p>}
        {item.loaded && isAdmin && <>
            <p className="report-note">Часы по рабочим интервалам YCLIENTS. Уборка отмечена для начала рабочего дня филиала.</p>
            {item.days.map(day => <div className="salary-shift" key={day.id}>
                <span>{day.date} · {day.branchName}</span>
                <span>{day.from || '—'}–{day.to || '—'} · {day.hours.toFixed(2)} ч</span>
                <label className="salary-cleaning">
                    <input type="checkbox" checked={day.cleaning}
                        onChange={event => changeCleaning(day.id, event.target.checked)} />Уборка
                </label>
            </div>)}
        </>}
        {item.loaded && isProducts && <p>Продажи косметики: {money(item.amount)}</p>}
        {item.loaded && <CalculationDetails item={item} />}
        <div className="salary-result">
            {value === null ? 'Заполните параметры и загрузите данные' : money(value)}
        </div>
    </section>;
}
