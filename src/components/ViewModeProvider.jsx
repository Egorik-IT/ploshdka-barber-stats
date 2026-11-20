import { useMemo, useState } from 'react';
import { ViewModeContext, viewModes } from '../hooks/useViewMode';

export default function ViewModeProvider({ user, children }) {
    const [previewMode, setPreviewMode] = useState(() => {
        const saved = localStorage.getItem('previewRole');
        return viewModes[saved] ? saved : 'manager';
    });
    const canPreview = user?.role === 'developer';
    const roleMode = { employee: 'barber', admin: 'admin', manager: 'manager' }[user?.role] || 'barber';
    const mode = canPreview ? previewMode : roleMode;
    const value = useMemo(() => ({ mode, canPreview, setMode: next => {
        if (!canPreview || !viewModes[next]) return;
        setPreviewMode(next);
        localStorage.setItem('previewRole', next);
    } }), [mode, canPreview]);
    return <ViewModeContext.Provider value={value}>{children}</ViewModeContext.Provider>;
}
