
export function getStaffForBranch(staffList, branchId, searchText) {
    const search = String(searchText ?? '')
        .trim()
        .toLowerCase();

    return staffList.filter(staff => {
        // Показываем сотрудников только выбранного филиала.
        if (String(staff.branchId) !== String(branchId)) {
            return false;
        }

        // Если строка поиска пустая — показываем всех.
        if (!search) {
            return true;
        }

        // Поля, по которым можно искать сотрудника.
        const searchableFields = [
            staff.fullName,
            staff.name,
            staff.surname,
            staff.firstName,
            staff.patronymic,
            staff.position,
            staff.specialization,
            staff.staffId,
        ];

        return searchableFields.some(value =>
            String(value ?? '')
                .toLowerCase()
                .includes(search)
        );
    });
}

// Повторный выбор снимает привязку, другой сотрудник заменяет её.
// Тип branchId сохраняется таким, каким его передаёт форма.
export function toggleStaffLink(links, branchId, staffId) {
    const branchKey = String(branchId);
    const staffKey = String(staffId);

    const existing = links.find(
        link => String(link.branchId) === branchKey
    );

    const otherLinks = links.filter(
        link => String(link.branchId) !== branchKey
    );

    return existing && String(existing.staffId) === staffKey
        ? otherLinks
        : [
            ...otherLinks,
            {
                branchId,
                staffId: staffKey,
            },
        ];
}
