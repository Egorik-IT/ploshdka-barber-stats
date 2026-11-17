
import { Sun, Moon } from 'lucide-react';
import './ThemeToggle.css';

export default function ThemeToggle({ theme, onToggle }) {
    return (
        <button
            type="button"
            className="theme-toggle"
            onClick={onToggle}
            aria-label={
                theme === 'dark'
                    ? 'Включить светлую тему'
                    : 'Включить тёмную тему'
            }
            title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
        >
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>
    );
}
