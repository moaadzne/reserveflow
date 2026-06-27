import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import Dashboard from './pages/Dashboard';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')) : null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(false);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  };

  if (loading) {
    return <div className="loading">Chargement...</div>;
  }

  return (
    <Router>
      <div className="app-container">
        {token && (
          <nav className="navbar">
            <div className="nav-content">
              <div className="logo">
                <h1>🏨 ReserveFlow</h1>
              </div>
              <div className="nav-right">
                <div className="user-info">
                  <span className="user-name">{user?.hotelName}</span>
                  <span className="user-email">{user?.email}</span>
                </div>
                <button onClick={handleLogout} className="logout-btn">Déconnexion</button>
              </div>
            </div>
          </nav>
        )}

        <Routes>
          <Route path="/login" element={!token ? <LoginPage setToken={setToken} setUser={setUser} /> : <Navigate to="/dashboard" />} />
          <Route path="/register" element={!token ? <RegisterPage setToken={setToken} setUser={setUser} /> : <Navigate to="/dashboard" />} />
          <Route path="/dashboard" element={token ? <Dashboard user={user} token={token} /> : <Navigate to="/login" />} />
          <Route path="/" element={<Navigate to={token ? "/dashboard" : "/login"} />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
