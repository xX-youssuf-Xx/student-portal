import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Navbar.css';

const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  // Arabic display labels for grade and group
  const gradeLabels = {
    '3MIDDLE': 'الصف الثالث الإعدادي',
    '1HIGH': 'الصف الأول الثانوي',
    '2HIGH': 'الصف الثاني الثانوي',
    '3HIGH': 'الصف الثالث الثانوي',
  };

  const groupLabels = {
    'MINYAT-EL-NASR': 'منية النصر',
    'RIYAD': 'رياض',
    'MEET-HADID': 'ميت حديد',
  };

  const handleLoginClick = () => {
    navigate('/student/login');
  };

  const handleLogout = () => {
    logout();
    navigate('/');
    setShowDropdown(false);
  };

  const handleProfileClick = () => {
    setShowDropdown(!showDropdown);
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        {/* Right side - Portal logo */}
        <div className="navbar-brand">
          <img src="/logo.png" alt="منصة الطالب" className="navbar-logo" />
        </div>

        {/* Mobile toggle */}
        <button
          className="navbar-toggle"
          aria-label="Toggle menu"
          onClick={() => setShowMobileMenu(prev => !prev)}
        >
          <span className="bar" />
          <span className="bar" />
          <span className="bar" />
        </button>

        {/* Left side - Login/User info */}
        <div className={`navbar-actions ${showMobileMenu ? 'open' : ''}`}>
          {user ? (
            <div className="user-menu">
              <button 
                className="user-button"
                onClick={handleProfileClick}
              >
                <span className="user-name">{user.name}</span>
                <span className="dropdown-arrow">▼</span>
              </button>
              
              {showDropdown && (
                <div className="dropdown-menu">
                  <div className="dropdown-header">
                    <strong>مرحباً {user.name}</strong>
                  </div>
                  {user.type === 'student' && (
                    <>
                      <div className="dropdown-item">
                        <span>الصف: {gradeLabels[user.grade] || user.grade}</span>
                      </div>
                      {user.student_group && (
                        <div className="dropdown-item">
                          <span>المجموعة: {groupLabels[user.student_group] || user.student_group}</span>
                        </div>
                      )}
                    </>
                  )}
                  <div className="dropdown-item">
                    <span>رقم الهاتف: {user.phone_number}</span>
                  </div>
                  <button 
                    className="dropdown-button logout-button"
                    onClick={handleLogout}
                  >
                    تسجيل خروج
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button 
              className="login-button"
              onClick={handleLoginClick}
            >
              تسجيل دخول
            </button>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar; 