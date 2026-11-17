import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { UnsavedChangesContext } from '../hooks/useUnsavedChanges';
import UnsavedChangesDialog from './UnsavedChangesDialog';

export default function UnsavedChangesProvider({ children }) {
    const editors = useRef(new Set());
    const [isDirty, setIsDirty] = useState(false);
    const [manualOpen, setManualOpen] = useState(false);
    const pending = useRef(null);
    const busy = useRef(false);
    const bypass = useRef(false);

    const register = useCallback((id, dirty) => {
        if (!dirty) return;

        editors.current.add(id);
        setIsDirty(true);
        return () => {
            editors.current.delete(id);
            setIsDirty(editors.current.size > 0);
        };
    }, []);

    // Один blocker на приложение, независимо от числа редакторов.
    const shouldBlock = useCallback(
        () => editors.current.size > 0 && !bypass.current,
        []
    );
    const blocker = useBlocker(shouldBlock);
    const blockerRef = useRef(blocker);

    useLayoutEffect(() => {
        blockerRef.current = blocker;
    }, [blocker]);

    const settleManual = useCallback(approved => {
        const resolve = pending.current;
        if (!resolve) return;
        pending.current = null;
        setManualOpen(false);
        resolve(approved);
    }, []);

    // Без аргумента возвращает Promise<boolean>.
    // Callback выполняется один раз и может вызвать navigate() без второго окна.
    const confirmLeave = useCallback(async action => {
        if (busy.current || blockerRef.current.state !== 'unblocked') return false;
        busy.current = true;

        try {
            const approved = editors.current.size === 0 || await new Promise(resolve => {
                pending.current = resolve;
                setManualOpen(true);
            });

            if (!approved) return false;
            if (action) {
                bypass.current = true;
                await action();
            }
            return true;
        } finally {
            bypass.current = false;
            busy.current = false;
        }
    }, []);

    useEffect(() => {
        if (!isDirty) return;

        function beforeUnload(event) {
            if (!shouldBlock()) return;
            event.preventDefault();
            event.returnValue = '';
        }

        window.addEventListener('beforeunload', beforeUnload);
        return () => window.removeEventListener('beforeunload', beforeUnload);
    }, [isDirty, shouldBlock]);

    useEffect(() => {
        // Ручное действие имеет приоритет над конкурентным переходом.
        if (manualOpen && blocker.state === 'blocked') blocker.reset();

        // Сохранение могло завершиться, пока предупреждение было открыто.
        if (editors.current.size === 0) {
            if (manualOpen) settleManual(true);
            else if (blocker.state === 'blocked') blocker.proceed();
        }
    }, [isDirty, manualOpen, blocker, settleManual]);

    useEffect(() => () => {
        pending.current?.(false);
        pending.current = null;
    }, []);

    function stay() {
        settleManual(false);
        if (blocker.state === 'blocked') blocker.reset();
    }

    function leave() {
        if (pending.current) settleManual(true);
        else if (blocker.state === 'blocked') blocker.proceed();
    }

    const value = useMemo(() => ({ register, confirmLeave }), [register, confirmLeave]);

    return (
        <UnsavedChangesContext.Provider value={value}>
            {children}
            {(manualOpen || blocker.state === 'blocked') && (
                <UnsavedChangesDialog onStay={stay} onLeave={leave} />
            )}
        </UnsavedChangesContext.Provider>
    );
}
