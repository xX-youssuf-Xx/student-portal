import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import TestImageViewer from '../components/TestImageViewer';
import './TestTaking.css';
import './TestTaking.security.css';

const TestTaking = () => {
  const { testId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  // ALL STATE HOOKS FIRST
  const [test, setTest] = useState(null);
  const [answers, setAnswers] = useState(() => {
    // Load answers from localStorage if available 
    const saved = localStorage.getItem(`test_${testId}_answers`);
    return saved ? JSON.parse(saved) : {};
  });
  const [timeLeft, setTimeLeft] = useState(() => {
    // Load timeLeft from localStorage if available, or default to null
    const saved = localStorage.getItem(`test_${testId}_time`);
    return saved ? parseInt(saved, 10) : null;
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [bubbleSheetFile, setBubbleSheetFile] = useState(null);
  const [showGradeModal, setShowGradeModal] = useState(false);
  const [submissionResult, setSubmissionResult] = useState(null);
  const [showImageViewer, setShowImageViewer] = useState(false);
  const [toast, setToast] = useState(null); // { type: 'success'|'error'|'info', message }
  const [showBubblePanel, setShowBubblePanel] = useState(false);
  const [autoSubmitPending, setAutoSubmitPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
  const [showSubmittedModal, setShowSubmittedModal] = useState(false); // for PHYSICAL_SHEET ungraded submissions
  const [timerReady, setTimerReady] = useState(false); // countdown only runs after true time is set

  // Track window size to toggle mobile layout (single-column bubble sheet)
  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ALL EFFECTS MUST BE DECLARED BEFORE ANY CONDITIONAL RETURNS
  
  // Save answers to localStorage whenever they change
  useEffect(() => {
    if (Object.keys(answers).length > 0) {
      localStorage.setItem(`test_${testId}_answers`, JSON.stringify(answers));
    }
  }, [answers, testId]);
  
  // Save timeLeft to localStorage every second
  useEffect(() => {
    if (timeLeft !== null) {
      const timer = setInterval(() => {
        localStorage.setItem(`test_${testId}_time`, timeLeft.toString());
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [timeLeft, testId]);

  useEffect(() => {
    fetchTest();
  }, [testId]);

  // Handle test submission when time runs out (only after timer is initialized)
  useEffect(() => {
    if (!timerReady) return;
    if (timeLeft > 0) {
      const timer = setTimeout(() => {
        setTimeLeft(timeLeft - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (timeLeft === 0) {
      handleAutoSubmit();
    }
  }, [timeLeft, timerReady]);

  // No temporary visible grace timer; prevent auto-submit via timerReady gating only

  useEffect(() => {
    // Prevent navigation away from the test page
    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };

    // Prevent context menu (right-click)
    const handleContextMenu = (e) => {
      e.preventDefault();
      return false;
    };

    // Prevent keyboard shortcuts
    const handleKeyDown = (e) => {
      // Block F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U, PrintScreen, etc.
      if (
        e.key === 'F12' ||
        e.key === 'PrintScreen' ||
        (e.ctrlKey && e.shiftKey && e.key === 'I') ||
        (e.ctrlKey && e.shiftKey && e.key === 'J') ||
        (e.ctrlKey && e.key === 'U') ||
        (e.ctrlKey && e.key === 'S') ||
        (e.ctrlKey && e.key === 'P') ||
        (e.metaKey && e.shiftKey && e.key === '4') // Cmd+Shift+4 (Mac screenshot)
      ) {
        e.preventDefault();
        return false;
      }
    };

    // Track visibility changes (for detecting screenshots and app switching)
    let visibilityChangeCount = 0;
    const handleVisibilityChange = () => {
      if (document.hidden) {
        visibilityChangeCount++;
        if (visibilityChangeCount > 2) {
          // After multiple visibility changes, assume screenshot attempt
          setToast({ type: 'error', message: 'تم اكتشاف محاولة أخذ لقطة شاشة. سيتم إنهاء الاختبار بعد 3 محاولات.' });
          if (visibilityChangeCount >= 3 && timerReady && test) {
            handleAutoSubmit();
          }
        } else {
          setToast({ type: 'info', message: 'يُرجى عدم محاولة أخذ لقطة شاشة أثناء الاختبار.' });
        }
      }
    };

    // Add event listeners
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // HELPER FUNCTIONS (these can be anywhere but are typically after hooks)
  const fetchTest = async () => {
    try {
      // First get basic test info
      const startResponse = await axios.get(`/tests/${testId}/start`);
      const testData = startResponse.data.test;
      const submissionMeta = startResponse.data.test?.submission || null;
      
      // For MCQ tests, get questions separately
      if (testData.test_type === 'MCQ') {
        const questionsResponse = await axios.get(`/tests/${testId}/questions`);
        const testWithQuestions = questionsResponse.data.test;
        testData.questions = testWithQuestions.questions || [];
      }
      
      setTest(testData);
      
      // If the submission already exists and has been graded, show the result modal immediately
      if (submissionMeta && submissionMeta.graded) {
        try {
          const res = await axios.get(`/tests/${testId}/result`);
          const result = res.data.result;
          setSubmissionResult(result);
          setShowGradeModal(true);
          setLoading(false);
          return; // don't initialize timer or answers
        } catch (err) {
          console.error('Error fetching test result for graded submission:', err);
        }
      }
      
      // Set timer if duration is specified. Use submission.created_at to resume timer if available.
      if (testData.duration_minutes) {
        if (submissionMeta && submissionMeta.created_at) {
          const startedAt = new Date(submissionMeta.created_at).getTime();
          const elapsed = Math.floor((Date.now() - startedAt) / 1000);
          const remaining = testData.duration_minutes * 60 - elapsed;
          if (remaining <= 0) {
            // After data loads, if time is truly up, auto-submit normally
            setTimeLeft(0);
            handleAutoSubmit();
          } else {
            setTimeLeft(remaining);
          }
          setTimerReady(true);
        } else {
          // No server-side submission timestamp: start from full duration
          setTimeLeft(testData.duration_minutes * 60);
          setTimerReady(true);
        }
      }
      
      // Initialize answers based on test type
      // If submission exists with saved answers, restore them, otherwise initialize empty
      if (submissionMeta && submissionMeta.id) {
        // Use answers from start payload if available; avoid extra /result request
        const raw = submissionMeta.answers;
        if (raw && Object.keys(raw).length > 0) {
          setAnswers(typeof raw === 'string' ? JSON.parse(raw) : raw);
        } else {
          setAnswers(testData.test_type === 'MCQ' ? { answers: [] } : { answers: {} });
        }
      } else {
        setAnswers(testData.test_type === 'MCQ' ? { answers: [] } : { answers: {} });
      }
    } catch (error) {
      console.error('Error fetching test:', error);
      setToast({ type: 'error', message: 'حدث خطأ في تحميل الاختبار' });
      navigate('/student/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const handleAutoSubmit = async () => {
    if (submitting || submitted) return;
    if (!test) {
      // If test data hasn't arrived yet, mark a pending auto-submit so it runs when test is available
      setAutoSubmitPending(true);
      return;
    }
    
    setSubmitting(true);
    try {
      let response;
      if (test.test_type === 'PHYSICAL_SHEET' && bubbleSheetFile) {
        const formData = new FormData();
        formData.append('bubbleSheet', bubbleSheetFile);
        response = await axios.post(`/tests/${testId}/upload-bubble-sheet`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      } else {
        response = await axios.post(`/tests/${testId}/submit`, { answers });
      }
      
      if (response?.data?.submission) {
        // mark as submitted to disable inputs and buttons
        setSubmitted(true);
        setShowBubblePanel(false);
        // After submission: try to fetch student's rank (students are authorized)
        if (test.test_type === 'PHYSICAL_SHEET' && !response.data.submission.graded) {
          setSubmissionResult(response.data.submission);
          setShowSubmittedModal(true);
        } else {
          try {
            const rankResponse = await axios.get(`/tests/${testId}/submissions/rank`);
            setSubmissionResult({
              ...response.data.submission,
              rank: rankResponse.data.rank,
              totalStudents: rankResponse.data.totalStudents
            });
          } catch (err) {
            // If rank is unavailable, just show submission without it
            setSubmissionResult(response.data.submission);
          }
          setShowGradeModal(true);
        }
      } else {
        setToast({ type: 'success', message: 'تم تسليم الاختبار بنجاح' });
        // give user a short moment to see toast
        setTimeout(() => navigate('/student/dashboard'), 800);
      }
    } catch (error) {
      console.error('Error auto-submitting test:', error);
      setToast({ type: 'error', message: 'انتهى الوقت ولكن حدث خطأ في التسليم التلقائي' });
      setTimeout(() => navigate('/student/dashboard'), 800);
    } finally {
      setSubmitting(false);
    }
  };

  // If an auto-submit was attempted before test loaded, run it when test arrives
  useEffect(() => {
    if (autoSubmitPending && test) {
      setAutoSubmitPending(false);
      // run auto-submit in next tick to avoid blocking rendering
      setTimeout(() => {
        handleAutoSubmit();
      }, 50);
    }
  }, [autoSubmitPending, test]);

  const handleSubmit = async () => {
    if (submitting || submitted) return;
    if (!test) {
      setToast({ type: 'error', message: 'بيانات الاختبار غير متوفرة. الرجاء إعادة المحاولة.' });
      return;
    }
    
    setSubmitting(true);
    try {
      let response;
      if (test.test_type === 'PHYSICAL_SHEET' && bubbleSheetFile) {
        const formData = new FormData();
        formData.append('bubbleSheet', bubbleSheetFile);
        response = await axios.post(`/tests/${testId}/upload-bubble-sheet`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      } else {
        // Submit test answers
        response = await axios.post(`/tests/${testId}/submit`, { answers });
      }
      
      if (response?.data?.submission) {
        // mark as submitted to disable inputs and buttons
        setSubmitted(true);
        setShowBubblePanel(false);
        if (test.test_type === 'PHYSICAL_SHEET' && !response.data.submission.graded) {
          setSubmissionResult(response.data.submission);
          setShowSubmittedModal(true);
        } else {
          try {
            const rankResponse = await axios.get(`/tests/${testId}/submissions/rank`);
            setSubmissionResult({
              ...response.data.submission,
              rank: rankResponse.data.rank,
              totalStudents: rankResponse.data.totalStudents
            });
          } catch (err) {
            setSubmissionResult(response.data.submission);
          }
          setShowGradeModal(true);
        }
      } else {
        setToast({ type: 'success', message: 'تم تسليم الاختبار بنجاح' });
        setTimeout(() => navigate('/student/dashboard'), 800);
      }
    } catch (error) {
      console.error('Error submitting test:', error);
      setToast({ type: 'error', message: 'حدث خطأ في تسليم الاختبار' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleMCQAnswer = (questionId, answer) => {
    if (submitting || submitted) return;
    setAnswers(prev => {
      const prevAnswers = Array.isArray(prev?.answers) ? prev.answers : [];
      return {
        ...(prev || {}),
        answers: [
          ...prevAnswers.filter(a => a.id !== questionId),
          { id: questionId, answer }
        ]
      };
    });
  };

  const handleBubbleSheetAnswer = (questionNumber, answer) => {
    if (submitting || submitted) return;
    setAnswers(prev => ({
      ...prev,
      answers: {
        ...prev.answers,
        [questionNumber]: answer
      }
    }));
  };

  const renderBubbleSheet = () => {
    const questionsPerColumn = 25; // Number of questions per column (desktop default)
    const totalQuestions = 50; // Total number of questions
    const isMobile = windowWidth <= 600;

    // Mobile: render a single column list from 1..totalQuestions
    if (isMobile) {
      const items = [];
      for (let q = 1; q <= totalQuestions; q++) {
        items.push(
          <div key={q} className="bubble-row">
            <div className="bubble-question" style={{ width: '100%' }}>
              <div className="question-number">{q}</div>
              <div className="bubble-options">
                {['A', 'B', 'C', 'D'].map(option => (
                  <label key={option} className="bubble-option">
                    <input
                      type="radio"
                      name={`q${q}`}
                      value={option}
                      checked={answers.answers?.[q] === option}
                      onChange={() => handleBubbleSheetAnswer(q, option)}
                      disabled={submitting || submitted}
                    />
                    <span className="bubble">{option}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        );
      }

      return (
        <div className="bubble-sheet" style={{ width: '90%', marginTop: 12 }}>
          <h3 style={{ textAlign: 'center' }}>ورقة الإجابات</h3>
          <div className="bubble-sheet-container">{items}</div>
        </div>
      );
    }

    // Desktop / tablet: original multi-column layout
    const totalColumns = Math.ceil(totalQuestions / questionsPerColumn);
    const rowsCount = questionsPerColumn;
    const rows = [];

    for (let row = 0; row < rowsCount; row++) {
      const cells = [];
      for (let col = 0; col < totalColumns; col++) {
        const questionNum = col * questionsPerColumn + row + 1;
        if (questionNum > totalQuestions) break;

        cells.push(
          <div key={questionNum} className="bubble-question">
            <div className="question-number">{questionNum}</div>
            <div className="bubble-options">
              {['A', 'B', 'C', 'D'].map(option => (
                <label key={option} className="bubble-option">
                  <input
                    type="radio"
                    name={`q${questionNum}`}
                    value={option}
                    checked={answers.answers?.[questionNum] === option}
                    onChange={() => handleBubbleSheetAnswer(questionNum, option)}
                    disabled={submitting || submitted}
                  />
                  <span className="bubble">{option}</span>
                </label>
              ))}
            </div>
          </div>
        );
      }

      rows.push(
        <div key={row} className="bubble-row">
          {cells}
        </div>
      );
    }

    return (
      <div className="bubble-sheet" style={{ width: '100%', marginTop: 12 }}>
        <h3 style={{ textAlign: 'center' }}>ورقة الإجابات</h3>
        <div className="bubble-sheet-container">{rows}</div>
      </div>
    );
  };

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  // Helper: compute score circle colors
  const getScoreColors = (scoreValue) => {
    const pct = Number(scoreValue) || 0;
    let bg = '#f2f6fb';
    if (pct >= 80) bg = '#28a745'; // green
    else if (pct >= 50) bg = '#f1c40f'; // yellow
    else bg = '#e74c3c'; // red
    return { background: bg, color: '#000' };
  };

  // NOW CONDITIONAL RETURNS CAN HAPPEN AFTER ALL HOOKS
  if (loading) {
    return <div className="loading">جاري تحميل الاختبار...</div>;
  }

  if (!test) {
    return <div className="error">لا يمكن العثور على الاختبار</div>;
  }

  const toggleImageViewer = () => {
    setShowImageViewer(!showImageViewer);
  };
  
  const toggleBubblePanel = () => setShowBubblePanel(s => !s);

  // For PHYSICAL_SHEET tests (images)
  if (test.test_type === 'PHYSICAL_SHEET') {
    return (
      <div className="test-taking-container">
        <div className="test-header">
          <h1>{test.title}</h1>
          {timeLeft !== null && (
            <div className="timer">
              الوقت المتبقي: {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
            </div>
          )}
        </div>
        
        <div className="test-content">
          <TestImageViewer testId={testId} />
          
          <div className="test-actions">
            <button 
              onClick={handleSubmit} 
              className="submit-btn"
              disabled={submitting || submitted}
            >
              {submitting ? 'جاري التقديم...' : submitted ? 'تم التسليم' : 'تسليم الاختبار'}
            </button>
          </div>
        </div>
        
        {/* Submitted (waiting for grading) modal for PHYSICAL_SHEET */}
        {showSubmittedModal && (
          // centered modal with overlay (same style as bubble sheet grade modal)
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1400 }}>
            <div style={{ background: '#fff', borderRadius: 8, padding: 20, maxWidth: 720, width: '90%', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
              <h3 style={{ marginTop: 0 }}>تم تسليم الاختبار بنجاح</h3>
              <div className="grade-details">
                <p>تم إرسال إجاباتك بنجاح. سيتم تصحيح الاختبار من قبل المعلم، يرجى الانتظار حتى اكتمال عملية التصحيح.</p>
              </div>
              <div style={{ textAlign: 'right', marginTop: 18 }}>
                <button 
                  className="btn-primary close-modal-btn"
                  onClick={() => {
                    setShowSubmittedModal(false);
                    navigate('/student/dashboard');
                  }}
                  style={{ background: '#007bff', color: '#fff', padding: '8px 14px', borderRadius: 6 }}
                >
                  العودة إلى لوحة التحكم
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Grade modal (still shown when a graded result is available) */}
        {showGradeModal && submissionResult && (
          <div className="grade-modal">
            <div className="modal-content">
              <h3>نتيجة الاختبار</h3>
              <div className="grade-display">
                {(() => {
                  const scorePct = parseFloat(submissionResult.score || 0).toFixed(0);
                  const style = getScoreColors(scorePct);
                  return (
                    <div className="score-circle" style={{ width: 120, height: 120, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: style.background }}>
                      <span className="score-number" style={{ fontSize: 28, fontWeight: 700, color: style.color }}>{scorePct}%</span>
                    </div>
                  );
                })()}
                <div className="grade-details">
                  <p><strong>اسم الاختبار:</strong> {test.title}</p>
                  <p><strong>الدرجة:</strong> {submissionResult.score || 0} من 100</p>
                  {submissionResult.rank && submissionResult.totalStudents && (
                    <p><strong>الترتيب:</strong> {submissionResult.rank} من {submissionResult.totalStudents}</p>
                  )}
                  <p><strong>حالة التصحيح:</strong> {submissionResult.graded ? 'تم التصحيح' : 'في انتظار التصحيح'}</p>
                  {submissionResult.teacher_comment && (
                    <p><strong>تعليق المعلم:</strong> {submissionResult.teacher_comment}</p>
                  )}
                  <p><strong>تاريخ التسليم:</strong> {new Date(submissionResult.created_at).toLocaleString('ar-EG')}</p>
                </div>
              </div>
              <div className="modal-footer">
                <button 
                  className="btn-primary close-modal-btn"
                  onClick={() => {
                    setShowGradeModal(false);
                    navigate('/student/dashboard');
                  }}
                >
                  العودة للرئيسية
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
  
  // For BUBBLE_SHEET - full screen images with bubble overlay
  if (test.test_type === 'BUBBLE_SHEET') {
    // compute responsive panel and button positions
    const panelWidth = Math.min(520, Math.max(280, windowWidth - 48));
    const buttonLeftOpen = panelWidth >= windowWidth - 40 ? Math.max(12, windowWidth - 56) : panelWidth;
     return (
       <div className="test-taking-container bubble-sheet-fullscreen">
         <TestImageViewer testId={testId} />

         {/* Slide-in bubble panel */}
         <div className={`bubble-panel ${showBubblePanel ? 'open' : ''}`} style={{ position: 'fixed', left: 0, top: 0, height: '100%', width: panelWidth, background: '#fff', zIndex: 1150, transform: showBubblePanel ? 'translateX(0)' : `translateX(-${panelWidth}px)`, transition: 'transform 300ms ease', boxShadow: '2px 0 8px rgba(0,0,0,0.12)'}}>
           <div style={{ padding: 12, overflowY: 'auto', height: '100%' }}>
             {/* header with close button to allow contracting on mobile */}
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
               <h3 style={{ margin: 0 }}>ورقة الإجابات</h3>
               <button onClick={toggleBubblePanel} aria-label="إغلاق" style={{ background: 'transparent', border: 'none', fontSize: 18, padding: '6px 8px', cursor: 'pointer' }}>✕</button>
             </div>

             {/* Timer at top of bubble panel */}
             {timeLeft !== null && (
               <div style={{ marginBottom: 12 }}>
                 <div className={`timer ${timeLeft < 300 ? 'warning' : ''}`}>
                   الوقت المتبقي: {formatTime(timeLeft)}
                 </div>
               </div>
             )}

             {renderBubbleSheet()}
             <div style={{ textAlign: 'center', marginTop: 12 }}>
               <button className="submit-btn" onClick={handleSubmit} disabled={submitting || submitted} style={{ background: '#007bff', color: '#fff', padding: '10px 18px', borderRadius: 6 }}>
                {submitting ? 'جاري التقديم...' : 'تسليم الاختبار'}
              </button>
             </div>
           </div>
         </div>

         {/* Floating toggle button that moves with panel */}
         <button
           className="bubble-toggle-button"
           onClick={toggleBubblePanel}
           aria-label="Toggle bubble panel"
           style={{ position: 'fixed', left: showBubblePanel ? buttonLeftOpen : 12, top: '50%', transform: 'translateY(-50%)', background: '#007bff', color: '#fff', borderRadius: 8, padding: '10px 12px', zIndex: 1200, transition: 'left 300ms ease' }}
         >
           ☰
         </button>

        {/* Grade modal for bubble sheet tests */}
        {showGradeModal && submissionResult && (
          // centered modal with overlay
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1400 }}>
            <div style={{ background: '#fff', borderRadius: 8, padding: 20, maxWidth: 720, width: '90%', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
              <h3 style={{ marginTop: 0 }}>نتيجة الاختبار</h3>
              <div className="grade-display" style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                {(() => {
                  const scorePct = parseFloat(submissionResult.score || 0).toFixed(0);
                  const style = getScoreColors(scorePct);
                  return (
                    <div className="score-circle" style={{ width: 120, height: 120, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: style.background }}>
                      <span className="score-number" style={{ fontSize: 28, fontWeight: 700, color: style.color }}>{scorePct}%</span>
                    </div>
                  );
                })()}
                <div className="grade-details">
                  <p><strong>اسم الاختبار:</strong> {test.title}</p>
                  <p><strong>الدرجة:</strong> {submissionResult.score || 0} من 100</p>
                  {submissionResult.rank && submissionResult.totalStudents && (
                    <p><strong>الترتيب:</strong> {submissionResult.rank} من {submissionResult.totalStudents}</p>
                  )}
                  <p><strong>حالة التصحيح:</strong> {submissionResult.graded ? 'تم التصحيح' : 'في انتظار التصحيح'}</p>
                  {submissionResult.teacher_comment && (
                    <p><strong>تعليق المعلم:</strong> {submissionResult.teacher_comment}</p>
                  )}
                  <p><strong>تاريخ التسليم:</strong> {submissionResult.created_at ? new Date(submissionResult.created_at).toLocaleString('ar-EG') : ''}</p>
                </div>
              </div>
              <div style={{ textAlign: 'right', marginTop: 18 }}>
                <button className="btn-primary close-modal-btn" onClick={() => { setShowGradeModal(false); navigate('/student/dashboard'); }} style={{ background: '#007bff', color: '#fff', padding: '8px 14px', borderRadius: 6 }}>العودة للرئيسية</button>
              </div>
            </div>
          </div>
        )}

         {/* Toast */}
         {toast && (
           <div className={`toast ${toast.type}`} style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 1300 }}>
             {toast.message}
           </div>
         )}
       </div>
     );
   }
  
  // For other test types (MCQ, BUBBLE_SHEET, etc.)
  return (
    <div className="test-taking-container">
      {showImageViewer && test.images && test.images.length > 0 && (
        <div className="test-image-viewer-modal">
          <div className="test-image-viewer-header">
            <h3>عرض صور الاختبار</h3>
            <button 
              className="close-button" 
              onClick={toggleImageViewer}
              aria-label="إغلاق معرض الصور"
            >
              &times;
            </button>
          </div>
          <div className="test-image-viewer-content">
            <TestImageViewer testId={testId} />
          </div>
        </div>
      )}

      <div className="test-header">
        <div className="test-title-container">
          <h2>{test.title}</h2>
          {test.images && test.images.length > 0 && (
            <button 
              className="view-images-button"
              onClick={toggleImageViewer}
              title="عرض صور الاختبار"
            >
              <i className="fas fa-images"></i> عرض صور الاختبار
            </button>
          )}
        </div>
        
        {timeLeft !== null && (
          <div className={`timer ${timeLeft < 300 ? 'warning' : ''}`}>
            <span>الوقت المتبقي: {formatTime(timeLeft)}</span>
          </div>
        )}

      </div>

      <div className="test-content" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {test.questions && test.questions.length > 0 ? (
          test.questions.map((question, index) => {
            const isMCQ = question.type === 'MCQ' && Array.isArray(question.options);
            const selected = (answers?.answers || []).find(a => a.id === question.id)?.answer;
            return (
              <div
                key={question.id || index}
                className="question-card"
                style={{
                  background: '#fff',
                  borderRadius: 8,
                  boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
                  padding: 16,
                  position: 'relative',
                  border: '1px solid #eee'
                }}
              >
                {/* Number badge top-right */}
                <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    background: '#f1f3f4',
                    borderRadius: 20,
                    padding: '4px 10px',
                    fontSize: 12,
                    color: '#333'
                  }}>
                    سؤال {index + 1}
                  </span>
                  {question.points && (
                    <span style={{ fontSize: 12, color: '#666' }}>({question.points} نقطة)</span>
                  )}
                </div>

                {/* Question text and media */}
                <div style={{ paddingTop: 24 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 10, lineHeight: 1.6 }}>
                    {question.text}
                  </div>
                  {question.media && (
                    <div className="question-media" style={{ marginTop: 8 }}>
                      {String(question.media).endsWith('.mp4') ? (
                        <video controls style={{ maxWidth: '100%', borderRadius: 6 }}>
                          <source src={question.media} type="video/mp4" />
                        </video>
                      ) : (
                        <img src={question.media} alt="سؤال" style={{ maxWidth: '100%', borderRadius: 6 }} />
                      )}
                    </div>
                  )}
                </div>

                {/* Options for MCQ */}
                {isMCQ && (
                  <div className="options" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                    {question.options.map((option, optIndex) => (
                      <label
                        key={optIndex}
                        className="option"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '10px 12px',
                          borderRadius: 8,
                          border: '1px solid #e5e7eb',
                          cursor: submitting || submitted ? 'not-allowed' : 'pointer',
                          background: selected === option ? '#f8fafc' : '#fff'
                        }}
                      >
                        <input
                          type="radio"
                          name={`question-${question.id}`}
                          value={option}
                          checked={selected === option}
                          onChange={() => handleMCQAnswer(question.id, option)}
                          disabled={submitting || submitted}
                        />
                        <span>{option}</span>
                      </label>
                    ))}
                  </div>
                )}

                {/* Open answer */}
                {question.type === 'OPEN' && (
                  <div className="open-answer" style={{ marginTop: 12 }}>
                    <textarea
                      placeholder="اكتب إجابتك هنا..."
                      value={(answers?.answers || []).find(a => a.id === question.id)?.answer || ''}
                      onChange={(e) => handleMCQAnswer(question.id, e.target.value)}
                      style={{ width: '100%', minHeight: 96, padding: 10, borderRadius: 8, border: '1px solid #e5e7eb' }}
                      disabled={submitting || submitted}
                    />
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="no-questions">
            <p>لا توجد أسئلة متاحة لهذا الاختبار حالياً.</p>
          </div>
        )}
      </div>

      {/* Actions footer */}
      <div className="test-actions" style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={handleSubmit}
          className="submit-btn"
          disabled={submitting || submitted}
          style={{ background: '#007bff', color: '#fff', padding: '10px 18px', borderRadius: 6 }}
        >
          {submitting ? 'جاري التقديم...' : submitted ? 'تم التسليم' : 'تسليم الاختبار'}
        </button>
      </div>

      {showGradeModal && submissionResult && (
        // centered modal with overlay
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1400 }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 20, maxWidth: 720, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
            <h3 style={{ marginTop: 0 }}>نتيجة الاختبار</h3>
            <div className="grade-display" style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
              {(() => {
                const scorePct = parseFloat(submissionResult.score || 0).toFixed(0);
                const style = getScoreColors(scorePct);
                return (
                  <div className="score-circle" style={{ width: 120, height: 120, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: style.background }}>
                    <span className="score-number" style={{ fontSize: 28, fontWeight: 700, color: style.color }}>{scorePct}%</span>
                  </div>
                );
              })()}
              <div className="grade-details">
                <p><strong>اسم الاختبار:</strong> {test.title}</p>
                <p><strong>الدرجة:</strong> {submissionResult.score || 0} من 100</p>
                {submissionResult.rank && submissionResult.totalStudents && (
                  <p><strong>الترتيب:</strong> {submissionResult.rank} من {submissionResult.totalStudents}</p>
                )}
                <p><strong>حالة التصحيح:</strong> {submissionResult.graded ? 'تم التصحيح' : 'في انتظار التصحيح'}</p>
                {submissionResult.teacher_comment && (
                  <p><strong>تعليق المعلم:</strong> {submissionResult.teacher_comment}</p>
                )}
                <p><strong>تاريخ التسليم:</strong> {submissionResult.created_at ? new Date(submissionResult.created_at).toLocaleString('ar-EG') : ''}</p>
              </div>
            </div>
            <div style={{ textAlign: 'right', marginTop: 18 }}>
              <button className="btn-primary close-modal-btn" onClick={() => { setShowGradeModal(false); navigate('/student/dashboard'); }} style={{ background: '#007bff', color: '#fff', padding: '8px 14px', borderRadius: 6 }}>العودة للرئيسية</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`toast ${toast.type}`} style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 1300 }}>
          {toast.message}
        </div>
      )}
    </div>
  );
};

export default TestTaking;