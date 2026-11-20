import useViewMode, { viewModes } from '../hooks/useViewMode';
import useUnsavedChanges from '../hooks/useUnsavedChanges';

export default function ViewModeTabs() {
    const { mode, setMode, canPreview } = useViewMode();
    const { confirmLeave } = useUnsavedChanges();
    if (!canPreview) return null;
    async function change(next) {
        if (next !== mode && await confirmLeave()) setMode(next);
    }
    return <div className="view-mode-bar"><span>Предпросмотр роли</span><div className="report-tabs">
        {Object.entries(viewModes).map(([key, label]) => <button key={key} aria-pressed={mode === key} onClick={() => change(key)}>{label}</button>)}
    </div></div>;
}
