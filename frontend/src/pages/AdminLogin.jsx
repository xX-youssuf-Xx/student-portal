import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Login.css';

const AdminLogin = () => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!phoneNumber || !password) {
      setError('يرجى إدخال رقم الهاتف وكلمة المرور');
      setLoading(false);
      return;
    }

    try {
      const result = await login(phoneNumber, password, 'admin');
      
      if (result.success) {
        navigate('/admin/dashboard');
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError('حدث خطأ في تسجيل الدخول');
    } finally {
      setLoading(false);
    }
  };

  const handleStudentLogin = () => {
    navigate('/student/login');
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <h1>تسجيل دخول المدير</h1>
          <p>أدخل بياناتك للوصول إلى لوحة تحكم المدير</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="phoneNumber">رقم الهاتف</label>
            <input
              type="tel"
              id="phoneNumber"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="أدخل رقم الهاتف"
              required
              dir="ltr"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">كلمة المرور</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="أدخل كلمة المرور"
              required
            />
          </div>

          <button 
            type="submit" 
            className="login-button"
            disabled={loading}
          >
            {loading ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول'}
          </button>
        </form>

        <div className="login-footer">
          <p>هل أنت طالب؟</p>
          <button 
            className="link-button"
            onClick={handleStudentLogin}
          >
            تسجيل دخول الطالب
          </button>
        </div>

        <div className="back-home">
          <button 
            className="link-button"
            onClick={() => navigate('/')}
          >
            العودة للرئيسية
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin; 