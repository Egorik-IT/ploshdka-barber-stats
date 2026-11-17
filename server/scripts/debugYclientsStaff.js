
import 'dotenv/config';

const companyId = process.argv[2];
const staffId = process.argv[3];

if (!/^\d+$/.test(companyId || '') || !/^\d+$/.test(staffId || '')) {
    console.error(
        'Использование: node server/scripts/debugYclientsStaff.js COMPANY_ID STAFF_ID'
    );
    process.exit(1);
}

const partnerToken = process.env.YCLIENTS_PARTNER_TOKEN;
const userToken = process.env.YCLIENTS_USER_TOKEN;

if (!partnerToken || !userToken) {
    console.error('Не найдены токены YCLIENTS в .env');
    process.exit(1);
}

const url =
    `https://api.yclients.com/api/v1/company/${companyId}/staff/${staffId}`;

try {
    const response = await fetch(url, {
        headers: {
            Authorization: `Bearer ${partnerToken}, User ${userToken}`,
            Accept: 'application/vnd.yclients.v2+json',
        },
        signal: AbortSignal.timeout(20000),
    });

    const payload = await response.json();

    console.log('\nHTTP STATUS:', response.status);

    if (!response.ok || payload.success === false) {
        console.error('Ошибка YCLIENTS:', payload);
        process.exit(1);
    }

    const staff = payload.data ?? payload;

    console.log('\n========== ПОЛНЫЙ СОТРУДНИК ==========\n');
    console.log(JSON.stringify(staff, null, 2));

    console.log('\n========== ПОЛЯ ФИО ==========\n');
    console.log(JSON.stringify({
        staffName: staff.name,
        employeeName: staff.employee?.name,
        firstname: staff.employee?.firstname,
        surname: staff.employee?.surname,
        patronymic: staff.employee?.patronymic,
    }, null, 2));

} catch (error) {
    console.error('Ошибка запроса:', error.message);
    process.exitCode = 1;
}
