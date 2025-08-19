import React from 'react';
import { NavLink } from 'react-router-dom';
import './Sidebar.css';

const Sidebar = () => {
  return (
    <div className="sidebar">
      <nav className="sidebar-nav">
        <NavLink to="/admin/dashboard" end className={({ isActive }) => isActive ? "sidebar-link active" : "sidebar-link"}>
          <span className="icon" aria-hidden>🏠</span>
          <span className="label">اللوحة الرئيسية</span>
        </NavLink>
        <NavLink to="/admin/dashboard/students" className={({ isActive }) => isActive ? "sidebar-link active" : "sidebar-link"}>
          <span className="icon" aria-hidden>👥</span>
          <span className="label">الطلاب</span>
        </NavLink>
        {/* Add more links here as needed */}
      </nav>
    </div>
  );
};

export default Sidebar;