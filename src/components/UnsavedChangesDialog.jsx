import { useId, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { TriangleAlert } from 'lucide-react';
import './UnsavedChangesDialog.css';

export default function UnsavedChangesDialog({ onStay, onLeave }) {
    const dialogRef = useRef(null);
    const stayRef = useRef(null);
    const titleId = useId();
    const descriptionId = useId();

    useLayoutEffect(() => {
        const dialog = dialogRef.current;
        const previousFocus = document.activeElement;
        const previousOverflow = document.body.style.overflow;

        document.body.style.overflow = 'hidden';
        dialog.showModal();
        stayRef.current.focus();

        return () => {
            dialog.close();
            document.body.style.overflow = previousOverflow;
            if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
        };
    }, []);

    function handleKeyDown(event) {
        if (event.key === 'Escape') {
            event.preventDefault();
            onStay();
            return;
        }
        if (event.key !== 'Tab') return;
        const buttons = dialogRef.current.querySelectorAll('button');
        const first = buttons[0];
        const last = buttons[buttons.length - 1];

        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    return createPortal(
        <dialog
            ref={dialogRef}
            className="unsaved-dialog"
            role="alertdialog"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            aria-modal="true"
            onKeyDown={handleKeyDown}
            onCancel={event => {
                event.preventDefault();
                onStay();
            }}
        >
            <div className="unsaved-dialog-heading">
                <TriangleAlert size={24} aria-hidden="true" />
                <h2 id={titleId}>Несохранённые изменения</h2>
            </div>
            <p id={descriptionId}>
                Если выйти сейчас, внесённые изменения будут потеряны.
            </p>
            <div className="unsaved-dialog-actions">
                <button ref={stayRef} type="button" onClick={onStay}>
                    Остаться
                </button>
                <button type="button" className="unsaved-dialog-leave" onClick={onLeave}>
                    Выйти без сохранения
                </button>
            </div>
        </dialog>,
        document.body
    );
}
