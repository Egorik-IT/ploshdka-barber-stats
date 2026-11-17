
import { Check, ChevronDown, ChevronRight } from 'lucide-react';
import { getStaffForBranch } from '../utils/yclients';

function getInitials(name) {
    const parts = String(name || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    if (parts.length === 0) {
        return '?';
    }

    if (parts.length === 1) {
        return parts[0].slice(0, 2).toUpperCase();
    }

    return (
        parts[0][0] + parts[1][0]
    ).toUpperCase();
}

function StaffAvatar({ employee }) {
    const name = employee.fullName || employee.name;

    return (
        <span className="users-staff-avatar">
            <span className="users-staff-avatar-initials">
                {getInitials(name)}
            </span>

            {employee.photoUrl && (
                <img
                    src={employee.photoUrl}
                    alt=""
                    className="users-staff-avatar-image"
                    loading="lazy"
                    onError={event => {
                        event.currentTarget.style.display = 'none';
                    }}
                />
            )}
        </span>
    );
}

export default function YclientsStaffBranches({
    branches,
    staff,
    links,
    search,
    expandedBranches,
    onToggleBranch,
    onToggleStaff,
    disabled,
    emptyMessage,
}) {
    return (
        <div className="users-staff-branches">
            {branches.map(branch => {
                const branchStaff = getStaffForBranch(
                    staff,
                    branch.id,
                    search
                );

                const selectedLink = links.find(
                    link =>
                        String(link.branchId) === String(branch.id)
                );

                const expanded =
                    Boolean(expandedBranches[String(branch.id)]) ||
                    Boolean(search.trim());

                return (
                    <div
                        key={branch.id}
                        className="users-staff-branch"
                    >
                        <button
                            type="button"
                            className="users-staff-branch-toggle"
                            onClick={() => onToggleBranch(branch.id)}
                            aria-expanded={expanded}
                        >
                            {expanded
                                ? <ChevronDown size={17} />
                                : <ChevronRight size={17} />}

                            <span className="users-staff-branch-name">
                                {branch.name}
                            </span>

                            <span className="users-staff-branch-count">
                                {branchStaff.length}
                            </span>

                            {selectedLink && (
                                <Check
                                    size={16}
                                    className="users-staff-branch-selected"
                                />
                            )}
                        </button>

                        {expanded && (
                            <div className="users-staff-list">
                                {branchStaff.length === 0 ? (
                                    <p className="users-staff-empty">
                                        {search.trim()
                                            ? 'По вашему запросу сотрудники не найдены.'
                                            : emptyMessage}
                                    </p>
                                ) : (
                                    branchStaff.map(employee => {
                                        const selected =
                                            String(selectedLink?.staffId) ===
                                            String(employee.staffId);

                                        const fullName =
                                            employee.fullName ||
                                            employee.name;

                                        return (
                                            <button
                                                key={`${employee.branchId}-${employee.staffId}`}
                                                type="button"
                                                className={
                                                    selected
                                                        ? 'users-staff-item users-staff-item-selected'
                                                        : 'users-staff-item'
                                                }
                                                onClick={() =>
                                                    onToggleStaff(
                                                        branch.id,
                                                        employee.staffId
                                                    )
                                                }
                                                aria-pressed={selected}
                                                disabled={disabled}
                                            >
                                                <StaffAvatar employee={employee} />

                                                <span className="users-staff-item-info">
                                                    <strong>
                                                        {fullName}
                                                    </strong>

                                                    <span>
                                                        {employee.position ||
                                                            'Должность не указана'}
                                                    </span>

                                                    {employee.specialization && (
                                                        <span className="users-staff-item-specialization">
                                                            {employee.specialization}
                                                        </span>
                                                    )}

                                                    <small>
                                                        ID: {employee.staffId}
                                                    </small>
                                                </span>

                                                <span className="users-staff-item-check">
                                                    {selected && (
                                                        <Check size={17} />
                                                    )}
                                                </span>
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
