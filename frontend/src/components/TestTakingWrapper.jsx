import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import PdfImageViewer from './PdfImageViewer';
import '../styles/TestTakingWrapper.css';

const TestTakingWrapper = () => {
  const { testId } = useParams();
  const navigate = useNavigate();
  const [testStarted, setTestStarted] = useState(false);
  const [testEnded, setTestEnded] = useState(false);
  const [testData, setTestData] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [testSessionId, setTestSessionId] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // Check test status on component mount
  useEffect(() => {
    const checkTestStatus = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`/tests/${testId}/status`);
        const { started, sessionId, timeRemaining, ended } = response.data;
        
        if (ended) {
          setTestEnded(true);
          setError('لقد انتهى وقت الاختبار بالفعل');
          setTimeout(() => navigate('/dashboard'), 3000);
          return;
        }

        if (started && sessionId) {
          setTestStarted(true);
          setTestSessionId(sessionId);
          setTimeLeft(timeRemaining);
          startTestTimer(timeRemaining);
        }
      } catch (err) {
        console.error('Error checking test status:', err);
        setError('فشل في التحقق من حالة الاختبار. يرجى المحاولة مرة أخرى.');
      } finally {
        setLoading(false);
      }
    };

    checkTestStatus();

    return () => {
      // Cleanup
      setTestStarted(false);
      setTestEnded(false);;
    };
  }, [testId, navigate]);

  // Handle starting the test
  const handleStartTest = async () => {
    try {
      setLoading(true);
      const response = await axios.post(`/tests/${testId}/start`);
      const { sessionId, duration } = response.data;
      
      setTestStarted(true);
      setTestSessionId(sessionId);
      setTimeLeft(duration);
      startTestTimer(duration);
    } catch (err) {
      console.error('Error starting test:', err);
      if (err.response?.status === 409) {
        // Test already started, auto-submit and redirect
        await handleAutoSubmit();
      } else {
        setError('فشل في بدء الاختبار. يرجى المحاولة مرة أخرى.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Auto-submit when test is already started
  const handleAutoSubmit = async () => {
    try {
      await axios.post(`/tests/${testId}/submit`, {
        answers: [],
        forceSubmit: true
      });
      navigate('/dashboard');
    } catch (err) {
      console.error('Error auto-submitting test:', err);
      setError('حدث خطأ أثناء محاولة إرسال الإجابات تلقائيًا. يرجى المحاولة مرة أخرى.');
    }
  };

  // Handle test submission
  const handleSubmitTest = async () => {
    try {
      setLoading(true);
      await axios.post(`/tests/${testId}/submit`, {
        sessionId: testSessionId,
        answers: [], // Add answers here when implemented
        submitTime: new Date().toISOString()
      });
      
      setTestEnded(true);
      setTimeout(() => navigate('/dashboard'), 3000);
    } catch (err) {
      console.error('Error submitting test:', err);
      setError('فشل في إرسال الإجابات. يرجى المحاولة مرة أخرى.');
    } finally {
      setLoading(false);
    }
  };

  // Start test timer
  const startTestTimer = (duration) => {
    const endTime = Date.now() + duration * 1000;
    
    const timer = setInterval(() => {
      const secondsLeft = Math.max(0, Math.round((endTime - Date.now()) / 1000));
      setTimeLeft(secondsLeft);
      
      if (secondsLeft <= 0) {
        clearInterval(timer);
        handleAutoSubmit();
      }
    }, 1000);

    return () => clearInterval(timer);
  };

  // Format time as MM:SS
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="test-loading">
        <div className="spinner"></div>
        <p>جاري التحميل...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="test-error">
        <div className="error-icon">!</div>
        <p>{error}</p>
        <button 
          className="retry-button"
          onClick={() => window.location.reload()}
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  if (!testStarted) {
    return (
      <div className="test-start-container">
        <div className="test-start-card">
          <h2>بدء الاختبار</h2>
          <p>سيكون لديك 60 دقيقة لإكمال هذا الاختبار.</p>
          <p>بمجرد البدء، لا يمكنك إيقاف المؤقت.</p>
          <button 
            className="start-test-button"
            onClick={handleStartTest}
            disabled={loading}
          >
            {loading ? 'جاري التحميل...' : 'بدء الاختبار'}
          </button>
        </div>
      </div>
    );
  }

  if (testEnded) {
    return (
      <div className="test-ended">
        <h2>تم إرسال إجاباتك بنجاح</h2>
        <p>سيتم إعادة توجيهك إلى لوحة التحكم...</p>
      </div>
    );
  }

  return (
    <div className="test-taking-container">
      <div className="test-header">
        <div className="test-timer">
          الوقت المتبقي: <span className="time">{formatTime(timeLeft)}</span>
        </div>
        <button 
          className="submit-test-button"
          onClick={handleSubmitTest}
          disabled={loading}
        >
          {loading ? 'جاري الإرسال...' : 'إنهاء الاختبار'}
        </button>
      </div>
      
      <div className="test-content">
        <PdfImageViewer testId={testId} />
        {/* Add answer input components here */}
      </div>
    </div>
  );
};

export default TestTakingWrapper;
