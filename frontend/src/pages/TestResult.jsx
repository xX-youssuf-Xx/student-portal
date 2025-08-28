import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import './TestResult.css';

const TestResult = () => {
  const { testId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAnswers, setShowAnswers] = useState(false);

  useEffect(() => {
    fetchResult();
  }, [testId]);

  const fetchResult = async () => {
    try {
      const response = await axios.get(`/tests/${testId}/result`);
      setResult(response.data.result);
    } catch (error) {
      console.error('Error fetching result:', error);
      alert('حدث خطأ في تحميل النتيجة');
      navigate('/student/dashboard');
    } finally {
      setLoading(false);
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
      case 'BUBBLE_SHEET': return 'ورقة إجابة';
      case 'PHYSICAL_SHEET': return 'ورقة فيزيائية';
      default: return type;
    }
  };

  const getScoreColor = (score) => {
    if (score >= 85) return '#4CAF50'; // Green
    if (score >= 70) return '#FF9800'; // Orange
    if (score >= 50) return '#FFC107'; // Yellow
    return '#F44336'; // Red
  };

  const renderMCQComparison = () => {
    if (!result.correct_answers_visible || !result.correct_answers_visible.questions) {
      return null;
    }

    // Handle both string and object formats for visible_answers
    let studentAnswers;
    try {
      studentAnswers = typeof result.visible_answers === 'string' 
        ? JSON.parse(result.visible_answers) 
        : result.visible_answers;
    } catch (error) {
      console.error('Error parsing visible_answers:', error);
      return <div>خطأ في تحميل الإجابات</div>;
    }
    
    const correctQuestions = result.correct_answers_visible.questions;

    return (
      <div className="answers-comparison">
        <h3>مقارنة الإجابات</h3>
        {correctQuestions.map((question, index) => {
          const studentAnswer = studentAnswers.answers?.find(a => a.id === question.id);
          const isCorrect = studentAnswer?.answer === question.correct;
          
          return (
            <div key={question.id} className={`question-comparison ${isCorrect ? 'correct' : 'incorrect'}`}>
              <div className="question-header">
                <h4>السؤال {index + 1}</h4>
                <span className={`result-badge ${isCorrect ? 'correct' : 'incorrect'}`}>
                  {isCorrect ? '✓ صحيح' : '✗ خطأ'}
                </span>
              </div>
              
              <div className="question-text">
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
                <div className="options-comparison">
                  {question.options.map((option, optIndex) => {
                    const isStudentAnswer = studentAnswer?.answer === option;
                    const isCorrectAnswer = question.correct === option;
                    
                    return (
                      <div 
                        key={optIndex} 
                        className={`option-item ${
                          isCorrectAnswer ? 'correct-answer' : ''
                        } ${
                          isStudentAnswer && !isCorrectAnswer ? 'wrong-answer' : ''
                        } ${
                          isStudentAnswer && isCorrectAnswer ? 'student-correct' : ''
                        }`}
                      >
                        <span>{option}</span>
                        {isCorrectAnswer && <span className="correct-mark">✓ الإجابة الصحيحة</span>}
                        {isStudentAnswer && !isCorrectAnswer && <span className="wrong-mark">✗ إجابتك</span>}
                        {isStudentAnswer && isCorrectAnswer && <span className="student-mark">✓ إجابتك الصحيحة</span>}
                      </div>
                    );
                  })}
                </div>
              )}

              {question.type === 'OPEN' && (
                <div className="open-answer-comparison">
                  <div className="student-answer">
                    <h5>إجابتك:</h5>
                    <p>{studentAnswer?.answer || 'لم تجب'}</p>
                  </div>
                  {result.teacher_comment && (
                    <div className="teacher-feedback">
                      <h5>تعليق المعلم:</h5>
                      <p>{result.teacher_comment}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderBubbleSheetComparison = () => {
    if (!result.correct_answers_visible || !result.correct_answers_visible.answers) {
      return null;
    }

    // Handle both string and object formats for visible_answers
    let studentAnswers;
    try {
      studentAnswers = typeof result.visible_answers === 'string' 
        ? JSON.parse(result.visible_answers) 
        : result.visible_answers;
    } catch (error) {
      console.error('Error parsing visible_answers:', error);
      return <div>خطأ في تحميل الإجابات</div>;
    }
    const correctAnswers = result.correct_answers_visible.answers;

    return (
      <div className="bubble-comparison">
        <h3>مقارنة الإجابات</h3>
        <div className="bubble-grid-comparison">
          {Object.entries(correctAnswers).map(([questionNum, correctAnswer]) => {
            const studentAnswer = studentAnswers.answers?.[questionNum];
            const isCorrect = studentAnswer === correctAnswer;
            
            return (
              <div key={questionNum} className={`bubble-item ${isCorrect ? 'correct' : 'incorrect'}`}>
                <span className="question-num">س{questionNum}</span>
                <div className="answers">
                  <span className="student-answer">إجابتك: {studentAnswer || '-'}</span>
                  <span className="correct-answer">الصحيح: {correctAnswer}</span>
                </div>
                <span className={`result-icon ${isCorrect ? 'correct' : 'incorrect'}`}>
                  {isCorrect ? '✓' : '✗'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (loading) {
    return <div className="loading">جاري تحميل النتيجة...</div>;
  }

  if (!result) {
    return <div className="error">لم يتم العثور على النتيجة</div>;
  }

  return (
    <div className="test-result">
      <div className="result-header">
        <button className="back-btn" onClick={() => navigate('/student/dashboard')}>
          ← العودة للوحة التحكم
        </button>
        <h1>نتيجة الاختبار</h1>
      </div>

      <div className="result-content">
        {/* Test Info */}
        <div className="test-info-card">
          <h2>{result.title}</h2>
          <div className="test-meta">
            <span>نوع الاختبار: {getTestTypeLabel(result.test_type)}</span>
            <span>تاريخ التقديم: {formatDate(result.submitted_at)}</span>
          </div>
        </div>

        {/* Score Display */}
        {result.visible_score !== null && (
          <div className="score-card">
            <div className="score-circle" style={{ borderColor: getScoreColor(result.visible_score) }}>
              <span className="score-value" style={{ color: getScoreColor(result.visible_score) }}>
                {result.visible_score}%
              </span>
            </div>
            <div className="score-details">
              <h3>درجتك</h3>
              <p className="score-description">
                {result.visible_score >= 85 && 'ممتاز! أداء رائع'}
                {result.visible_score >= 70 && result.visible_score < 85 && 'جيد جداً! استمر في التحسن'}
                {result.visible_score >= 50 && result.visible_score < 70 && 'جيد، يمكنك التحسن أكثر'}
                {result.visible_score < 50 && 'يحتاج إلى مراجعة المادة'}
              </p>
            </div>
          </div>
        )}

        {/* Teacher Comment */}
        {result.teacher_comment && (
          <div className="teacher-comment-card">
            <h3>تعليق المعلم</h3>
            <p>{result.teacher_comment}</p>
          </div>
        )}

        {/* Show/Hide Answers Button */}
        {result.visible_answers && result.correct_answers_visible && (
          <div className="answers-toggle">
            <button 
              className="btn-outline"
              onClick={() => setShowAnswers(!showAnswers)}
            >
              {showAnswers ? 'إخفاء الإجابات' : 'عرض الإجابات والمقارنة'}
            </button>
          </div>
        )}

        {/* Answers Comparison */}
        {showAnswers && result.visible_answers && result.correct_answers_visible && (
          <div className="answers-section">
            {result.test_type === 'MCQ' && renderMCQComparison()}
            {result.test_type === 'BUBBLE_SHEET' && renderBubbleSheetComparison()}
            {result.test_type === 'PHYSICAL_SHEET' && (
              <div className="physical-sheet-result">
                <h3>ورقة الإجابة المرفوعة</h3>
                <p>تم رفع ورقة الإجابة وتصحيحها من قبل المعلم</p>
              </div>
            )}
          </div>
        )}

        {/* PDF Viewer for Reference */}
        {result.pdf_file_path && (
          <div className="test-pdf-reference">
            <h3>ورقة الامتحان للمراجعة</h3>
            <iframe
              src={`https://studentportal.egypt-tech.com/${result.pdf_file_path}`}
              width="100%"
              height="600px"
              title="ورقة الامتحان"
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default TestResult;
