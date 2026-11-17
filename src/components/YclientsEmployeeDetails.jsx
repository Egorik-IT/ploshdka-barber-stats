
import { UserRound, MapPin, Phone, Mail, BriefcaseBusiness } from 'lucide-react';

function EmployeeAvatar({ employee, name }) {
    const initials = String(name)
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part[0])
        .join('')
        .toUpperCase() || '?';

    return (
        <div className="yclients-details-avatar">
            <span>{initials}</span>

            {employee?.photoUrl && (
                <img
                    src={employee.photoUrl}
                    alt={name}
                    loading="lazy"
                    onError={event => {
                        event.currentTarget.style.display = 'none';
                    }}
                />
            )}
        </div>
    );
}

function DetailField({ label, value, children }) {
    return (
        <div className="yclients-details-field">
            <span className="yclients-details-label">{label}</span>
            <div className="yclients-details-value">
                {children || value || 'Не указано'}
            </div>
        </div>
    );
}

export default function YclientsEmployeeDetails({
    links = [],
    staff = [],
    branches = [],
    loading = false,
    error = '',
}) {
    if (loading) {
        return (
            <p className="yclients-details-message">
                Загрузка данных YCLIENTS...
            </p>
        );
    }

    if (error) {
        return (
            <p className="yclients-details-message">
                Не удалось загрузить данные YCLIENTS: {error}
            </p>
        );
    }

    if (links.length === 0) {
        return (
            <p className="yclients-details-message">
                Пользователь пока не привязан к сотруднику YCLIENTS.
            </p>
        );
    }

    return (
        <div className="yclients-details-list">
            {links.map(link => {
                const employee = staff.find(item =>
                    String(item.branchId) === String(link.branchId) &&
                    String(item.staffId) === String(link.staffId)
                );

                const branch = branches.find(item =>
                    String(item.id) === String(link.branchId)
                );

                const fullName = employee
                    ? (
                        [
                            employee.surname,
                            employee.firstName,
                            employee.patronymic,
                        ].filter(Boolean).join(' ') ||
                        employee.fullName ||
                        employee.name
                    )
                    : 'Данные сотрудника недоступны';

                return (
                    <div
                        className="yclients-details-card"
                        key={`${link.branchId}-${link.staffId}`}
                    >
                        <div className="yclients-details-header">
                            <EmployeeAvatar
                                employee={employee}
                                name={fullName}
                            />

                            <div className="yclients-details-identity">
                                <h4>{fullName}</h4>

                                {employee ? (
                                    <span className="yclients-details-specialization">
                                        {employee.specialization ||
                                            'Специализация не указана'}
                                    </span>
                                ) : (
                                    <span className="yclients-details-unavailable">
                                        Нет в списке действующих сотрудников
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="yclients-details-grid">
                            <DetailField
                                label="Филиал"
                                value={
                                    branch?.name ||
                                    employee?.branchName ||
                                    `Филиал №${link.branchId}`
                                }
                            />

                            <DetailField
                                label="Должность"
                                value={employee?.position}
                            />

                            <DetailField label="Телефон">
                                {employee?.phone ? (
                                    <a href={`tel:${employee.phone}`}>
                                        <Phone size={14} />
                                        {employee.phone}
                                    </a>
                                ) : 'Не указан'}
                            </DetailField>

                            <DetailField label="Email">
                                {employee?.email ? (
                                    <a href={`mailto:${employee.email}`}>
                                        <Mail size={14} />
                                        {employee.email}
                                    </a>
                                ) : 'Не указан'}
                            </DetailField>

                            <DetailField
                                label="YCLIENTS ID"
                                value={String(link.staffId)}
                            />

                            <DetailField
                                label="Статус"
                                value={
                                    employee
                                        ? 'Действующий сотрудник'
                                        : 'Неизвестен'
                                }
                            />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
