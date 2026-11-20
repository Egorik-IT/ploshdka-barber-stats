import { fetchCollection, requestYclients } from './yclientsApi.js';

const clientFields = ['id', 'name', 'display_name', 'surname', 'patronymic', 'phone', 'email', 'comment', 'birth_date', 'sex', 'visits', 'spent', 'paid', 'balance', 'categories', 'custom_fields', 'avatar', 'avatar_big', 'photo'];

export async function fetchDirectory(branch, onProgress = () => {}, request = requestYclients) {
    const company = branch.yclientsCompanyId;
    const sources = [
        // Search не возвращает comment даже при явном указании fields.
        ['clients', page => request(`/clients/${company}?page=${page}&count=200`), true],
        ['services', () => request(`/company/${company}/services`), false],
        ['goods', page => request(`/goods/${company}?page=${page}&count=100`), true],
    ];
    const snapshots = {};
    for (const [kind, requestPage, paginated] of sources) {
        onProgress(kind, 0);
        let items = await fetchCollection(requestPage, {
            paginated, onProgress: count => onProgress(kind, count),
        });
        if (kind === 'clients') items = items.map(item => Object.fromEntries(
            clientFields.filter(field => item[field] !== undefined).map(field => [field, item[field]])
        ));
        snapshots[kind] = items;
    }
    return snapshots;
}

export async function saveDirectory(client, branch, snapshots) {
    const company = branch.yclientsCompanyId;
    const counts = {};
    for (const [kind, items] of Object.entries(snapshots)) {

        await client.query('DELETE FROM yclients_directory WHERE branch_id=$1 AND kind=$2', [branch.id, kind]);
        for (let offset = 0; offset < items.length; offset += 500) {
            await client.query(`INSERT INTO yclients_directory (branch_id,company_id,kind,external_id,data)
                SELECT $1,$2,$3,item->>'id',item FROM jsonb_array_elements($4::jsonb) item`,
            [branch.id, company, kind, JSON.stringify(items.slice(offset, offset + 500))]);
        }
        counts[kind] = items.length;
    }
    await client.query(`INSERT INTO yclients_directory_sync (branch_id,company_id) VALUES ($1,$2)
        ON CONFLICT (branch_id) DO UPDATE SET company_id=EXCLUDED.company_id,synced_at=NOW()`, [branch.id, company]);
    return counts;
}

export async function syncDirectory(client, branch, onProgress, request) {
    return saveDirectory(client, branch, await fetchDirectory(branch, onProgress, request));
}
