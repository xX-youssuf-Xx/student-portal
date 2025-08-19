import React from 'react';
import { useNavigate } from 'react-router-dom';
import './Home.css';

const Home = () => {
  const navigate = useNavigate();

  const handleStudentLogin = () => {
    navigate('/student/login');
  };

  return (
    <div className="home">
      {/* Hero Section */}
      <section className="hero">
        <div className="hero-content">
          <h1 className="hero-title">مرحباً بك في المنصة </h1>
          <p className="hero-subtitle">
            منصة تعليمية متكاملة تمكنك من أداء الاختبارات، عرض الدرجات، والاستفادة من المزيد من الميزات
          </p>
          <div className="hero-buttons">
            <button 
              className="btn btn-primary"
              onClick={handleStudentLogin}
            >
              تسجيل دخول الطالب
            </button>
          </div>
        </div>
        <div className="hero-visual">
          <div className="hero-image">
            <div className="placeholder-image">🎓</div>
          </div>
        </div>
      </section>


      {/* CTA Section */}
      <section className="cta">
        <h2>ابدأ رحلتك التعليمية اليوم</h2>
        <p>انضم إلى المنصة واستمتع بتجربة تعليمية فريدة</p>
        <button 
          className="btn btn-primary btn-large"
          onClick={handleStudentLogin}
        >
          ابدأ الآن
        </button>
      </section>
    </div>
  );
};

export default Home; 