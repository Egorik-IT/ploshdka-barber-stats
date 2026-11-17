export async function loadPermissionOverrides(client, userId) {
    const result = await client.query(
        `SELECT
            permission_code AS code,
            is_allowed AS "isAllowed"
         FROM user_permissions
         WHERE user_id = $1`,
        [userId]
    );

    return Object.fromEntries(result.rows.map(row => [row.code, row.isAllowed]));
}
