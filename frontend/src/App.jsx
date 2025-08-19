import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Home from './pages/Home';
import StudentLogin from './pages/StudentLogin';
import AdminLogin from './pages/AdminLogin';
import StudentDashboard from './pages/StudentDashboard';
import AdminDashboard from './pages/AdminDashboard';
import DashboardHomePage from './pages/admin/DashboardHomePage';
import StudentManagement from './pages/admin/StudentManagement';
import './App.css';

// Protected Route Component
const ProtectedRoute = ({ children, allowedTypes }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <div className="loading">جاري التحميل...</div>;
  }
  
  if (!user) {
    return <Navigate to="/student/login" replace />;
  }
  
  if (!allowedTypes.includes(user.type)) {
    return <Navigate to="/" replace />;
  }
  
  return children;
};

// Main App Component
const AppContent = () => {
  return (
        <Router future={{ v7_relativeSplatPath: true }}>
      <div className="app" dir="rtl">
        <Navbar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/student/login" element={<StudentLogin />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route 
              path="/student/dashboard" 
              element={
                <ProtectedRoute allowedTypes={['student']}>
                  <StudentDashboard />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/admin/dashboard" 
              element={
                <ProtectedRoute allowedTypes={['admin']}>
                  <AdminDashboard />
                </ProtectedRoute>
              } 
            >
              <Route index element={<DashboardHomePage />} />
              <Route path="students" element={<StudentManagement />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </Router>
  );
};

// Root App Component with Auth Provider
function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
