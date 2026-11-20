// Общие формулы для калькулятора и будущей финансовой сводки.
// Проценты передаются в диапазоне 0–100. Округление — в конце расчёта.
function number(value, label, max = 1e9) {
    if (value === '' || value === null || value === undefined ||
        (typeof value !== 'number' && typeof value !== 'string')) {
        throw new Error(`Заполните поле «${label}»`);
    }
    const result = Number(value);
    if (!Number.isFinite(result) || result < 0 || result > max || String(value).trim() === '') {
        throw new Error(`Некорректное значение: ${label}`);
    }
    return result;
}

function validDate(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
        new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function money(value) {
    const cents = Math.round((value + Number.EPSILON) * 100);
    if (!Number.isSafeInteger(cents)) throw new Error('Сумма слишком большая');
    return cents / 100;
}

export function calculateServicePay({ hours, revenue, rate, percent }) {
    const hourlyMinimum = money(number(hours, 'Часы') * number(rate, 'Почасовая ставка'));
    const serviceCommission = money(number(revenue, 'Стоимость услуг') * number(percent, 'Процент с услуг', 100) / 100);
    return { hourlyMinimum, serviceCommission, total: Math.max(hourlyMinimum, serviceCommission) };
}

export function calculateSalary(calculation) {
    const { type, start, end } = calculation;
    if (type === 'manual') return money(number(calculation.amount, 'Сумма'));
    if (!validDate(start) || !validDate(end) || start > end) {
        throw new Error('Укажите корректный период');
    }


    if (type === 'products') {
        return money(number(calculation.amount, 'Продажи косметики') *
            number(calculation.percent, 'Процент с косметики', 100) / 100);
    }
    if (type !== 'services' && type !== 'admin') throw new Error('Неизвестный тип расчёта');
    if (!Array.isArray(calculation.days) || calculation.days.length === 0) {
        throw new Error('Добавьте хотя бы одну смену');
    }

    const rate = number(calculation.rate, 'Почасовая ставка');
    const days = new Map();
    let hours = 0;
    let cleanings = 0;
    for (const day of calculation.days) {
        if (!validDate(day.date) || day.date < start || day.date > end) {
            throw new Error('Даты смен должны входить в выбранный период');
        }
        const dayHours = number(day.hours, 'Часы смены', 24);
        hours += dayHours;
        if (type === 'admin') {
            if (typeof day.cleaning !== 'boolean') throw new Error('Некорректная отметка уборки');
            if (day.cleaning) cleanings++;
        } else {
            const revenue = number(day.services, 'Стоимость услуг');
            const previous = days.get(day.date) || { hours: 0, services: 0 };
            days.set(day.date, { hours: previous.hours + dayHours, services: previous.services + revenue });
        }
    }

    if (type === 'admin') {
        return money(hours * rate + cleanings * number(calculation.cleaningRate, 'Оплата уборки') +
            number(calculation.bonus, 'Надбавки'));
    }

    const percent = number(calculation.percent, 'Процент с услуг', 100) / 100;
    const values = [...days.values()];
    if (calculation.mode === 'daily') {
        return money(values.reduce((sum, day) => sum + Math.max(day.hours * rate, day.services * percent), 0));
    }
    if (calculation.mode !== 'period') throw new Error('Выберите систему оплаты');
    return calculateServicePay({ hours, revenue: values.reduce((sum, day) => sum + day.services, 0), rate, percent: calculation.percent }).total;
}

export function sumSalaries(amounts) {
    return money(amounts.reduce((sum, amount) => sum + number(amount, 'Результат расчёта', Number.MAX_SAFE_INTEGER / 100), 0));
}
