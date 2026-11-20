export const isManager = user => ['manager', 'developer'].includes(user?.role);

export function allowRoles(...roles) {
    return (req, res, next) => {
        if (!roles.includes(req.user?.role)) return res.status(403).json({ message: 'Недостаточно прав' });
        next();
    };
}

export function canManageRole(actor, targetRole) {
    if (targetRole === 'developer') return false;
    if (actor?.role === 'developer') return ['manager', 'admin', 'employee'].includes(targetRole);
    if (actor?.role === 'manager') return ['admin', 'employee'].includes(targetRole);
    return actor?.role === 'admin' && targetRole === 'employee';
}

export function reportView(req, res, next) {
    const actual = { employee: 'barber', admin: 'admin', manager: 'manager' }[req.user.role];
    const requested = req.query.view;
    if (requested && !['barber', 'admin', 'manager'].includes(requested)) {
        return res.status(400).json({ message: 'Неизвестный режим отчёта' });
    }
    if (req.user.role !== 'developer' && requested && requested !== actual) {
        return res.status(403).json({ message: 'Предпросмотр доступен только разработчику' });
    }
    req.reportView = req.user.role === 'developer' ? requested || 'manager' : actual;
    next();
}
