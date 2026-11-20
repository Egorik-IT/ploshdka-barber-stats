export function formatDateInput(date) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')].join('-');
}

export function getPeriodDates(period, today = new Date()) {
    const year = today.getFullYear();
    const month = today.getMonth();
    let start = new Date(year, month, 1);
    let end = today;

    if (period === 'previousMonth') {
        start = new Date(year, month - 1, 1);
        end = new Date(year, month, 0);
    } else if (period === 'last30Days') {
        start = new Date(year, month, today.getDate() - 29);
    }

    return { start: formatDateInput(start), end: formatDateInput(end) };
}
