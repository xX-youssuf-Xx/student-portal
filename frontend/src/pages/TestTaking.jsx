import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import PDFViewer from '../components/PDFViewer';
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

  // Handle test submission when time runs out
  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setTimeout(() => {
        setTimeLeft(timeLeft - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (timeLeft === 0) {
      handleAutoSubmit();
    }
  }, [timeLeft]);

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
          alert('تم اكتشاف محاولة أخذ لقطة شاشة. سيتم إنهاء الاختبار بعد 3 محاولات.');
          if (visibilityChangeCount >= 3) {
            handleAutoSubmit();
          }
        } else {
          alert('يُرجى عدم محاولة أخذ لقطة شاشة أثناء الاختبار.');
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

  // CSS prevention effect - MOVED BEFORE CONDITIONAL RETURNS
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      body {
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        -khtml-user-select: none;
        -moz-user-select: none;
        -ms-user-select: none;
        user-select: none;
      }
      * {
        -webkit-user-drag: none;
        -khtml-user-drag: none;
        -moz-user-select: none;
        -o-user-drag: none;
        user-drag: none;
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // HELPER FUNCTIONS (these can be anywhere but are typically after hooks)
  const fetchTest = async () => {
    try {
      // First get basic test info
      const startResponse = await axios.get(`/tests/${testId}/start`);
      const testData = startResponse.data.test;
      
      // For MCQ tests, get questions separately
      if (testData.test_type === 'MCQ') {
        const questionsResponse = await axios.get(`/tests/${testId}/questions`);
        const testWithQuestions = questionsResponse.data.test;
        testData.questions = testWithQuestions.questions || [];
      }
      
      setTest(testData);
      
      // Set timer if duration is specified
      if (testData.duration_minutes) {
        setTimeLeft(testData.duration_minutes * 60);
      }
      
      // Initialize answers based on test type
      if (testData.test_type === 'MCQ') {
        setAnswers({ answers: [] });
      } else if (testData.test_type === 'BUBBLE_SHEET') {
        setAnswers({ answers: {} });
      }
    } catch (error) {
      console.error('Error fetching test:', error);
      alert('حدث خطأ في تحميل الاختبار');
      navigate('/student/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const handleAutoSubmit = async () => {
    if (submitting) return;
    
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
        // Fetch rank after successful submission
        try {
          const rankResponse = await axios.get(`/tests/${testId}/submissions/rank`);
          setSubmissionResult({
            ...response.data.submission,
            rank: rankResponse.data.rank,
            totalStudents: rankResponse.data.totalStudents
          });
        } catch (error) {
          console.error('Error fetching rank:', error);
          setSubmissionResult(response.data.submission);
        }
        setShowGradeModal(true);
      } else {
        alert('تم تسليم الاختبار بنجاح');
        navigate('/student/dashboard');
      }
    } catch (error) {
      console.error('Error auto-submitting test:', error);
      alert('انتهى الوقت ولكن حدث خطأ في التسليم التلقائي');
      navigate('/student/dashboard');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMCQAnswer = (questionId, answer) => {
    setAnswers(prev => ({
      ...prev,
      answers: [
        ...prev.answers.filter(a => a.id !== questionId),
        { id: questionId, answer }
      ]
    }));
  };

  const handleBubbleSheetAnswer = (questionNumber, answer) => {
    setAnswers(prev => ({
      ...prev,
      answers: {
        ...prev.answers,
        [questionNumber]: answer
      }
    }));
  };

  const renderBubbleSheet = () => {
    const rows = [];
    const questionsPerColumn = 25; // Number of questions per column
    const totalQuestions = 50; // Total number of questions
    const totalColumns = Math.ceil(totalQuestions / questionsPerColumn);
    
    // Create rows for each question in the column
    for (let row = 0; row < questionsPerColumn; row++) {
      const cells = [];
      // Create cells for each column
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
                    disabled={submitting}
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
      <div className="bubble-sheet-container">
        {rows}
      </div>
    );
  };

  const handleSubmit = async () => {
    if (submitting) return;
    
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
        // Fetch rank after successful submission
        try {
          const rankResponse = await axios.get(`/tests/${testId}/submissions/rank`);
          setSubmissionResult({
            ...response.data.submission,
            rank: rankResponse.data.rank,
            totalStudents: rankResponse.data.totalStudents
          });
        } catch (error) {
          console.error('Error fetching rank:', error);
          setSubmissionResult(response.data.submission);
        }
        setShowGradeModal(true);
      } else {
        alert('تم تسليم الاختبار بنجاح');
        navigate('/student/dashboard');
      }
    } catch (error) {
      console.error('Error submitting test:', error);
      alert('حدث خطأ في تسليم الاختبار');
    } finally {
      setSubmitting(false);
    }
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

  // NOW CONDITIONAL RETURNS CAN HAPPEN AFTER ALL HOOKS
  if (loading) {
    return <div className="loading">جاري تحميل الاختبار...</div>;
  }

  if (!test) {
    return <div className="error">لم يتم العثور على الاختبار</div>;
  }

  return (
    <div className="test-taking">
      <div className="test-header">
        <h1>{test.title}</h1>
        {timeLeft !== null && (
          <div className={`timer ${timeLeft < 300 ? 'warning' : ''}`}>
            <span>الوقت المتبقي: {formatTime(timeLeft)}</span>
          </div>
        )}
      </div>

      <div className="test-content">
        {/* MCQ Test */}
        {test.test_type === 'MCQ' && test.questions && (
          <div className="mcq-test">
            {test.questions.map((question, index) => (
              <div key={question.id} className="question-card">
                <div className="question-header">
                  <h3>السؤال {index + 1}</h3>
                </div>
                <div className="question-content">
                  <p>{question.text}</p>
                  {question.media && (
                    <div className="question-media">
                      {question.media.endsWith('.mp4') ? (
                        <video controls>
                          <source src={question.media} type="video/mp4" />
                        </video>
                      ) : (
                        <img src={question.media} alt="سؤال" />
                      )}
                    </div>
                  )}
                </div>
                {question.type === 'MCQ' && question.options && (
                  <div className="options">
                    {question.options.map((option, optIndex) => (
                      <label key={optIndex} className="option">
                        <input
                          type="radio"
                          name={`question-${question.id}`}
                          value={option}
                          onChange={() => handleMCQAnswer(question.id, option)}
                        />
                        <span>{option}</span>
                      </label>
                    ))}
                  </div>
                )}
                {question.type === 'OPEN' && (
                  <div className="open-answer">
                    <textarea
                      placeholder="اكتب إجابتك هنا..."
                      onChange={(e) => handleMCQAnswer(question.id, e.target.value)}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Bubble Sheet Test */}
        {test.test_type === 'BUBBLE_SHEET' && (
          <div className="bubble-sheet-test">
            <div className="pdf-viewer">
              <div className="pdf-header">
                <h3>ورقة الامتحان</h3>
                <button 
                  className="btn-hide-bubbles"
                  onClick={() => {
                    const bubbleSheet = document.querySelector('.bubble-sheet-test .bubble-sheet');
                    const pdfViewer = document.querySelector('.bubble-sheet-test .pdf-viewer');
                    if (bubbleSheet.style.display === 'none') {
                      bubbleSheet.style.display = 'block';
                      pdfViewer.style.width = '55%';
                    } else {
                      bubbleSheet.style.display = 'none';
                      pdfViewer.style.width = '100%';
                    }
                  }}
                >
                  إخفاء/إظهار البابل
                </button>
              </div>
              {test.pdf_file_path ? (
                <div className="pdf-container">
                  <PDFViewer 
                    pdfUrl={`http://localhost:3000/${test.pdf_file_path.replace(/\\/g, '/')}`}
                    height="100%"
                  />
                </div>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-gray-500">لم يتم رفع ورقة الامتحان</p>
                </div>
              )}
            </div>
            
            <div className="bubble-sheet">
              <h3>بابل الكتروني</h3>
              {renderBubbleSheet()}
            </div>
          </div>
        )}

        {/* Physical Sheet Test */}
        {test.test_type === 'PHYSICAL_SHEET' && (
          <div className="physical-sheet-test">
            <div className="pdf-viewer">
              <div className="pdf-header">
                <h3>ورقة الامتحان</h3>
                <button 
                  className="btn-hide-upload"
                  onClick={() => {
                    const uploadSection = document.querySelector('.physical-sheet-test .bubble-sheet-upload');
                    const pdfViewer = document.querySelector('.physical-sheet-test .pdf-viewer');
                    if (uploadSection.style.display === 'none') {
                      uploadSection.style.display = 'block';
                      pdfViewer.style.width = '50%';
                    } else {
                      uploadSection.style.display = 'none';
                      pdfViewer.style.width = '100%';
                    }
                  }}
                >
                  إخفاء/إظهار رفع الملف
                </button>
              </div>
              {test.pdf_file_path ? (
                <div className="pdf-container">
                  <PDFViewer 
                    pdfUrl={`http://localhost:3000/${test.pdf_file_path.replace(/\\/g, '/')}`}
                    height="100%"
                  />
                </div>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-gray-500">لم يتم رفع ورقة الامتحان</p>
                </div>
              )}
            </div>
            
            <div className="bubble-sheet-upload">
              <h3>بابل حقيقي - رفع ورقة الإجابة</h3>
              <p>قم بحل الامتحان على الورق ثم ارفع صورة ورقة الإجابة</p>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => setBubbleSheetFile(e.target.files[0])}
                className="file-input"
              />
              {bubbleSheetFile && (
                <p className="file-selected">تم اختيار: {bubbleSheetFile.name}</p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="test-footer">
        <button
          className="btn-primary submit-btn"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? 'جاري التسليم...' : 'تسليم الاختبار'}
        </button>
      </div>

      {/* Grade Modal */}
      {showGradeModal && submissionResult && (
        <div className="modal-overlay">
          <div className="grade-modal">
            <div className="modal-header">
              <h2>نتيجة الاختبار</h2>
            </div>
            <div className="modal-body">
              <div className="grade-display">
                <div className="score-circle">
                  <span className="score-number">{parseFloat(submissionResult.score || 0).toFixed(0)}%</span>
                </div>
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
            </div>
            <div className="modal-footer">
              <button 
                className="btn-primary close-modal-btn"
                onClick={() => {
                  setShowGradeModal(false);
                  navigate('/student/dashboard');
                }}
              >
                العودة إلى لوحة التحكم
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TestTaking;