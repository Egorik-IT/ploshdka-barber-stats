import { createContext, useContext } from 'react';

export const ViewModeContext = createContext(null);
export const viewModes = { barber: 'Сотрудник', admin: 'Администратор', manager: 'Руководитель' };
export default function useViewMode() { return useContext(ViewModeContext); }

export function canPreviewPage(mode, path) {
    if (path.startsWith('/finance') || path.startsWith('/branches')) return mode === 'manager';
    if (path.startsWith('/users')) return mode !== 'barber';
    return true;
}
