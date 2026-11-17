import readline from 'node:readline';
import process from 'node:process';

// Обычный ввод
export function ask(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise(resolve => {
        rl.question(question, answer => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

// Ввод пароля со скрытием символов
export function askPassword(question, {
    pauseOnFinish = true,
    newlineOnCancel = true,
    promptBeforeCheck = false,
} = {}) {
    return new Promise((resolve, reject) => {
        const stdin = process.stdin;

        if (promptBeforeCheck) process.stdout.write(question);

        if (!stdin.isTTY) {
            return reject(
                new Error('Запустите скрипт в обычном терминале.')
            );
        }

        if (!promptBeforeCheck) process.stdout.write(question);

        stdin.setRawMode(true);
        stdin.resume();

        let password = '';

        function finish() {
            stdin.removeListener('data', onData);
            stdin.setRawMode(false);
            if (pauseOnFinish) stdin.pause();
            process.stdout.write('\n');
            resolve(password);
        }

        function onData(chunk) {
            const key = chunk.toString();

            if (key === '\u0003') {
                stdin.setRawMode(false);
                if (newlineOnCancel) process.stdout.write('\n');
                process.exit(130);
            }

            if (key === '\r' || key === '\n') {
                finish();
                return;
            }

            if (key === '\u007f' || key === '\b') {
                password = password.slice(0, -1);
                process.stdout.write('\b \b');
                return;
            }

            if (key.length === 1 && key >= ' ') {
                password += key;
                process.stdout.write('*');
            }
        }

        stdin.on('data', onData);
    });
}

