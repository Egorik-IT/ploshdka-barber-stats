import { ask, askPassword } from '../utils/prompts.js';

import bcrypt from 'bcryptjs';
import pool from '../config/db.js';

function askDeveloperPassword(question) {
    return askPassword(question, {
        pauseOnFinish: false,
        newlineOnCancel: false,
        promptBeforeCheck: true,
    });
}

async function createDeveloper() {
    try {
        console.log('\n=== СОЗДАНИЕ РАЗРАБОТЧИКА ===\n');

        const username = await ask('Логин: ');
        const displayName = await ask('Отображаемое имя: ');
        const password = await askDeveloperPassword('Пароль: ');
        const passwordRepeat = await askDeveloperPassword('Повторите пароль: ');

        if (!username || !displayName) {
            throw new Error('Логин и имя обязательны.');
        }

        if (password.length < 12) {
            throw new Error('Пароль должен содержать минимум 12 символов.');
        }

        if (password !== passwordRepeat) {
            throw new Error('Пароли не совпадают.');
        }

        // Проверяем наличие системной роли
        const roleResult = await pool.query(
            `SELECT id FROM roles WHERE name = 'developer'`
        );

        if (roleResult.rows.length === 0) {
            throw new Error('Роль developer не найдена в базе.');
        }

        const roleId = roleResult.rows[0].id;

        // Создаём хеш пароля
        const passwordHash = await bcrypt.hash(password, 12);

        // Создаём пользователя
        const result = await pool.query(
            `INSERT INTO users
                (username, password_hash, display_name, role_id)
             VALUES ($1, $2, $3, $4)
             RETURNING id, username, display_name, role_id, created_at`,
            [username, passwordHash, displayName, roleId]
        );

        console.log('\nРазработчик успешно создан!');
        console.table(result.rows[0]);

    } catch (error) {
        if (error.code === '23505') {
            console.error('\nОшибка: такой логин уже существует.');
        } else {
            console.error('\nОшибка:', error.message);
        }
    } finally {
        await pool.end();
    }
}

createDeveloper();
