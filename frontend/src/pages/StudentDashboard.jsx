import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import './Dashboard.css';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

// Countdown Timer Component
const CountdownTimer = ({ targetMs, type }) => {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = Date.now();
      const difference = targetMs - now;

      if (difference <= 0) {
        setIsExpired(true);
        return { days: 0, hours: 0, minutes: 0, seconds: 0 };
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((difference % (1000 * 60)) / 1000);

      return { days, hours, minutes, seconds };
    };

    setTimeLeft(calculateTimeLeft());
    setIsExpired(targetMs <= Date.now());

    const timer = setInterval(() => {
      const newTimeLeft = calculateTimeLeft();
      setTimeLeft(newTimeLeft);
      if (targetMs <= Date.now()) {
        setIsExpired(true);
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [targetMs]);

  if (isExpired) {
    return null;
  }

  const formatNumber = (num) => String(num).padStart(2, '0');

  return (
    <div className={`countdown-timer ${type}`}>
      <span className="countdown-label">
        {type === 'start' ? '⏳ يبدأ بعد:' : '⏰ ينتهي بعد:'}
      </span>
      <div className="countdown-values">
        {timeLeft.days > 0 && (
          <span className="countdown-unit">
            <strong>{timeLeft.days}</strong> يوم
          </span>
        )}
        <span className="countdown-unit">
          <strong>{formatNumber(timeLeft.hours)}</strong>س
        </span>
        <span className="countdown-unit">
          <strong>{formatNumber(timeLeft.minutes)}</strong>د
        </span>
        <span className="countdown-unit">
          <strong>{formatNumber(timeLeft.seconds)}</strong>ث
        </span>
      </div>
    </div>
  );
};

const StudentDashboard = () => {
  const { user } = useAuth();
  const [availableTests, setAvailableTests] = useState([]);
  const [testHistory, setTestHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('available');
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
    // Parse the time string directly to get exact components
    const date = new Date(dateString);
    
    // Extract components exactly as stored
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    
    // Arabic month names
    const arabicMonths = [
      'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
      'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
    ];
    
    // Format manually to avoid any timezone shifts
    const arabicMonth = arabicMonths[month - 1];
    
    // Convert to 12-hour format with correct AM/PM
    let hour12 = hours % 12;
    if (hour12 === 0) hour12 = 12; // Convert 0 to 12 for midnight/noon
    const ampm = hours < 12 ? 'ص' : 'م'; // Arabic AM/PM
    const formattedHours = hour12.toString().padStart(2, '0');
    const formattedMinutes = minutes.toString().padStart(2, '0');
    
    return `${day} ${arabicMonth} ${year} في ${formattedHours}:${formattedMinutes} ${ampm}`;
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
    // Sort data by date in ascending order for the graph
    const sortedData = [...(data || [])].sort((a, b) => 
      new Date(a.submitted_at) - new Date(b.submitted_at)
    );

    // Format dates to show only the date part
    const formatDateLabel = (dateString) => {
      if (!dateString) return '';
      return new Date(dateString).toLocaleDateString('ar-EG', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
    };

    const chartData = {
      labels: sortedData.map(r => formatDateLabel(r.submitted_at)),
      datasets: [
        {
          label: 'النسبة %',
          data: sortedData.map(r => parseFloat(r.visible_score ?? r.score ?? 0)),
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.2)',
          tension: 0.3,
          pointRadius: 4,
          pointHoverRadius: 6,
          fill: true
        }
      ]
    };

    const getTotalQuestions = (test) => {
      if (!test.correct_answers) return 0;
      if (test.test_type === 'MCQ') {
        return test.correct_answers.questions?.length || 0;
      } else if (test.test_type === 'BUBBLE_SHEET' || test.test_type === 'PHYSICAL_SHEET') {
        return Object.keys(test.correct_answers.answers || {}).length;
      }
      return 0;
    };

    const getCorrectAnswers = (test) => {
      if (!test.score || !test.correct_answers) return 0;
      const totalQuestions = getTotalQuestions(test);
      if (totalQuestions === 0) return 0;
      return Math.round((parseFloat(test.score) / 100) * totalQuestions);
    };

    const opts = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => {
              const data = sortedData[context.dataIndex];
              const totalQuestions = getTotalQuestions(data);
              const correctAnswers = getCorrectAnswers(data);
              return [
                `النسبة: ${parseFloat(data.visible_score ?? data.score ?? 0).toFixed(2)}%`,
                `الإجابات الصحيحة: ${correctAnswers}/${totalQuestions}`
              ];
            },
            title: (items) => {
              const idx = items?.[0]?.dataIndex ?? 0;
              const item = sortedData[idx];
              return item?.title || '';
            }
          }
        }
      },
      scales: { 
        y: { 
          min: 0, 
          max: 100, 
          ticks: { stepSize: 10 },
          title: { display: true, text: 'النسبة %' }
        },
        x: {
          reverse: false // Make graph go from left to right
        }
      }
    };

    return (
      <div style={{ height: '400px', width: '100%' }}>
        <Line data={chartData} options={opts} />
      </div>
    );
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
        <div className="test-tabs" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '20px' }}>
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
            className={`tab-button ${activeTab === 'graph' ? 'active' : ''}`}
            onClick={() => setActiveTab('graph')}
          >
            الرسم البياني
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
                    
                    {/* Countdown Timers */}
                    {Date.now() < (test.start_time_ms || 0) && (
                      <CountdownTimer targetMs={test.start_time_ms} type="start" />
                    )}
                    {Date.now() >= (test.start_time_ms || 0) && Date.now() < (test.end_time_ms || 0) && (
                      <CountdownTimer targetMs={test.end_time_ms} type="end" />
                    )}
                    
                    <div className="test-actions">
                        <button
                          className="btn-start-test"
                          onClick={() => startTest(test.id)}
                          disabled={Date.now() < (test.start_time_ms || 0) || Date.now() > (test.end_time_ms || 0)}
                        >
                          {Date.now() > (test.end_time_ms || 0) ? 'انتهى وقت الاختبار' :
                           Date.now() < (test.start_time_ms || 0) ? 'لم يبدأ الاختبار بعد' : '🚀 بدء الاختبار'}
                        </button>
                      
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
                {testHistory.map(test => {
                  const showDetails = test.view_type === 'IMMEDIATE' || test.view_permission;
                  const showGradeOnly = test.view_type === 'TEACHER_CONTROLLED' && test.show_grade_outside && !test.view_permission;
                  
                  // Calculate correct answers and total questions
                  const getTotalQuestions = () => {
                    if (!test.correct_answers) return 0;
                    if (test.test_type === 'MCQ') {
                      return test.correct_answers.questions?.length || 0;
                    } else if (test.test_type === 'BUBBLE_SHEET' || test.test_type === 'PHYSICAL_SHEET') {
                      return Object.keys(test.correct_answers.answers || {}).length;
                    }
                    return 0;
                  };

                  const totalQuestions = getTotalQuestions();
                  const correctAnswers = test.score ? Math.round((parseFloat(test.score) / 100) * totalQuestions) : 0;
                  
                  return (
                    <div key={test.id} className="test-card">
                      <div className="test-header">
                        <h3>{test.title}</h3>
                        <span className="test-type">{getTestTypeLabel(test.test_type)}</span>
                      </div>
                      <div className="test-meta">
                        <span>التاريخ: {formatDate(test.submitted_at)}</span>
                        {(test.view_type === 'IMMEDIATE' || test.show_grade_outside || test.view_permission) && test.score && (
                          <div className="score-info">
                            <span className={`score ${test.score >= 50 ? 'pass' : 'fail'}`}>
                              النسبة: {parseFloat(test.score).toFixed(2)}%
                            </span>
                            {totalQuestions > 0 && (
                              <span className="correct-answers">
                                ({correctAnswers}/{totalQuestions} إجابة صحيحة)
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      {showDetails || showGradeOnly ? (
                        <div className="test-actions">
                          {showDetails && (
                            <button 
                              className="view-result-button"
                              onClick={() => viewTestResult(test.id)}
                            >
                              عرض النتيجة
                            </button>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Graph Section */}
        {activeTab === 'graph' && (
          <div className="graph-section">
            <div className="graph-container" style={{ 
              backgroundColor: 'white', 
              padding: '20px', 
              borderRadius: '8px', 
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)' 
            }}>
              <h2>تطور النتائج</h2>
              {graphData.length > 0 ? (
                <ResultsLineChart data={graphData} />
              ) : (
                <div className="no-data" style={{ textAlign: 'center', padding: '40px' }}>
                  <p>لا توجد بيانات متاحة للعرض</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentDashboard;