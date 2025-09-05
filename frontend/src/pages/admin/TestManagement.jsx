import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import { Button } from 'react-bootstrap';
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
      const subs = response.data.submissions || [];
      // Sort by score descending; null/undefined last
      subs.sort((a, b) => {
        const sa = (a.score === null || a.score === undefined) ? -Infinity : Number(a.score);
        const sb = (b.score === null || b.score === undefined) ? -Infinity : Number(b.score);
        return sb - sa;
      });
      setSubmissions(subs);
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

  const formatDate = (iso) => {
    if (!iso) return '';
    // Accept both 'YYYY-MM-DDTHH:mm' and 'YYYY-MM-DD HH:mm' and optional seconds/timezone
    const s = String(iso);
    const mDate = s.match(/^(\d{4})[-](\d{2})[-](\d{2})[T ](\d{2}):(\d{2})/);
    if (!mDate) return iso;
    const [_, y, mo, d, h, mi] = mDate;
    return `${y}-${mo}-${d} ${h}:${mi}`;
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

// Drag and Drop Image Component
const DraggableImage = ({ image, index, onRemove, onDragStart, onDragOver, onDrop }) => (
  <div 
    draggable
    onDragStart={onDragStart}
    onDragOver={onDragOver}
    onDrop={onDrop}
    style={{
      padding: '10px',
      margin: '5px 0',
      border: '1px solid #ddd',
      borderRadius: '4px',
      display: 'flex',
      alignItems: 'center',
      cursor: 'move',
      backgroundColor: '#fff'
    }}
  >
    <div style={{ marginRight: '10px', fontWeight: 'bold' }}>{index + 1}.</div>
    <img 
      src={image.preview || image.url} 
      alt={`Question ${index + 1}`} 
      style={{ 
        maxWidth: '100px', 
        maxHeight: '100px',
        objectFit: 'contain',
        marginRight: '10px'
      }} 
    />
    <Button 
      variant="danger" 
      size="sm" 
      onClick={() => onRemove(index)}
      style={{ marginLeft: 'auto' }}
    >
      Remove
    </Button>
  </div>
);

// Test Creation/Edit Modal Component
const TestModal = ({ test, onClose, onSave }) => {
  // Display helper: extract YYYY-MM-DDTHH:mm as-is from ISO string (no timezone shift)
  const isoToDatetimeLocalPreserve = (iso) => {
    if (!iso) return '';
    const m = String(iso).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
    if (!m) return iso;
    const [_, y, mo, d, h, mi] = m;
    return `${y}-${mo}-${d}T${h}:${mi}`;
  };

  const [formData, setFormData] = useState({
    title: test?.title || '',
    grade: test?.grade || '3HIGH',
    student_group: test?.student_group || '',
    test_type: test?.test_type || 'MCQ',
    start_time: test?.start_time ? isoToDatetimeLocalPreserve(test.start_time) : '',
    end_time: test?.end_time ? isoToDatetimeLocalPreserve(test.end_time) : '',
    duration_minutes: test?.duration_minutes || '',
    view_type: test?.view_type || 'IMMEDIATE',
    questions: test?.correct_answers?.questions || [],
    bubbleAnswers: test?.correct_answers?.answers || {}
  });
  
  const [images, setImages] = useState(test?.images?.map(img => ({
    id: img.id || `img-${Date.now()}`,
    url: img.url,
    file: null
  })) || []);
  
  const [draggedItem, setDraggedItem] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  // Handle image upload
  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files);
    const newImages = files.map(file => ({
      id: `img-${Date.now()}-${file.name}`,
      file,
      preview: URL.createObjectURL(file)
    }));
    setImages([...images, ...newImages]);
    // Clear the input value so selecting the same files again will retrigger onChange
    if (e.target) {
      e.target.value = '';
    }
  };

  // Handle image removal
  const handleRemoveImage = (index) => {
    const newImages = [...images];
    newImages.splice(index, 1);
    setImages(newImages);
  };

  // Drag and drop handlers
  const handleDragStart = (e, index) => {
    setDraggedItem(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.currentTarget);
  };

  const handleDragOver = (index) => {
    if (draggedItem === null || draggedItem === index) return;
    
    const newImages = [...images];
    const draggedImage = newImages[draggedItem];
    newImages.splice(draggedItem, 1);
    newImages.splice(index, 0, draggedImage);
    
    setDraggedItem(index);
    setImages(newImages);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      console.log('Submitting form with student_group:', formData.student_group);
      const formDataToSend = new FormData();
      
      // Helper: preserve local wall time by sending a naive datetime string (no timezone/Z)
      // 'YYYY-MM-DDTHH:mm' -> 'YYYY-MM-DDTHH:mm:00'
      const toUtcIso = (val) => {
        if (!val) return val;
        // Ensure we only have YYYY-MM-DDTHH:mm
        const base = String(val).slice(0, 16);
        // Return without timezone designator so DB stores the wall time as-is
        return `${base}:00`;
      };

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
          if (key === 'start_time' || key === 'end_time') {
            formDataToSend.append(key, toUtcIso(value));
          } else {
            formDataToSend.append(key, value);
          }
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

      // Always send an explicit empty pdf field
      formDataToSend.append('pdf', '');

      // Add images
      images.forEach((image, index) => {
        if (image.file) {
          formDataToSend.append(`images[${index}]`, image.file);
        } else if (image.url) {
          // If it's an existing image (has URL but no file), send the URL
          formDataToSend.append(`existing_images[${index}]`, image.url);
        }
      });

      // Do not send image_order here. Image ordering is managed server-side by display_order.

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

          {/* Image Upload Section */}
          <div className="section-header">
            <h3>صور الاختبار</h3>
          </div>
          
          {/* Hide image upload for MCQ tests (first option). When visible, make the dropzone more distinguished */}
          {formData.test_type !== 'MCQ' && (
            <div className="mb-4">
              <label
                htmlFor="image-upload"
                className="dropzone p-4 rounded-lg text-center cursor-pointer mb-4"
                style={{ border: '3px dashed #1e90ff', backgroundColor: '#f0f8ff' }}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleImageUpload({ target: { files: e.dataTransfer.files } });
                }}
                onClick={(e) => {
                  if (submitting) { e.preventDefault(); e.stopPropagation(); }
                }}
              >
                <input
                  id="image-upload"
                  type="file"
                  style={{ display: 'none' }}
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  ref={fileInputRef}
                />
                <p className="text-gray-600">اسحب الصور هنا أو انقر للرفع</p>
                <p className="text-sm text-gray-500">يمكنك رفع عدة صور في المرة الواحدة</p>
              </label>

              {/* Image Preview and Reordering */}
              <div className="space-y-2">
                {images.map((image, index) => (
                  <DraggableImage
                    key={image.id}
                    image={image}
                    index={index}
                    onRemove={handleRemoveImage}
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      handleDragOver(index);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleDragEnd();
                    }}
                  />
                ))}
              </div>
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
  const [manualDetail, setManualDetail] = useState(null); // { test, submission, correct_answers }
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [gradeData, setGradeData] = useState({ comment: '', gradesPct: {} }); // gradesPct keyed by question id (0..100)
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showIncludeModal, setShowIncludeModal] = useState(false);
  const [localSubs, setLocalSubs] = useState(submissions || []);
  const [editingAnswersId, setEditingAnswersId] = useState(null);
  const [answersDetail, setAnswersDetail] = useState(null); // { test, submission, correct_answers }
  const [answersMap, setAnswersMap] = useState({});
  const [answersCount, setAnswersCount] = useState(50);

  useEffect(() => {
    setLocalSubs(submissions || []);
  }, [submissions]);

  const refreshSubmissions = async () => {
    try {
      const res = await axios.get(`/tests/${test.id}/submissions`);
      const subs = res.data.submissions || [];
      subs.sort((a, b) => {
        const sa = (a.score === null || a.score === undefined) ? -Infinity : Number(a.score);
        const sb = (b.score === null || b.score === undefined) ? -Infinity : Number(b.score);
        return sb - sa;
      });
      setLocalSubs(subs);
    } catch (e) {
      // ignore
    }
  };

  // Open detailed grading view: fetch submission with test and correct answers
  const openManualGrading = async (submission) => {
    setGradingSubmission(submission.id);
    setLoadingDetail(true);
    setManualDetail(null);
    setGradeData({ comment: submission.teacher_comment || '', gradesPct: {} });
    try {
      const res = await axios.get(`/tests/${test.id}/submissions/${submission.id}`);
      const detail = res.data || {};

      // Extract existing manual grades if present
      let existingGrades = {};
      try {
        const mg = detail?.submission?.manual_grades;
        if (mg) {
          const obj = typeof mg === 'string' ? JSON.parse(mg) : mg;
          if (obj && obj.grades) existingGrades = obj.grades;
        }
      } catch (e) {
        existingGrades = {};
      }

      // Convert 0..1 to 0..100 for UI
      const gradesPct = Object.fromEntries(
        Object.entries(existingGrades).map(([k, v]) => [k, Math.round(Number(v) * 10000) / 100])
      );

      setManualDetail(detail);
      setGradeData(prev => ({ ...prev, gradesPct }));
    } catch (error) {
      console.error('Error fetching submission for grading:', error);
      alert('تعذر تحميل بيانات المشاركة للتصحيح اليدوي');
      setGradingSubmission(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleManualGradeChange = (qid, value) => {
    // clamp 0..100
    let v = Number(value);
    if (isNaN(v)) v = 0;
    v = Math.max(0, Math.min(100, v));
    setGradeData(prev => ({
      ...prev,
      gradesPct: { ...prev.gradesPct, [qid]: v }
    }));
  };

  const handleSaveManualGrades = async () => {
    if (!gradingSubmission) return;
    try {
      // Convert 0..100 to 0..1
      const grades = Object.fromEntries(
        Object.entries(gradeData.gradesPct).map(([k, v]) => [k, Math.max(0, Math.min(1, Number(v) / 100))])
      );

      await axios.patch(`/submissions/${gradingSubmission}/manual-grades`, {
        grades,
        teacher_comment: manualDetail?.test?.test_type === 'PHYSICAL_SHEET' ? null : (gradeData.comment || null)
      });

      // Reset and notify
      setGradingSubmission(null);
      setManualDetail(null);
      setGradeData({ comment: '', gradesPct: {} });
      onGradeUpdate();
    } catch (error) {
      console.error('Error saving manual grades:', error);
      alert('حدث خطأ في حفظ الدرجات اليدوية');
    }
  };

  const handleCancelGrading = () => {
    setGradingSubmission(null);
    setManualDetail(null);
    setGradeData({ comment: '', gradesPct: {} });
  };

  // Render helper: MCQ questions list with OPEN grading inputs
  const renderManualGradingForm = (detail) => {
    if (!detail) return null;
    const qData = detail.correct_answers && detail.correct_answers.questions ? detail.correct_answers.questions : [];
    const studentAnswers = (detail.submission?.answers && detail.submission.answers.answers) ? detail.submission.answers.answers : [];

    return (
      <div className="grading-form">
        <div className="questions-list">
          {qData.length === 0 ? (
            <p>لا توجد أسئلة متاحة للتصحيح.</p>
          ) : (
            qData.map((q, idx) => {
              const stAns = studentAnswers.find(a => a.id === q.id);
              const isOpen = q.type === 'OPEN';
              const currentPct = gradeData.gradesPct[q.id] ?? '';
              return (
                <div key={q.id} className="question-item" style={{ border: '1px solid #eee', borderRadius: 6, padding: 12, marginBottom: 10 }}>
                  <div className="question-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ margin: 0 }}>س{idx + 1}</h4>
                    <span className="badge" style={{ background: '#f5f5f5', padding: '2px 8px', borderRadius: 4 }}>{isOpen ? 'سؤال مفتوح' : 'اختيار من متعدد'}</span>
                  </div>
                  <div className="question-body" style={{ marginTop: 8 }}>
                    {q.text && <p style={{ whiteSpace: 'pre-wrap' }}>{q.text}</p>}
                    {!isOpen && (
                      <div className="mcq-block" style={{ fontSize: 14, color: '#444' }}>
                        <div>إجابة الطالب: <strong>{stAns ? stAns.answer : '-'}</strong></div>
                        <div>الإجابة الصحيحة: <strong>{q.correct ?? '-'}</strong></div>
                      </div>
                    )}
                    {isOpen && (
                      <div className="open-block" style={{ marginTop: 8 }}>
                        <div className="student-answer" style={{ marginBottom: 8 }}>
                          <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 4 }}>إجابة الطالب</label>
                          <div style={{ background: '#fafafa', padding: 8, borderRadius: 4, minHeight: 40 }}>
                            {stAns && stAns.answer ? (
                              <span style={{ whiteSpace: 'pre-wrap' }}>{stAns.answer}</span>
                            ) : (
                              <em>لا توجد إجابة</em>
                            )}
                          </div>
                        </div>
                        <div className="grade-input">
                          <label>درجة السؤال (%)</label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={currentPct}
                            onChange={(e) => handleManualGradeChange(q.id, e.target.value)}
                            placeholder="0 - 100"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Hide comment for physical bubble tests */}
        {detail?.test?.test_type !== 'PHYSICAL_SHEET' && (
          <div className="form-group" style={{ marginTop: 12 }}>
            <label>تعليق المعلم (اختياري)</label>
            <textarea
              value={gradeData.comment}
              onChange={(e) => setGradeData(prev => ({ ...prev, comment: e.target.value }))}
            />
          </div>
        )}

        <div className="form-actions" style={{ marginTop: 12 }}>
          <button className="btn-secondary" onClick={handleCancelGrading}>إلغاء</button>
          <button className="btn-primary" onClick={handleSaveManualGrades}>حفظ الدرجات</button>
        </div>
      </div>
    );
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content submissions-modal">
        <div className="modal-header">
          <h2>مشاركات الاختبار: {test.title}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        {test.test_type === 'PHYSICAL_SHEET' && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-primary" onClick={() => setShowBatchModal(true)}>
                تصحيح جماعي للبابل
              </button>
              <button className="btn-outline" onClick={() => setShowIncludeModal(true)}>
                إضافة طلاب للاختبار
              </button>
            </div>
          </div>
        )}

        <div className="submissions-list">
          {localSubs.length === 0 ? (
            <p>لا توجد مشاركات</p>
          ) : (
            localSubs.map(submission => (
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
                  <button 
                    className="btn-primary"
                    onClick={() => openManualGrading(submission)}
                  >
                    عرض/تصحيح يدوي
                  </button>
                  {test.test_type === 'PHYSICAL_SHEET' && (
                    <button
                      className="btn-outline"
                      style={{ marginInlineStart: 8 }}
                      onClick={async () => {
                        setEditingAnswersId(submission.id);
                        try {
                          const res = await axios.get(`/tests/${test.id}/submissions/${submission.id}`);
                          const detail = res.data || {};
                          setAnswersDetail(detail);
                          const detected = (detail?.submission?.answers && detail.submission.answers.answers) ? detail.submission.answers.answers : {};
                          setAnswersMap(detected || {});
                          const count = detail?.correct_answers?.answers ? Object.keys(detail.correct_answers.answers).length : 50;
                          setAnswersCount(count || 50);
                        } catch (e) {
                          alert('تعذر تحميل الإجابات الحالية');
                          setEditingAnswersId(null);
                        }
                      }}
                    >
                      تعديل الإجابات
                    </button>
                  )}
                </div>

                {gradingSubmission === submission.id && (
                  <div className="grading-form">
                    {loadingDetail && <p>جاري تحميل بيانات التصحيح...</p>}
                    {!loadingDetail && manualDetail && renderManualGradingForm(manualDetail)}
                  </div>
                )}

                {editingAnswersId === submission.id && (
                  <div className="grading-form" style={{ marginTop: 10 }}>
                    <h4>تعديل إجابات البابل</h4>
                    <div className="bubble-answers-grid">
                      {Array.from({ length: answersCount }, (_, i) => i + 1).map((qnum) => (
                        <div key={qnum} className="bubble-answer-item">
                          <label>س{qnum}</label>
                          <select
                            value={answersMap[qnum] || ''}
                            onChange={(e) => setAnswersMap(prev => ({ ...prev, [qnum]: e.target.value }))}
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
                    <div className="form-actions" style={{ marginTop: 8 }}>
                      <button className="btn-secondary" onClick={() => setEditingAnswersId(null)}>إلغاء</button>
                      <button
                        className="btn-primary"
                        onClick={async () => {
                          try {
                            await axios.patch(`/submissions/${submission.id}/answers`, {
                              answers: answersMap
                            });
                            setEditingAnswersId(null);
                            await refreshSubmissions();
                            onGradeUpdate && onGradeUpdate();
                          } catch (e) {
                            alert('فشل حفظ الإجابات');
                          }
                        }}
                      >
                        حفظ الإجابات
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {showBatchModal && (
          <BatchGradeModal
            test={test}
            submissions={localSubs}
            onClose={() => setShowBatchModal(false)}
            onDone={async () => { setShowBatchModal(false); await refreshSubmissions(); onGradeUpdate && onGradeUpdate(); }}
          />
        )}
        {showIncludeModal && (
          <IncludeStudentsModal
            test={test}
            onClose={() => setShowIncludeModal(false)}
            onDone={async () => { setShowIncludeModal(false); await refreshSubmissions(); onGradeUpdate && onGradeUpdate(); }}
          />
        )}
      </div>
    </div>
  );
};

// Batch grading modal for physical bubble tests
const BatchGradeModal = ({ test, submissions, onClose, onDone }) => {
  const [ordered, setOrdered] = useState(() => (submissions || []).map(s => ({ id: s.student_id, name: s.student_name })));
  const [files, setFiles] = useState([]);
  const [nQuestions, setNQuestions] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const namesAsIds = true; // Always use filenames as student IDs
  const [selectedSet, setSelectedSet] = useState(() => new Set((submissions || []).map(s => s.student_id)));

  const toggleSelect = (id) => {
    setSelectedSet(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  const selectAll = (on) => {
    if (on) {
      setSelectedSet(new Set((ordered || []).map(o => o.id)));
    } else {
      setSelectedSet(new Set());
    }
  };

  const move = (index, dir) => {
    const ni = index + dir;
    if (ni < 0 || ni >= ordered.length) return;
    const arr = [...ordered];
    const tmp = arr[index];
    arr[index] = arr[ni];
    arr[ni] = tmp;
    setOrdered(arr);
  };

  const onFileChange = (e) => {
    setFiles(Array.from(e.target.files || []));
  };

  const handleSubmit = async () => {
    try {
      if (files.length === 0) {
        alert('يرجى رفع صور الإجابات أولاً');
        return;
      }
      if (!nQuestions || nQuestions < 1 || nQuestions > 55) {
        alert('عدد الأسئلة يجب أن يكون بين 1 و 55');
        return;
      }
      // Ensure at least one student is selected to include
      const selectedArr = ordered.filter(o => selectedSet.has(o.id));
      if (!selectedArr.length) {
        alert('يرجى اختيار طالب واحد على الأقل للتحميل');
        return;
      }

      // Quick client-side check: warn if any filename lacks a numeric ID (server will validate further)
      const bad = files.filter(f => !(/(\d+)/).test(f.name || ''));
      if (bad.length > 0) {
        const list = bad.map(b => b.name).join(', ');
        if (!window.confirm(`بعض الملفات لا تحتوي على أرقام في أسمائها:
${list}
هل تريد المتابعة؟ سيتم التحقق بدقة في السيرفر.`)) return;
      }
      setSubmitting(true);
      const form = new FormData();
      form.append('n_questions', String(nQuestions));
      // Only send selected students in the order the admin arranged them
      form.append('students', JSON.stringify(selectedArr.map(o => o.id)));
      form.append('names_as_ids', 'true');
      files.forEach(f => form.append('files', f));
      await axios.post(`/tests/${test.id}/grade-physical-batch`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      alert('تم إنهاء التصحيح الجماعي');
      await onDone();
    } catch (e) {
      console.error(e);
      alert('فشل التصحيح الجماعي');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>تصحيح جماعي للبابل - {test.title}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <div className="form-grid">
          <div className="form-group">
            <label>عدد الأسئلة</label>
            <input type="number" min="1" max="55" value={nQuestions} onChange={(e) => setNQuestions(parseInt(e.target.value || '0', 10) || 0)} />
          </div>
          <div className="form-group">
            <label>رفع الصور (يجب تسمية كل صورة برقم الطالب)</label>
            <input type="file" accept="image/*" multiple onChange={onFileChange} />
            <small>سيتم مطابقة كل صورة تلقائياً بالطالب الذي يطابق رقم اسم الملف</small>
            {files.length > 0 && (
              <div style={{ marginTop: 6 }}>
                تم اختيار {files.length} صورة
              </div>
            )}
          </div>
        </div>
        <div className="section-header">
          <h3>ترتيب الطلاب</h3>
        </div>
        <div>
            <div style={{ display: 'flex', alignItems: 'center', padding: '6px 6px', borderBottom: '1px solid #eee' }}>
              <div style={{ width: 32 }}><input type="checkbox" checked={selectedSet.size === ordered.length && ordered.length > 0} onChange={(e) => selectAll(e.target.checked)} /></div>
              <div style={{ flex: 1, fontWeight: 600 }}>الطلاب (اسحب لترتيب)</div>
              <div style={{ width: 200, textAlign: 'right' }}>أزِر الحركة</div>
            </div>
            {ordered.map((o, idx) => (
              <div key={o.id} style={{ display: 'flex', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #eee' }}>
                <div style={{ width: 32, textAlign: 'center' }}>
                  <input type="checkbox" checked={selectedSet.has(o.id)} onChange={() => toggleSelect(o.id)} />
                </div>
                <div style={{ width: 32, textAlign: 'center' }}>{idx + 1}</div>
                <div style={{ flex: 1 }}>{o.name} (ID: {o.id})</div>
                <div>
                  <button className="btn-outline" onClick={() => move(idx, -1)} disabled={idx === 0}>أعلى</button>
                  <button className="btn-outline" onClick={() => move(idx, 1)} disabled={idx === ordered.length - 1} style={{ marginInlineStart: 6 }}>أسفل</button>
                </div>
              </div>
            ))}
        </div>
        <div className="form-actions" style={{ marginTop: 10 }}>
          <button className="btn-secondary" onClick={onClose}>إلغاء</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={submitting}>{submitting ? 'جارٍ التصحيح...' : 'بدء التصحيح'}</button>
        </div>
      </div>
    </div>
  );
};

// Include Students Modal: fetch eligible students and POST selected IDs to backend
const IncludeStudentsModal = ({ test, onClose, onDone }) => {
  const [students, setStudents] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchEligible = async () => {
      try {
        setLoading(true);
        const res = await axios.get(`/tests/${test.id}/eligible-students`);
        setStudents(res.data.students || []);
      } catch (e) {
        console.error('Failed to load eligible students', e);
        alert('تعذر تحميل قائمة الطلاب المؤهلين');
      } finally {
        setLoading(false);
      }
    };
    fetchEligible();
  }, [test.id]);

  // Local translations (avoid referencing outer-scope helpers)
  const translateGrade = (grade) => {
    switch (grade) {
      case '3MIDDLE': return 'الثالث الإعدادي';
      case '1HIGH': return 'الأول الثانوي';
      case '2HIGH': return 'الثاني الثانوي';
      case '3HIGH': return 'الثالث الثانوي';
      default: return grade;
    }
  };

  const translateGroup = (group) => {
    switch (group) {
      case 'MINYAT-EL-NASR': return 'منية النصر';
      case 'RIYAD': return 'الرياض';
      case 'MEET-HADID': return 'ميت حديد';
      default: return group;
    }
  };

  const toggle = (id) => {
    setSelected(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  const handleInclude = async () => {
    if (selected.size === 0) {
      alert('يرجى اختيار طلاب للإضافة');
      return;
    }
    try {
      setSubmitting(true);
      const body = { student_ids: Array.from(selected) };
      const res = await axios.post(`/tests/${test.id}/include-students`, body);
      const created = res.data.created || [];
      const skipped = res.data.skipped || [];
      alert(`تم إضافة ${created.length} طلاب، تم تخطي ${skipped.length} (لأن لديهم بالفعل مشاركات)`);
      onDone && onDone();
    } catch (e) {
      console.error('Failed to include students', e);
      alert('فشل إضافة الطلاب');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>إضافة طلاب للاختبار: {test.title}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <div style={{ padding: 12 }}>
          {loading ? <p>جاري التحميل...</p> : (
            students.length === 0 ? <p>لا يوجد طلاب مؤهلين لهذا الاختبار</p> : (
              <div style={{ maxHeight: '50vh', overflow: 'auto' }}>
                {students.map(s => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', padding: 8, borderBottom: '1px solid #eee' }}>
                    <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                    <div style={{ marginInlineStart: 8, flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{s.name}</div>
                      <div style={{ fontSize: 12, color: '#666' }}>ID: {s.id} — {s.phone_number}</div>
                    </div>
                    <div style={{ minWidth: 120, textAlign: 'right' }}>{translateGrade(s.grade)}{s.student_group ? ` — ${translateGroup(s.student_group)}` : ''}</div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
        <div className="form-actions" style={{ padding: 12 }}>
          <button className="btn-secondary" onClick={onClose}>إلغاء</button>
          <button className="btn-primary" onClick={handleInclude} disabled={submitting || loading}>{submitting ? 'جارٍ الإضافة...' : 'إضافة الطلاب'}</button>
        </div>
      </div>
    </div>
  );
};

export default TestManagement;
