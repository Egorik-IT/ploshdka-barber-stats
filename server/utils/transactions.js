export async function rollbackTransaction(client, message = 'Ошибка отката:') {
    if (!client) return;

    try {
        await client.query('ROLLBACK');
    } catch (error) {
        console.error(message, error);
    }
}
