import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import './TestTaking.css';

const TestTaking = () => {
  const { testId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [test, setTest] = useState(null);
  const [answers, setAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [bubbleSheetFile, setBubbleSheetFile] = useState(null);
  const [showGradeModal, setShowGradeModal] = useState(false);
  const [submissionResult, setSubmissionResult] = useState(null);

  useEffect(() => {
    fetchTest();
  }, [testId]);

  // Removed createTestAnswerRecord - no need to create draft submissions

  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    } else if (timeLeft === 0) {
      handleAutoSubmit();
    }
  }, [timeLeft]);

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

  // Removed createTestAnswerRecord function - no longer needed

  const handleAutoSubmit = async () => {
    if (submitting) return;
    
    setSubmitting(true);
    try {
      if (test.test_type === 'PHYSICAL_SHEET' && bubbleSheetFile) {
        const formData = new FormData();
        formData.append('bubbleSheet', bubbleSheetFile);
        await axios.post(`/tests/${testId}/upload-bubble-sheet`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      } else {
        const response = await axios.post(`/tests/${testId}/submit`, { answers });
        if (response.data.submission) {
          setSubmissionResult(response.data.submission);
          setShowGradeModal(true);
          return;
        }
      }
      
      alert('انتهى الوقت المحدد وتم تسليم الاختبار تلقائياً');
      navigate('/student/dashboard');
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

  const handleSubmit = async () => {
    if (submitting) return;
    
    setSubmitting(true);
    try {
      let response;
      if (test.test_type === 'PHYSICAL_SHEET' && bubbleSheetFile) {
        // Upload bubble sheet for physical test
        const formData = new FormData();
        formData.append('bubbleSheet', bubbleSheetFile);
        response = await axios.post(`/tests/${testId}/upload-bubble-sheet`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      } else {
        // Submit test answers using POST only
        response = await axios.post(`/tests/${testId}/submit`, { answers });
      }
      
      // Show grade modal if submission was successful and graded
      if (response.data.submission) {
        setSubmissionResult(response.data.submission);
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
                      pdfViewer.style.width = '50%';
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
                <iframe
                  src={`https://studentportal.egypt-tech.com/${test.pdf_file_path.replace(/\\/g, '/')}`}
                  width="100%"
                  height="600px"
                  title="ورقة الامتحان"
                />
              ) : (
                <p>لم يتم رفع ورقة الامتحان</p>
              )}
            </div>
            
            <div className="bubble-sheet">
              <h3>بابل الكتروني</h3>
              <div className="bubble-grid">
                {Array.from({ length: 50 }, (_, i) => i + 1).map(questionNum => (
                  <div key={questionNum} className="bubble-question">
                    <span className="question-number">{questionNum}</span>
                    <div className="bubble-options">
                      {['A', 'B', 'C', 'D'].map(option => (
                        <label key={option} className="bubble-option">
                          <input
                            type="radio"
                            name={`bubble-${questionNum}`}
                            value={option}
                            onChange={() => handleBubbleSheetAnswer(questionNum, option)}
                          />
                          <span className="bubble">{option}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
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
                <iframe
                  src={`https://studentportal.egypt-tech.com/${test.pdf_file_path.replace(/\\/g, '/')}`}
                  width="100%"
                  height="600px"
                  title="ورقة الامتحان"
                />
              ) : (
                <p>لم يتم رفع ورقة الامتحان</p>
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
                  <span className="score-number">{parseFloat(submissionResult.score).toFixed(0)}%</span>
                </div>
                <div className="grade-details">
                  <p><strong>اسم الاختبار:</strong> {test.title}</p>
                  <p><strong>الدرجة:</strong> {submissionResult.score} من 100</p>
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
