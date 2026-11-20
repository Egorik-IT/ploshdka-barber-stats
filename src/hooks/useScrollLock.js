import { useLayoutEffect } from 'react';

let locks = 0;
let previousOverflow;

// Lock the viewport, not body: an overflow on body changes the sticky sidebar's scroll container.
export default function useScrollLock() {
    useLayoutEffect(() => {
        const root = document.documentElement;
        if (locks === 0) {
            previousOverflow = root.style.overflow;
            root.style.overflow = 'hidden';
        }
        locks++;
        return () => {
            locks--;
            if (locks === 0) root.style.overflow = previousOverflow;
        };
    }, []);
}
