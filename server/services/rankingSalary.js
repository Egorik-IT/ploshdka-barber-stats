import { calculateServicePay } from '../../shared/salary.js';

export function rankingSalary(data, user) {
    const hours = data.days.reduce((sum, day) => sum + Number(day.hours), 0);
    const revenue = data.days.reduce((sum, day) => sum + Number(day.services || 0), 0);
    const details = { hours, revenue, rate:user.rates.rate, percent:user.rates.servicePercent,
        hourlyMinimum:null, serviceCommission:null };
    let salaryError = null;
    try {
        details.hourlyMinimum = calculateServicePay({hours,revenue,rate:user.rates.rate,percent:0}).hourlyMinimum;
    } catch { /* Missing minimum does not hide a known service commission. */ }
    try {
        if (!user.category || user.category === 'admin') throw new Error('Нет категории барбера');
        details.serviceCommission = calculateServicePay({hours,revenue,rate:0,percent:user.rates.servicePercent}).serviceCommission;
    } catch (error) { salaryError = error.message; }
    return { commission:details.serviceCommission, salaryBreakdown:details, salaryError };
}
