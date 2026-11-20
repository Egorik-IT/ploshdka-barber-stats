function normalizeTitle(title) {
    return String(title || '').normalize('NFKC').trim().toLocaleLowerCase('ru-RU').replace(/ё/g,'е')
        .replace(/\s*([()+:])\s*/g,'$1').replace(/\s+/g,' ').replace(/[.]+$/,'');
}

// Explicit aliases: descriptions, typos and promotional prices for the same service.
// Different procedures and multi-service packages remain separate.
const groups=[
    {title:'Ваксинг',aliases:['Ваксинг','Ваксинг (1 зона)','Ваксинг (удаление волос воском)']},
    {title:'Мужская удлинённая стрижка',aliases:['Мужская удлиненная стрижка','Мужская удлиненнаястрижка']},
    {title:'Мужская стрижка',aliases:['Мужская стрижка']},
    {title:'Hair Tattoo',aliases:['Hair Tattoo']},
];
const aliases=new Map();
for(const group of groups)for(const title of group.aliases)aliases.set(normalizeTitle(title),group.title);

export function serviceGroup(title) {
    let normalized=normalizeTitle(title);
    // Happy-hour prices do not create a different haircut in a quantity ranking.
    if(/^счастливые часы:мужская стрижка(?: за)? \d+(?:[.,]\d+)?\s*[рp₽]$/u.test(normalized))normalized=normalizeTitle('Мужская стрижка');
    const canonical=aliases.get(normalized);
    return {id:canonical?normalizeTitle(canonical):normalized,title:canonical||String(title||'').trim().replace(/\s+/g,' ')};
}
export function serviceKey(title) {
    return serviceGroup(title).id;
}
export function uniqueServices(services) {
    const titles=new Map();
    for(const service of services) {
        const group=serviceGroup(service.title);
        if(group.id&&!titles.has(group.id))titles.set(group.id,group.title);
    }
    return [...titles].map(([id,title])=>({id,title})).sort((a,b)=>a.title.localeCompare(b.title,'ru'));
}
