import { isVisit, serviceAmount } from './reports.js';

// Используем уже загруженные записи; графики не обращаются к YCLIENTS отдельно.
export function dailyActivity(records, start, end) {
    const days = new Map();
    for (let time = Date.parse(start); time <= Date.parse(end); time += 86400000) {
        const date = new Date(time).toISOString().slice(0, 10);
        days.set(date, { date, visits: 0, noShows: 0, services: 0, revenue: 0 });
    }
    for (const record of records) {
        const day = days.get((record.date || record.datetime || '').slice(0, 10));
        if (!day || Number(record.deleted)) continue;
        if (Number(record.attendance) === -1) day.noShows++;
        if (!isVisit(record)) continue;
        day.visits++;
        day.services += (record.services || []).reduce((sum, service) => sum + Number(service.amount ?? 1), 0);
        day.revenue += serviceAmount(record);
    }
    return [...days.values()];
}
