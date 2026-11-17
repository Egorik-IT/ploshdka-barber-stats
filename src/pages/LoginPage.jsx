import { fetchApi } from '../utils/api';

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle';

import './LoginPage.css';

function LoginPage({ onLogin, theme, toggleTheme }) {
    const navigate = useNavigate();

    const [login, setLogin] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    async function handleSubmit(event) {
        event.preventDefault();

        setError('');
        setLoading(true);

        try {
            const response = await fetchApi(
                '/api/auth/login',
                {
                    method: 'POST',

                    headers: {
                        'Content-Type': 'application/json',
                    },

                    body: JSON.stringify({
                        username: login,
                        password: password,
                    }),
                }
            );

            const result = await response.json();

            if (!response.ok) {
                setError(result.message || 'Ошибка авторизации');
                return;
            }

            onLogin(result.user);
            navigate('/dashboard');

        } catch (error) {
            console.error('Ошибка входа:', error);
            setError('Не удалось подключиться к серверу');

        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="login-page">
            <div className="theme-control">
                <ThemeToggle
                    theme={theme}
                    onToggle={toggleTheme}
                />
            </div>

            <form className="login-form" onSubmit={handleSubmit}>
                <h1>ПЛОЩАДКА</h1>

                <p className="login-subtitle">
                    МЕСТНЫЙ БАРБЕРШОП
                </p>

                <label htmlFor="login">Логин</label>

                <input
                    id="login"
                    type="text"
                    value={login}
                    onChange={(event) => setLogin(event.target.value)}
                    placeholder="Введите логин"
                    autoComplete="username"
                    required
                />

                <label htmlFor="password">Пароль</label>

                <div className="password-field">
                    <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="Введите пароль"
                        autoComplete="current-password"
                        required
                    />

                    <button
                        type="button"
                        className="password-toggle"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                    >
                        {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                </div>

                {error && (
                    <p className="login-error">{error}</p>
                )}

                <button type="submit" disabled={loading}>
                    {loading ? 'Входим...' : 'Войти'}
                </button>
            </form>
        </div>
    );
}

export default LoginPage;
