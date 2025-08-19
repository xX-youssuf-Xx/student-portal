import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import './Dashboard.css';

const StudentDashboard = () => {
  const { user } = useAuth();

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>لوحة تحكم الطالب</h1>
        <p>مرحباً {user?.name}، إليك ملخص نشاطك الأكاديمي</p>
      </div>

      <div className="dashboard-content">
        {/* Welcome Card */}
        <div className="welcome-card">
          <div className="welcome-content">
            <h2>مرحباً بك في المنصة </h2>
            <p>يمكنك من خلال هذه اللوحة متابعة دراستك وأداء الاختبارات وعرض الدرجات</p>
          </div>
          <div className="welcome-visual">
            <div className="placeholder-image">👨‍🎓</div>
          </div>
        </div>

       

        {/* Quick Actions */}
        <div className="quick-actions">
          <h2>إجراءات سريعة</h2>
          <div className="actions-grid">
            <button className="action-button">
              <span className="action-icon">📝</span>
              <span>عرض الاختبارات</span>
            </button>
            
            <button className="action-button">
              <span className="action-icon">📊</span>
              <span>عرض الدرجات</span>
            </button>
            
            <button className="action-button">
              <span className="action-icon">⚙️</span>
              <span>الإعدادات</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentDashboard; 