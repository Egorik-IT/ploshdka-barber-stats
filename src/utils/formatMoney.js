const formatter = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' });
export default function formatMoney(value) {
    return formatter.format(value);
}
