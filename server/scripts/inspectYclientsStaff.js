
import 'dotenv/config';

const API_URL = 'https://api.yclients.com/api/v1';

const partnerToken = process.env.YCLIENTS_PARTNER_TOKEN;
const userToken = process.env.YCLIENTS_USER_TOKEN;
const companyId = process.argv[2];

if (!partnerToken || !userToken) {
    console.error('Не найдены токены YCLIENTS в .env');
    process.exit(1);
}

if (!companyId || !/^[1-9]\d*$/.test(companyId)) {
    console.error(
        'Использование: node server/scripts/inspectYclientsStaff.js COMPANY_ID'
    );
    process.exit(1);
}

// Скрываем значения персональных данных.
// Для диагностики нам нужны только названия полей и типы.
function maskData(value, depth = 0) {
    if (depth > 10) {
        return '[MAX_DEPTH]';
    }

    if (value === null || value === undefined) {
        return null;
    }

    if (Array.isArray(value)) {
        return {
            type: 'array',
            length: value.length,
            sample: value.slice(0, 2).map(item =>
                maskData(item, depth + 1)
            ),
        };
    }

    if (typeof value === 'object') {
        const result = {};

        for (const [key, fieldValue] of Object.entries(value)) {
            result[key] = maskData(fieldValue, depth + 1);
        }

        return result;
    }

    if (typeof value === 'string') {
        return value.trim()
            ? '[STRING]'
            : '[EMPTY_STRING]';
    }

    if (typeof value === 'number') {
        return '[NUMBER]';
    }

    if (typeof value === 'boolean') {
        return '[BOOLEAN]';
    }

    return '[UNKNOWN]';
}

function describeName(value) {
    if (typeof value !== 'string' || !value.trim()) {
        return 'пусто';
    }

    const words = value.trim().split(/\s+/);

    return `${words.length} слов(а)`;
}

function hasValue(value) {
    if (typeof value === 'string') {
        return value.trim().length > 0;
    }

    return value !== null && value !== undefined;
}

async function requestYclients(path) {
    const controller = new AbortController();

    const timeout = setTimeout(() => {
        controller.abort();
    }, 20000);

    try {
        const response = await fetch(
            `${API_URL}${path}`,
            {
                method: 'GET',
                headers: {
                    Accept: 'application/vnd.yclients.v2+json',
                    Authorization:
                        `Bearer ${partnerToken}, User ${userToken}`,
                },
                signal: controller.signal,
            }
        );

        const raw = await response.text();

        let payload;

        try {
            payload = JSON.parse(raw);
        } catch {
            console.error(
                'API вернул ответ, который не является JSON.'
            );

            console.log('HTTP STATUS:', response.status);

            return null;
        }

        console.log('HTTP STATUS:', response.status);

        if (!response.ok || payload.success === false) {
            console.error('Ошибка API:');

            console.log(
                JSON.stringify(maskData(payload), null, 2)
            );

            return null;
        }

        return payload;
    } catch (error) {
        console.error(
            'Ошибка запроса:',
            error.name === 'AbortError'
                ? 'Превышено время ожидания'
                : error.message
        );

        return null;
    } finally {
        clearTimeout(timeout);
    }
}

function extractStaffList(payload) {
    if (Array.isArray(payload?.data)) {
        return payload.data;
    }

    if (Array.isArray(payload?.data?.staff)) {
        return payload.data.staff;
    }

    if (Array.isArray(payload?.data?.items)) {
        return payload.data.items;
    }

    return [];
}

function inspectStaff(staff, index) {
    const user = staff.user ?? {};
    const position = staff.position;

    console.log(`\nСотрудник №${index + 1}`);

    console.log({
        staffName: describeName(staff.name),
        userName: describeName(user.name),
        firstname: describeName(user.firstname),

        lastname: describeName(
            user.lastname ?? staff.lastname
        ),

        surname: describeName(
            user.surname ?? staff.surname
        ),

        patronymic: describeName(
            user.patronymic ?? staff.patronymic
        ),

        middlename: describeName(
            user.middlename ?? staff.middlename
        ),

        hasPhone: hasValue(
            staff.phone ?? user.phone
        ),

        hasEmail: hasValue(
            staff.email ?? user.email
        ),

        hasPosition: hasValue(
            typeof position === 'object'
                ? position?.title
                : position
        ),

        hasSpecialization: hasValue(
            staff.specialization
        ),

        hasPhoto: hasValue(
            staff.avatar_big ?? staff.avatar
        ),

        hasInformation: hasValue(
            staff.information
        ),
    });
}

async function main() {
    console.log('====================================');
    console.log('YCLIENTS STAFF INSPECTOR');
    console.log('====================================');
    console.log('Токены: настроены');
    console.log('Company ID: [HIDDEN]');

    // -----------------------------------------
    // 1. Новый API: список сотрудников
    // -----------------------------------------

    console.log('\n=== 1. СПИСОК СОТРУДНИКОВ ===');

    const listResponse = await requestYclients(
        `/company/${companyId}/staff`
    );

    if (!listResponse) {
        console.log(
            'Не удалось получить сотрудников через новый API.'
        );
        return;
    }

    const staffList = extractStaffList(listResponse);

    console.log(
        'Количество сотрудников:',
        staffList.length
    );

    if (staffList.length === 0) {
        console.log(
            '\nAPI ответил успешно, но список сотрудников не найден.'
        );

        console.log(
            '\nСТРУКТУРА ОТВЕТА:'
        );

        console.log(
            JSON.stringify(maskData(listResponse), null, 2)
        );

        return;
    }

    // -----------------------------------------
    // 2. Проверяем ФИО и контакты
    // -----------------------------------------

    console.log('\n=== 2. ПРОВЕРКА ДАННЫХ ===');

    for (const [index, staff] of staffList
        .slice(0, 10)
        .entries()) {
        inspectStaff(staff, index);
    }

    // -----------------------------------------
    // 3. Полная структура первого сотрудника
    // -----------------------------------------

    console.log(
        '\n=== 3. СТРУКТУРА СОТРУДНИКА ==='
    );

    console.log(
        JSON.stringify(
            maskData(staffList[0]),
            null,
            2
        )
    );

    // -----------------------------------------
    // 4. Подробная карточка сотрудника
    // -----------------------------------------

    const staffId = String(staffList[0]?.id ?? '');

    if (!/^[1-9]\d*$/.test(staffId)) {
        console.log(
            '\nНе удалось определить ID сотрудника.'
        );
        return;
    }

    console.log(
        '\n=== 4. ПОДРОБНАЯ КАРТОЧКА СОТРУДНИКА ==='
    );

    const detailResponse = await requestYclients(
        `/company/${companyId}/staff/${staffId}`
    );

    if (!detailResponse) {
        console.log(
            'Не удалось получить подробную карточку.'
        );
        return;
    }

    console.log(
        '\nСТРУКТУРА ПОДРОБНОЙ КАРТОЧКИ:'
    );

    console.log(
        JSON.stringify(
            maskData(
                detailResponse.data ?? detailResponse
            ),
            null,
            2
        )
    );

    console.log(
        '\n===================================='
    );

    console.log('ПРОВЕРКА ЗАВЕРШЕНА');

    console.log('====================================');
}

main().catch(error => {
    console.error(
        'Непредвиденная ошибка:',
        error.message
    );

    process.exitCode = 1;
});
