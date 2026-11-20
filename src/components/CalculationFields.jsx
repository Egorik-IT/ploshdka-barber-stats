import { fieldsForCategory } from '../../shared/calculationSettings';

export default function CalculationFields({ value, onChange, category, defaults = {} }) {
    return <div className="settings-fields">{fieldsForCategory(category).map(([key, label]) => <label key={key}>
        {label}
        <input type="number" min="0" max={key.endsWith('Percent') ? 100 : 100000000}
            step="any" value={value[key] ?? ''} placeholder={defaults[key] == null ? 'Не задано' : String(defaults[key])}
            onChange={event => onChange({ ...value, [key]: event.target.value === '' ? null : Number(event.target.value) })} />
    </label>)}</div>;
}
