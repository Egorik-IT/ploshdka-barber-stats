import { ask, askPassword } from '../utils/prompts.js';
import { roleNames } from '../../shared/users.js';

import bcrypt from 'bcryptjs';
import pool from '../config/db.js';

// Разрешённые роли
const roles = {
    1: 'manager',
    2: 'admin',
    3: 'employee',
};

async function createUser() {
    try {
        console.log('\n=== СОЗДАНИЕ ПОЛЬЗОВАТЕЛЯ ===\n');

        const username = await ask('Логин: ');
        const displayName = await ask('Отображаемое имя: ');

        if (!username || !displayName) {
            throw new Error('Логин и имя обязательны.');
        }

        // Выбор роли
        console.log('\nВыберите роль:');
        console.log('1. Руководитель');
        console.log('2. Администратор');
        console.log('3. Сотрудник');

        const roleChoice = await ask('\nНомер роли: ');
        const roleName = roles[roleChoice];

        if (!roleName) {
            throw new Error('Некорректная роль.');
        }

        // Ввод пароля
        const password = await askPassword('\nПароль: ');
        const passwordRepeat = await askPassword(
            'Повторите пароль: '
        );

        if (password.length < 12) {
            throw new Error(
                'Пароль должен содержать минимум 12 символов.'
            );
        }

        if (password !== passwordRepeat) {
            throw new Error('Пароли не совпадают.');
        }

        // Проверяем наличие роли в PostgreSQL
        const roleResult = await pool.query(
            `SELECT id
             FROM roles
             WHERE name = $1`,
            [roleName]
        );

        if (roleResult.rows.length === 0) {
            throw new Error(
                `Роль ${roleName} не найдена в базе.`
            );
        }

        const roleId = roleResult.rows[0].id;

        // Хешируем пароль
        const passwordHash = await bcrypt.hash(password, 12);

        // Создаём пользователя
        const result = await pool.query(
            `INSERT INTO users (
                username,
                password_hash,
                display_name,
                role_id,
                is_active,
                permissions_override
            )
            VALUES ($1, $2, $3, $4, TRUE, '{}'::jsonb)
            RETURNING
                id,
                username,
                display_name,
                role_id,
                is_active,
                created_at`,
            [
                username,
                passwordHash,
                displayName,
                roleId,
            ]
        );

        console.log('\nПользователь успешно создан!');
        console.table({
            ...result.rows[0],
            role: roleNames[roleName],
        });

    } catch (error) {
        if (error.code === '23505') {
            console.error(
                '\nОшибка: такой логин уже существует.'
            );
        } else {
            console.error('\nОшибка:', error.message);
        }
    } finally {
        await pool.end();
    }
}

createUser();
