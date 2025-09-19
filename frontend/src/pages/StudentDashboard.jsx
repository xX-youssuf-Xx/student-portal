import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import './Dashboard.css';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

const StudentDashboard = () => {
  const { user } = useAuth();
  const [availableTests, setAvailableTests] = useState([]);
  const [testHistory, setTestHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('available');
  const [showGraph, setShowGraph] = useState(false);
  const [graphData, setGraphData] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [availableResponse, historyResponse, resultsResponse] = await Promise.all([
        axios.get('/available-tests'),
        axios.get('/test-history'),
        axios.get('/student/results')
      ]);
      
      setAvailableTests(availableResponse.data.tests || []);
      // sort available tests by start_time descending (newest first)
      const available = (availableResponse.data.tests || []).slice();
      available.sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
      setAvailableTests(available);

      // sort test history by submitted_at descending (newest first)
      const history = (historyResponse.data.history || []).slice();
      history.sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
      setTestHistory(history);
      setGraphData(Array.isArray(resultsResponse.data?.results) ? resultsResponse.data.results : []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const startTest = async (testId) => {
    try {
      const response = await axios.get(`/tests/${testId}/start`);
      // Navigate to test taking page
      window.location.href = `/test/${testId}`;
    } catch (error) {
      console.error('Error starting test:', error);
      alert('حدث خطأ في بدء الاختبار');
    }
  };

  const viewTestResult = async (testId) => {
    try {
      const response = await axios.get(`/tests/${testId}/result`);
      // Navigate to result page
      window.location.href = `/test/${testId}/result`;
    } catch (error) {
      console.error('Error viewing result:', error);
      alert('حدث خطأ في عرض النتيجة');
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTestTypeLabel = (type) => {
    switch (type) {
      case 'MCQ': return 'اختيار من متعدد';
      case 'BUBBLE_SHEET': return 'بابل الكتروني';
      case 'PHYSICAL_SHEET': return 'بابل حقيقي';
      default: return type;
    }
  };

  const getGradeLabel = (grade) => {
    switch (grade) {
      case '3MIDDLE': return 'الثالث الإعدادي';
      case '1HIGH': return 'الأول الثانوي';
      case '2HIGH': return 'الثاني الثانوي';
      case '3HIGH': return 'الثالث الثانوي';
      default: return grade;
    }
  };

  const getGroupLabel = (group) => {
    switch (group) {
      case 'MINYAT-EL-NASR': return 'منية النصر';
      case 'RIYAD': return 'الرياض';
      case 'MEET-HADID': return 'ميت حديد';
      default: return group;
    }
  };

  const ResultsLineChart = ({ data }) => {
    const labels = (data || []).map(r => r.submitted_at || '');
    const chartData = {
      labels,
      datasets: [
        {
          label: 'النسبة %',
          data: (data || []).map(r => r.visible_score ?? r.score ?? 0),
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.2)',
          tension: 0.3,
          pointRadius: 4,
          pointHoverRadius: 6,
        }
      ]
    };
    const opts = {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.parsed.y}%`,
            title: (items) => {
              const idx = items?.[0]?.dataIndex ?? 0;
              const item = data[idx];
              const title = (item?.title || '').slice(0, 30);
              return `${title}`;
            }
          }
        }
      },
      scales: { y: { min: 0, max: 100, ticks: { stepSize: 10 } } }
    };
    return <Line data={chartData} options={opts} />;
  };

  if (loading) {
    return <div className="loading">جاري التحميل...</div>;
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>لوحة تحكم الطالب</h1>
        <p>مرحباً {user?.name}، إليك ملخص نشاطك الأكاديمي</p>
        <div className="student-info">
          <span>الصف: {getGradeLabel(user?.grade)}</span>
          {user?.student_group && <span>المجموعة: {getGroupLabel(user.student_group)}</span>}
        </div>
      </div>

      <div className="dashboard-content">
        {/* Test Tabs */}
        <div className="test-tabs" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button 
            className={`tab-button ${activeTab === 'available' ? 'active' : ''}`}
            onClick={() => setActiveTab('available')}
          >
            الاختبارات المتاحة ({availableTests.length})
          </button>
          <button 
            className={`tab-button ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            تاريخ الاختبارات ({testHistory.length})
          </button>
          <button 
            className={`tab-button ${showGraph ? 'active' : ''}`}
            onClick={() => setShowGraph(s => !s)}
          >
            عرض الرسم البياني
          </button>
        </div>

        {/* Available Tests */}
        {activeTab === 'available' && (
          <div className="tests-section">
            <h2>الاختبارات المتاحة</h2>
            {availableTests.length === 0 ? (
              <div className="no-tests">
                <p>لا توجد اختبارات متاحة حالياً</p>
              </div>
            ) : (
              <div className="tests-grid">
                {availableTests.map(test => (
                  <div key={test.id} className="test-card">
                    <div className="test-header">
                      <h3>{test.title}</h3>
                      <span className="test-type">{getTestTypeLabel(test.test_type)}</span>
                    </div>
                    <div className="test-details">
                      <p><strong>وقت البداية:</strong> {formatDate(test.start_time)}</p>
                      <p><strong>وقت النهاية:</strong> {formatDate(test.end_time)}</p>
                      {test.duration_minutes && (
                        <p><strong>المدة:</strong> {test.duration_minutes} دقيقة</p>
                      )}
                    </div>
                    <div className="test-actions">
                      {test.is_submitted ? (
                        <button className="btn-completed" disabled>
                          ✓ تم التقديم
                        </button>
                      ) : (
                        <button 
                          className="btn-start-test"
                          onClick={() => startTest(test.id)}
                        >
                          🚀 بدء الاختبار
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Test History */}
        {activeTab === 'history' && (
          <div className="tests-section">
            <h2>تاريخ الاختبارات</h2>
            {testHistory.length === 0 ? (
              <div className="no-tests">
                <p>لم تقم بأداء أي اختبارات بعد</p>
              </div>
            ) : (
              <div className="tests-grid">
                {testHistory.map(test => (
                  <div key={test.id} className="test-card completed">
                    <div className="test-header">
                      <h3>{test.title}</h3>
                      <span className="test-type">{getTestTypeLabel(test.test_type)}</span>
                    </div>
                    <div className="test-details">
                      <p><strong>تاريخ التقديم:</strong> {formatDate(test.submitted_at)}</p>
                      {test.visible_score !== null ? (
                        <div className="score-display">
                          <p><strong>الدرجة:</strong> {test.visible_score}%</p>
                          {typeof test.visible_score === 'number' && (
                            <p>
                              <strong>الأسئلة الصحيحة:</strong> {(() => { try {
                                const total = test.test_type === 'MCQ' ? ((test.correct_answers?.questions || []).length) : (Object.keys((test.correct_answers?.answers) || test.correct_answers || {}).length);
                                return Math.round((test.visible_score / 100) * (total || 0));
                              } catch { return 0; } })()}/{(() => { try { return test.test_type === 'MCQ' ? ((test.correct_answers?.questions || []).length) : (Object.keys((test.correct_answers?.answers) || test.correct_answers || {}).length); } catch { return 0; } })()}
                            </p>
                          )}
                          {test.teacher_comment && (
                            <p><strong>تعليق المعلم:</strong> {test.teacher_comment}</p>
                          )}
                        </div>
                      ) : (
                        <p className="pending-grade">في انتظار النتيجة</p>
                      )}
                    </div>
                    <div className="test-actions">
                      {test.visible_score !== null && (
                        <button 
                          className="btn-view-result"
                          onClick={() => viewTestResult(test.id)}
                        >
                          📊 عرض التفاصيل والإجابات
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {showGraph && (
          <div style={{ background: '#fff', borderRadius: 8, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginTop: 16 }}>
            <ResultsLineChart data={graphData} />
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentDashboard;