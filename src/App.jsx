import { fetchApi } from './utils/api';
import './styles/shared.css';

import { useEffect, useState } from 'react';

import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom';

import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import UsersPage from './pages/UsersPage';
import UserProfilePage from './pages/UserProfilePage';
import BranchesPage from './pages/BranchesPage';
import MainLayout from './layouts/MainLayout';

import './App.css';

function App() {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') === 'light'
      ? 'light'
      : 'dark';
  });

  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  // Применяем тему
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Проверяем авторизацию
  useEffect(() => {
    async function checkAuth() {
      try {
        const response = await fetchApi('/api/auth/me');

        if (!response.ok) {
          setUser(null);
          return;
        }

        const result = await response.json();
        setUser(result.user);

      } catch (error) {
        console.error('Ошибка проверки авторизации:', error);
        setUser(null);

      } finally {
        setAuthChecked(true);
      }
    }

    checkAuth();
  }, []);

  // Переключение темы
  function toggleTheme() {
    setTheme(current =>
      current === 'dark' ? 'light' : 'dark'
    );
  }

  // Выход
  async function handleLogout() {
    try {
      const response = await fetchApi(
        '/api/auth/logout',
        {
          method: 'POST',
        }
      );

      if (!response.ok) {
        throw new Error('Не удалось завершить сессию');
      }

      setUser(null);

    } catch (error) {
      console.error('Ошибка выхода:', error);
      alert('Не удалось выйти из аккаунта. Попробуйте ещё раз.');
    }
  }

  if (!authChecked) {
    return null;
  }

  return (
    <BrowserRouter>
      <div className="app">
        <Routes>
          <Route
            path="/login"
            element={
              user
                ? <Navigate to="/dashboard" replace />
                : (
                  <LoginPage
                    onLogin={setUser}
                    theme={theme}
                    toggleTheme={toggleTheme}
                  />
                )
            }
          />

          <Route
            element={
              user
                ? (
                  <MainLayout
                    user={user}
                    onLogout={handleLogout}
                    theme={theme}
                    toggleTheme={toggleTheme}
                  />
                )
                : <Navigate to="/login" replace />
            }
          >
            <Route
              path="/dashboard"
              element={<DashboardPage user={user} />}
            />

            <Route
              path="/users"
              element={<UsersPage currentUser={user} />}
            />

            <Route
              path="/users/:id"
              element={<UserProfilePage currentUser={user} />}
            />

            <Route
              path="/branches"
              element={<BranchesPage currentUser={user} />}
            />
          </Route>

          <Route
            path="*"
            element={
              <Navigate
                to={user ? '/dashboard' : '/login'}
                replace
              />
            }
          />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
