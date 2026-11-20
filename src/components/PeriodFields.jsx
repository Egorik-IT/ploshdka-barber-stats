export default function PeriodFields({ period, dates, changePeriod, changeDate, disabled = false }) {
    return (
        <>
            <label>
                Период
                <select disabled={disabled} value={period} onChange={event => changePeriod(event.target.value)}>
                    <option value="previousMonth">Прошлый месяц</option>
                    <option value="currentMonth">Текущий месяц</option>
                    <option value="last30Days">Последние 30 дней</option>
                    <option value="custom">Свой период</option>
                </select>
            </label>
            <label>
                С даты
                <input disabled={disabled} type="date" value={dates.start} max={dates.end || undefined}
                    onChange={event => changeDate('start', event.target.value)} />
            </label>
            <label>
                По дату
                <input disabled={disabled} type="date" value={dates.end} min={dates.start || undefined}
                    onChange={event => changeDate('end', event.target.value)} />
            </label>
        </>
    );
}
