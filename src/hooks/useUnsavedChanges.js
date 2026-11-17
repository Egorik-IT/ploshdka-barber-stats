import { createContext, useContext, useId, useLayoutEffect } from 'react';

export const UnsavedChangesContext = createContext(null);

export default function useUnsavedChanges({ isDirty = false } = {}) {
    const context = useContext(UnsavedChangesContext);
    const id = useId();

    if (!context) {
        throw new Error('useUnsavedChanges требует UnsavedChangesProvider');
    }

    const { register, confirmLeave } = context;

    useLayoutEffect(() => register(id, isDirty), [register, id, isDirty]);

    return { confirmLeave };
}
