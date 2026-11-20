import { useState } from 'react';
import { getPeriodDates } from '../utils/periods';

export default function usePeriod() {
    const [period, setPeriod] = useState('currentMonth');
    const [dates, setDates] = useState(() => getPeriodDates('currentMonth'));

    function changePeriod(value) {
        setPeriod(value);
        if (value !== 'custom') setDates(getPeriodDates(value));
    }

    function changeDate(field, value) {
        setPeriod('custom');
        setDates(current => ({ ...current, [field]: value }));
    }

    const invalidDates = !dates.start || !dates.end || dates.start > dates.end;
    return { period, dates, changePeriod, changeDate, invalidDates };
}
