export const calculationNames = { services: 'Услуги', products: 'Косметика', admin: 'Зарплата администратора', manual: 'Свободное начисление' };
export const calculationFields = {
    rate: 'Ставка, ₽ / час', servicePercent: 'Процент с услуг', productPercent: 'Процент с косметики',
    cleaningRate: 'Уборка, ₽ / смена', seniorBonus: 'Премия старшего администратора, ₽', contentBonus: 'Премия за контент, ₽',
};
export const calculationCategories = { barber: 'Барбер', expert: 'Эксперт-барбер', top: 'Топ-барбер', admin: 'Администратор' };
export function fieldsForCategory(category) {
    const keys = category === 'admin'
        ? ['rate', 'productPercent', 'cleaningRate', 'seniorBonus', 'contentBonus']
        : ['barber', 'expert', 'top'].includes(category)
            ? ['rate', 'servicePercent', 'productPercent']
            : ['rate', 'productPercent'];
    return keys.map(key => [key, calculationFields[key]]);
}
export function staffCategory(staff) {
    const text = `${staff.specialization || ''} ${staff.position || ''}`.normalize('NFKC').trim().toLocaleLowerCase('ru-RU');
    if (/админ|administrator/.test(text)) return 'admin';
    if (/топ|\btop\b/.test(text)) return 'top';
    if (/эксперт|expert/.test(text)) return 'expert';
    if (/барбер|barber/.test(text)) return 'barber';
    return null;
}
export function emptyCalculationSettings() {
    return Object.fromEntries(Object.keys(calculationFields).map(key => [key, null]));
}
export function normalizeCalculationSettings(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Некорректные параметры');
    return Object.fromEntries(Object.keys(calculationFields).map(key => {
        const input = value[key];
        const number = input == null || input === '' ? null : Number(input);
        if (number !== null && (!['number', 'string'].includes(typeof input) || !Number.isFinite(number) || number < 0 || number > (key.endsWith('Percent') ? 100 : 100000000))) throw new Error(`Некорректное значение: ${calculationFields[key]}`);
        return [key, number];
    }));
}

// Пустое поле наследует базовое значение; ноль является явной ставкой.
export function resolveCalculationRates(category, overrides = {}, defaults = {}) {
    return Object.fromEntries(fieldsForCategory(category).map(([key]) => [key, overrides[key] ?? defaults[key] ?? null]));
}
