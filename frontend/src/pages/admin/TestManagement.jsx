import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import './TestManagement.css';

const TestManagement = () => {
  const { user } = useAuth();
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTest, setEditingTest] = useState(null);
  const [selectedTest, setSelectedTest] = useState(null);
  const [submissions, setSubmissions] = useState([]);

  useEffect(() => {
    fetchTests();
  }, []);

  const fetchTests = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/tests');
      setTests(response.data.tests || []);
    } catch (error) {
      console.error('Error fetching tests:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSubmissions = async (testId) => {
    try {
      const response = await axios.get(`/tests/${testId}/submissions`);
      setSubmissions(response.data.submissions || []);
    } catch (error) {
      console.error('Error fetching submissions:', error);
    }
  };

  const deleteTest = async (testId) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الاختبار؟')) return;
    
    try {
      await axios.delete(`/tests/${testId}`);
      fetchTests();
    } catch (error) {
      console.error('Error deleting test:', error);
      alert('حدث خطأ في حذف الاختبار');
    }
  };

  const toggleViewPermission = async (testId, currentPermission) => {
    try {
      await axios.patch(`/tests/${testId}/view-permission`, {
        view_permission: !currentPermission
      });
      fetchTests();
    } catch (error) {
      console.error('Error updating view permission:', error);
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

  const viewSubmissions = (test) => {
    setSelectedTest(test);
    fetchSubmissions(test.id);
  };

  if (loading) {
    return <div className="loading">جاري التحميل...</div>;
  }

  return (
    <div className="test-management">
      <div className="page-header">
        <h1>إدارة الاختبارات</h1>
        <button 
          className="btn-primary"
          onClick={() => setShowCreateModal(true)}
        >
          إضافة اختبار جديد
        </button>
      </div>

      {/* Tests Grid */}
      <div className="tests-grid">
        {tests.length === 0 ? (
          <div className="no-tests">
            <p>لا توجد اختبارات</p>
          </div>
        ) : (
          tests.map(test => (
            <div key={test.id} className="test-card">
              <div className="test-header">
                <h3>{test.title}</h3>
                <span className="test-type">{getTestTypeLabel(test.test_type)}</span>
              </div>
              
              <div className="test-details">
                <p><strong>الصف:</strong> {getGradeLabel(test.grade)}</p>
                {test.student_group && (
                  <p><strong>المجموعة:</strong> {getGroupLabel(test.student_group)}</p>
                )}
                <p><strong>وقت البداية:</strong> {formatDate(test.start_time)}</p>
                <p><strong>وقت النهاية:</strong> {formatDate(test.end_time)}</p>
                {test.duration_minutes && (
                  <p><strong>المدة:</strong> {test.duration_minutes} دقيقة</p>
                )}
              </div>

              <div className="test-stats">
                <div className="stat">
                  <span className="stat-number">{test.submission_count || 0}</span>
                  <span className="stat-label">مشارك</span>
                </div>
                <div className="stat">
                  <span className="stat-number">{test.graded_count || 0}</span>
                  <span className="stat-label">مُصحح</span>
                </div>
              </div>

              <div className="test-controls">
                <div className="view-permission">
                  <label>
                    <input
                      type="checkbox"
                      checked={test.view_permission}
                      onChange={() => toggleViewPermission(test.id, test.view_permission)}
                    />
                    عرض النتائج للطلاب
                  </label>
                </div>
              </div>

              <div className="test-actions">
                <button 
                  className="btn-outline"
                  onClick={() => viewSubmissions(test)}
                >
                  عرض المشاركات
                </button>
                <button 
                  className="btn-secondary"
                  onClick={() => setEditingTest(test)}
                >
                  تعديل
                </button>
                <button 
                  className="btn-danger"
                  onClick={() => deleteTest(test.id)}
                >
                  حذف
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create/Edit Test Modal */}
      {(showCreateModal || editingTest) && (
        <TestModal
          test={editingTest}
          onClose={() => {
            setShowCreateModal(false);
            setEditingTest(null);
          }}
          onSave={() => {
            fetchTests();
            setShowCreateModal(false);
            setEditingTest(null);
          }}
        />
      )}

      {/* Submissions Modal */}
      {selectedTest && (
        <SubmissionsModal
          test={selectedTest}
          submissions={submissions}
          onClose={() => setSelectedTest(null)}
          onGradeUpdate={fetchTests}
        />
      )}
    </div>
  );
};

// Test Creation/Edit Modal Component
const TestModal = ({ test, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    title: test?.title || '',
    grade: test?.grade || '3HIGH',
    student_group: test?.student_group || '',
    test_type: test?.test_type || 'MCQ',
    start_time: test?.start_time ? new Date(test.start_time).toISOString().slice(0, 16) : '',
    end_time: test?.end_time ? new Date(test.end_time).toISOString().slice(0, 16) : '',
    duration_minutes: test?.duration_minutes || '',
    view_type: test?.view_type || 'IMMEDIATE',
    questions: test?.correct_answers?.questions || [],
    bubbleAnswers: test?.correct_answers?.answers || {}
  });
  
  // Debug: Log form data changes
  console.log('Form data student_group:', formData.student_group);
  const [pdfFile, setPdfFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      console.log('Submitting form with student_group:', formData.student_group);
      const formDataToSend = new FormData();
      
      // Add basic fields
      Object.entries(formData).forEach(([key, value]) => {
        if (key === 'questions' || key === 'bubbleAnswers') return;
        if (key === 'student_group') {
          // For 3MIDDLE, don't send group (always null)
          // For other grades, only send if not empty (empty means "all groups" = null)
          if (formData.grade === '3MIDDLE') return;
          if (value !== '' && value !== null && value !== undefined) {
            console.log('Adding student_group:', value);
            formDataToSend.append(key, value);
          } else {
            console.log('Skipping student_group (empty/null):', value);
          }
          return;
        }
        if (value !== '' && value !== null) {
          formDataToSend.append(key, value);
        }
      });

      // Add correct answers based on test type
      let correctAnswers = {};
      if (formData.test_type === 'MCQ') {
        correctAnswers = { questions: formData.questions };
      } else if (formData.test_type === 'BUBBLE_SHEET' || formData.test_type === 'PHYSICAL_SHEET') {
        correctAnswers = { answers: formData.bubbleAnswers };
      }
      
      if (Object.keys(correctAnswers).length > 0) {
        formDataToSend.append('correct_answers', JSON.stringify(correctAnswers));
      }

      // Add PDF file if provided
      if (pdfFile) {
        formDataToSend.append('pdf', pdfFile);
      }

      if (test) {
        await axios.put(`/tests/${test.id}`, formDataToSend, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      } else {
        await axios.post('/tests', formDataToSend, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      }

      onSave();
    } catch (error) {
      console.error('Error saving test:', error);
      alert('حدث خطأ في حفظ الاختبار');
    } finally {
      setSubmitting(false);
    }
  };

  const addQuestion = () => {
    setFormData(prev => ({
      ...prev,
      questions: [...prev.questions, {
        id: Date.now(),
        text: '',
        type: 'MCQ',
        options: ['', '', '', ''],
        correct: ''
      }]
    }));
  };

  const updateQuestion = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      questions: prev.questions.map((q, i) => 
        i === index ? { ...q, [field]: value } : q
      )
    }));
  };

  const removeQuestion = (index) => {
    setFormData(prev => ({
      ...prev,
      questions: prev.questions.filter((_, i) => i !== index)
    }));
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content test-modal">
        <div className="modal-header">
          <h2>{test ? 'تعديل الاختبار' : 'إضافة اختبار جديد'}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="test-form">
          <div className="form-grid">
            <div className="form-group">
              <label>عنوان الاختبار</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                required
              />
            </div>

            <div className="form-group">
              <label>نوع الاختبار</label>
              <select
                value={formData.test_type}
                onChange={(e) => setFormData(prev => ({ ...prev, test_type: e.target.value }))}
              >
                <option value="MCQ">اختيار من متعدد</option>
                <option value="BUBBLE_SHEET">بابل الكتروني</option>
                <option value="PHYSICAL_SHEET">بابل حقيقي</option>
              </select>
            </div>

            <div className="form-group">
              <label>الصف</label>
              <select
                value={formData.grade}
                onChange={(e) => setFormData(prev => ({ ...prev, grade: e.target.value }))}
              >
                <option value="3MIDDLE">الثالث الإعدادي</option>
                <option value="1HIGH">الأول الثانوي</option>
                <option value="2HIGH">الثاني الثانوي</option>
                <option value="3HIGH">الثالث الثانوي</option>
              </select>
            </div>

            <div className="form-group">
              <label>المجموعة (اختياري)</label>
              <select
                value={formData.student_group}
                onChange={(e) => setFormData(prev => ({ ...prev, student_group: e.target.value }))}
                disabled={formData.grade === '3MIDDLE'}
              >
                <option value="">كل الطلاب</option>
                <option value="MINYAT-EL-NASR">منية النصر</option>
                <option value="RIYAD">الرياض</option>
                <option value="MEET-HADID">ميت حديد</option>
              </select>
            </div>

            <div className="form-group">
              <label>وقت البداية</label>
              <input
                type="datetime-local"
                value={formData.start_time}
                onChange={(e) => setFormData(prev => ({ ...prev, start_time: e.target.value }))}
                required
              />
            </div>

            <div className="form-group">
              <label>وقت النهاية</label>
              <input
                type="datetime-local"
                value={formData.end_time}
                onChange={(e) => setFormData(prev => ({ ...prev, end_time: e.target.value }))}
                required
              />
            </div>

            <div className="form-group">
              <label>المدة بالدقائق (اختياري)</label>
              <input
                type="number"
                value={formData.duration_minutes}
                onChange={(e) => setFormData(prev => ({ ...prev, duration_minutes: e.target.value }))}
                min="1"
              />
            </div>

            <div className="form-group">
              <label>نوع عرض النتائج</label>
              <select
                value={formData.view_type}
                onChange={(e) => setFormData(prev => ({ ...prev, view_type: e.target.value }))}
              >
                <option value="IMMEDIATE">فوري</option>
                <option value="TEACHER_CONTROLLED">يتحكم فيه المعلم</option>
              </select>
            </div>
          </div>

          {/* PDF Upload for Bubble Sheet and Physical Sheet */}
          {(formData.test_type === 'BUBBLE_SHEET' || formData.test_type === 'PHYSICAL_SHEET') && (
            <div className="form-group">
              <label>رفع ملف PDF للامتحان</label>
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setPdfFile(e.target.files[0])}
              />
            </div>
          )}

          {/* MCQ Questions */}
          {formData.test_type === 'MCQ' && (
            <div className="questions-section">
              <div className="section-header">
                <h3>الأسئلة</h3>
                <button type="button" onClick={addQuestion} className="btn-outline">
                  إضافة سؤال
                </button>
              </div>
              
              {formData.questions.map((question, index) => (
                <div key={question.id} className="question-form">
                  <div className="question-header">
                    <h4>السؤال {index + 1}</h4>
                    <button 
                      type="button" 
                      onClick={() => removeQuestion(index)}
                      className="btn-danger-small"
                    >
                      حذف
                    </button>
                  </div>
                  
                  <div className="form-group">
                    <label>نص السؤال</label>
                    <textarea
                      value={question.text}
                      onChange={(e) => updateQuestion(index, 'text', e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>نوع السؤال</label>
                    <select
                      value={question.type}
                      onChange={(e) => updateQuestion(index, 'type', e.target.value)}
                    >
                      <option value="MCQ">اختيار من متعدد</option>
                      <option value="OPEN">سؤال مفتوح</option>
                    </select>
                  </div>

                  {question.type === 'MCQ' && (
                    <>
                      <div className="options-grid">
                        {question.options.map((option, optIndex) => (
                          <div key={optIndex} className="form-group">
                            <label>الخيار {optIndex + 1}</label>
                            <input
                              type="text"
                              value={option}
                              onChange={(e) => {
                                const newOptions = [...question.options];
                                newOptions[optIndex] = e.target.value;
                                updateQuestion(index, 'options', newOptions);
                              }}
                              required
                            />
                          </div>
                        ))}
                      </div>
                      
                      <div className="form-group">
                        <label>الإجابة الصحيحة</label>
                        <select
                          value={question.correct}
                          onChange={(e) => updateQuestion(index, 'correct', e.target.value)}
                          required
                        >
                          <option value="">اختر الإجابة الصحيحة</option>
                          {question.options.map((option, optIndex) => (
                            <option key={optIndex} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Bubble Sheet Answers */}
          {(formData.test_type === 'BUBBLE_SHEET' || formData.test_type === 'PHYSICAL_SHEET') && (
            <div className="bubble-answers-section">
              <h3>الإجابات الصحيحة</h3>
              <div className="bubble-answers-grid">
                {Array.from({ length: 50 }, (_, i) => i + 1).map(questionNum => (
                  <div key={questionNum} className="bubble-answer-item">
                    <label>س{questionNum}</label>
                    <select
                      value={formData.bubbleAnswers[questionNum] || ''}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        bubbleAnswers: {
                          ...prev.bubbleAnswers,
                          [questionNum]: e.target.value
                        }
                      }))}
                    >
                      <option value="">-</option>
                      <option value="A">A</option>
                      <option value="B">B</option>
                      <option value="C">C</option>
                      <option value="D">D</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="form-actions">
            <button type="button" onClick={onClose} className="btn-secondary">
              إلغاء
            </button>
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? 'جاري الحفظ...' : (test ? 'تحديث' : 'إنشاء')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Submissions Modal Component
const SubmissionsModal = ({ test, submissions, onClose, onGradeUpdate }) => {
  const [gradingSubmission, setGradingSubmission] = useState(null);
  const [gradeData, setGradeData] = useState({ score: '', comment: '' });

  const handleGradeSubmission = async (submissionId) => {
    try {
      await axios.patch(`/submissions/${submissionId}/grade`, {
        score: parseFloat(gradeData.score),
        teacher_comment: gradeData.comment
      });
      
      setGradingSubmission(null);
      setGradeData({ score: '', comment: '' });
      onGradeUpdate();
    } catch (error) {
      console.error('Error grading submission:', error);
      alert('حدث خطأ في تقدير الدرجة');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content submissions-modal">
        <div className="modal-header">
          <h2>مشاركات الاختبار: {test.title}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="submissions-list">
          {submissions.length === 0 ? (
            <p>لا توجد مشاركات</p>
          ) : (
            submissions.map(submission => (
              <div key={submission.id} className="submission-item">
                <div className="student-info">
                  <h4>{submission.student_name}</h4>
                  <p>الصف: {submission.grade === '1HIGH' ? 'الأول الثانوي' : 
                           submission.grade === '2HIGH' ? 'الثاني الثانوي' : 
                           submission.grade === '3HIGH' ? 'الثالث الثانوي' : submission.grade}</p>
                  {submission.student_group && <p>المجموعة: {submission.student_group === 'A' ? 'أ' : 
                                                            submission.student_group === 'B' ? 'ب' : 
                                                            submission.student_group === 'C' ? 'ج' : 
                                                            submission.student_group === 'D' ? 'د' : submission.student_group}</p>}
                </div>
                
                <div className="submission-details">
                  <p>تاريخ التقديم: {new Date(submission.created_at).toLocaleDateString('ar-EG')}</p>
                  {submission.score !== null ? (
                    <p className="score">الدرجة: {submission.score}%</p>
                  ) : (
                    <p className="no-score">لم يتم التقدير</p>
                  )}
                </div>

                <div className="submission-actions">
                  {!submission.graded && (
                    <button 
                      className="btn-primary"
                      onClick={() => {
                        setGradingSubmission(submission.id);
                        setGradeData({ 
                          score: submission.score || '', 
                          comment: submission.teacher_comment || '' 
                        });
                      }}
                    >
                      تقدير الدرجة
                    </button>
                  )}
                </div>

                {gradingSubmission === submission.id && (
                  <div className="grading-form">
                    <div className="form-group">
                      <label>الدرجة (%)</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={gradeData.score}
                        onChange={(e) => setGradeData(prev => ({ ...prev, score: e.target.value }))}
                      />
                    </div>
                    <div className="form-group">
                      <label>تعليق (اختياري)</label>
                      <textarea
                        value={gradeData.comment}
                        onChange={(e) => setGradeData(prev => ({ ...prev, comment: e.target.value }))}
                      />
                    </div>
                    <div className="form-actions">
                      <button 
                        className="btn-secondary"
                        onClick={() => setGradingSubmission(null)}
                      >
                        إلغاء
                      </button>
                      <button 
                        className="btn-primary"
                        onClick={() => handleGradeSubmission(submission.id)}
                      >
                        حفظ الدرجة
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default TestManagement;
