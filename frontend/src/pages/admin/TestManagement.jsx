import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import { Button, Modal } from 'react-bootstrap';
import { FaEye, FaTimes, FaChevronLeft, FaChevronRight, FaTrash, FaEdit, FaImage, FaRedo, FaSearch, FaUserPlus, FaFileExport, FaPercent } from 'react-icons/fa';
import './TestManagement.css';

// Countdown Timer Component for admin test cards
const CountdownTimer = ({ startTimeMs, endTimeMs }) => {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!startTimeMs || !endTimeMs) return null;

  const hasStarted = now >= startTimeMs;
  const hasEnded = now >= endTimeMs;

  // Determine status and target
  let status, targetMs, label;
  if (hasEnded) {
    status = 'ended';
    label = 'انتهى';
  } else if (hasStarted) {
    status = 'active';
    targetMs = endTimeMs;
    label = 'ينتهي خلال';
  } else {
    status = 'upcoming';
    targetMs = startTimeMs;
    label = 'يبدأ خلال';
  }

  if (status === 'ended') {
    return <div className="test-countdown ended">🔴 {label}</div>;
  }

  const diffMs = targetMs - now;
  const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n) => String(n).padStart(2, '0');

  return (
    <div className={`test-countdown ${status}`}>
      <span className="countdown-label">{status === 'active' ? '🟢' : '🟡'} {label}:</span>
      <span className="countdown-values">
        {days > 0 && <span className="countdown-unit">{days}<small>ي</small></span>}
        <span className="countdown-unit">{pad(hours)}<small>س</small></span>
        <span className="countdown-unit">{pad(minutes)}<small>د</small></span>
        <span className="countdown-unit">{pad(seconds)}<small>ث</small></span>
      </span>
    </div>
  );
};

const TestManagement = () => {
  const { user } = useAuth();
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTest, setEditingTest] = useState(null);
  const [selectedTest, setSelectedTest] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [currentTest, setCurrentTest] = useState(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

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

  const deleteImage = async (imageId) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه الصورة؟')) return;
    
    try {
      await axios.delete(`/tests/images/${imageId}`);
      // Refresh tests to update the UI
      fetchTests();
    } catch (error) {
      console.error('Error deleting image:', error);
      alert('حدث خطأ في حذف الصورة');
    }
  };

  const openImageModal = (test) => {
    setCurrentTest(test);
    setCurrentImageIndex(0);
    setShowImageModal(true);
  };

  const handleNextImage = () => {
    setCurrentImageIndex(prev => 
      prev < currentTest.images.length - 1 ? prev + 1 : 0
    );
  };

  const handlePrevImage = () => {
    setCurrentImageIndex(prev => 
      prev > 0 ? prev - 1 : currentTest.images.length - 1
    );
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

  const toggleShowGradeOutside = async (testId, currentValue) => {
    try {
      await axios.patch(`/tests/${testId}/show-grade-outside`, {
        show_grade_outside: !currentValue
      });
      fetchTests();
    } catch (error) {
      console.error('Error updating show grade outside:', error);
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
        <button
          className="btn-outline"
          onClick={() => setShowExportModal(true)}
          style={{ marginInlineStart: 8 }}
        >
          تصدير الترتيب
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
                {test.average_score !== null && test.average_score !== undefined && Number(test.submission_count) > 0 && (
                  <p className="average-score">
                    <strong>📊 المتوسط:</strong> {Math.floor(Number(test.average_score))}%
                    {test.correct_answers?.answers && (
                      <span className="average-correct">
                        {' '}({Math.floor((Number(test.average_score) / 100) * Object.keys(test.correct_answers.answers).length)}/{Object.keys(test.correct_answers.answers).length})
                      </span>
                    )}
                  </p>
                )}
              </div>

              {/* Countdown Timer */}
              <CountdownTimer 
                startTimeMs={test.start_time_ms} 
                endTimeMs={test.end_time_ms} 
              />

              <div className="test-stats">
                <div className="stat">
                  <span className="stat-number">{test.submission_count || 0}</span>
                  <span className="stat-label">مشارك</span>
                </div>
                <div className="stat">
                  <span className="stat-number">{test.graded_count || 0}</span>
                  <span className="stat-label">مُصحح</span>
                </div>
                {test.images && test.images.length > 0 && (
                  <div className="stat">
                    <button 
                      className="btn btn-sm btn-outline-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        openImageModal(test);
                      }}
                      title="عرض الأسئلة"
                    >
                      <FaEye className="me-1" />
                      {test.images.length} {test.images.length === 1 ? 'صورة' : 'صور'}
                    </button>
                  </div>
                )}
              </div>

              <div className="test-controls">
                <div className="toggle-group">
                  <div className="toggle-item">
                    <label>
                      <input
                        type="checkbox"
                        className="toggle-switch"
                        checked={test.view_permission}
                        onChange={() => toggleViewPermission(test.id, test.view_permission)}
                      />
                      <span className="toggle-label">عرض النتائج</span>
                    </label>
                  </div>
                  {test.view_type === 'TEACHER_CONTROLLED' && (
                    <div className="toggle-item">
                      <label>
                        <input
                          type="checkbox"
                          className="toggle-switch"
                          checked={test.show_grade_outside}
                          onChange={() => toggleShowGradeOutside(test.id, test.show_grade_outside)}
                        />
                        <span className="toggle-label">عرض الدرجة</span>
                      </label>
                    </div>
                  )}
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

      {/* Export Modal - rendered at top-level where showExportModal state is defined */}
      {showExportModal && (
        <ExportModal
          tests={tests}
          onClose={() => setShowExportModal(false)}
        />
      )}

      {/* Image Viewer Modal */}
      {currentTest && (
        <Modal 
          show={showImageModal} 
          onHide={() => setShowImageModal(false)}
          size="lg"
          centered
          className="image-viewer-modal"
        >
          <Modal.Header closeButton>
            <Modal.Title>{currentTest.title} - معاينة الأسئلة</Modal.Title>
          </Modal.Header>
          <Modal.Body className="text-center">
            <div className="image-viewer-container">
              <button 
                className="nav-arrow left-arrow" 
                onClick={handlePrevImage}
                disabled={currentTest.images.length <= 1}
              >
                <FaChevronLeft size={24} />
              </button>
              
              <div className="image-container">
                {currentTest.images.length > 0 ? (
                  <>
                    <img 
                      src={`${window.location.origin}/${currentTest.images[currentImageIndex].image_path}`} 
                      alt={`صفحة ${currentImageIndex + 1}`} 
                      className="img-fluid"
                    />
                    <div className="image-counter">
                      {currentImageIndex + 1} / {currentTest.images.length}
                    </div>
                  </>
                ) : (
                  <div className="no-images">لا توجد صور متاحة</div>
                )}
              </div>
              
              <button 
                className="nav-arrow right-arrow" 
                onClick={handleNextImage}
                disabled={currentTest.images.length <= 1}
              >
                <FaChevronRight size={24} />
              </button>
            </div>
          </Modal.Body>
          <Modal.Footer>
            <div className="d-flex justify-content-between w-100">
              <div>
                {currentTest.images.length > 0 && (
                  <button 
                    className="btn btn-danger"
                    onClick={() => {
                      deleteImage(currentTest.images[currentImageIndex].id);
                      setShowImageModal(false);
                    }}
                  >
                    <FaTimes className="me-1" /> حذف الصورة الحالية
                  </button>
                )}
              </div>
              <button 
                className="btn btn-secondary" 
                onClick={() => setShowImageModal(false)}
              >
                إغلاق
              </button>
            </div>
          </Modal.Footer>
        </Modal>
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

const TestModal = ({ test, onClose, onSave }) => {
  // Display helper: convert ISO or database datetime string to datetime-local input format (YYYY-MM-DDTHH:MM)
  const isoToDatetimeLocalPreserve = (dateTimeStr) => {
    if (!dateTimeStr) return '';
    
    // Handle both ISO format (2025-09-20T12:00:00.000Z) and database format (2025-09-20 12:00:00)
    const date = new Date(dateTimeStr);
    
    // Check if date is valid
    if (isNaN(date.getTime())) return '';
    
    // Format as YYYY-MM-DDTHH:MM
    const pad = (num) => String(num).padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    
    return `${year}-${month}-${day}T${hours}:${minutes}`;
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
    show_grade_outside: test?.show_grade_outside || false,
    test_group: test?.test_group !== null && test?.test_group !== undefined ? String(test.test_group) : '',
    questions: test?.correct_answers?.questions || [],
    bubbleAnswers: test?.correct_answers?.answers || {},
    images: test?.images || [],
    imageFiles: []
  });
  
  // Load existing images when test is loaded
  useEffect(() => {
    if (test?.images?.length > 0) {
      setFormData(prev => ({
        ...prev,
        images: [...test.images].sort((a, b) => a.display_order - b.display_order)
      }));
    }
  }, [test?.id]);
  
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const formDataToSend = new FormData();
      const mediaFiles = [];

      const questionsForPayload = formData.questions.map(q => {
        const newQ = {...q};
        if (newQ.mediaFile) {
          newQ.media_index = mediaFiles.length;
          mediaFiles.push(newQ.mediaFile);
        }
        delete newQ.media;
        delete newQ.mediaFile;
        return newQ;
      });

      const testData = {
        ...formData,
        duration_minutes: formData.duration_minutes || 0,
        questions: undefined,
        correct_answers: {
          questions: formData.test_type === 'MCQ' ? questionsForPayload : [],
          answers: (formData.test_type === 'BUBBLE_SHEET' || formData.test_type === 'PHYSICAL_SHEET') 
            ? formData.bubbleAnswers 
            : undefined
        },
        // Don't include images in the JSON, they'll be sent as multipart form data
        images: undefined,
        imageFiles: undefined
      };
      
      // Only include test_group if it has a value
      if (testData.test_group === '') {
        delete testData.test_group;
      }
      delete testData.bubbleAnswers;

      // Add test data as JSON
      formDataToSend.append('testData', JSON.stringify(testData));

      // Add question media files
      mediaFiles.forEach((file) => {
        formDataToSend.append('media', file);
      });

      // Add test images
      if (formData.imageFiles && formData.imageFiles.length > 0) {
        formData.imageFiles.forEach((file, index) => {
          formDataToSend.append('images', file);
        });
      }

      if (test) {
        await axios.put(`/tests/${test.id}`, formDataToSend, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        await axios.post('/tests', formDataToSend, {
          headers: { 'Content-Type': 'multipart/form-data' },
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

        {/* Removed show_grade_outside radio buttons - now controlled by toggle on test card */}

        <div className="form-group">
          <label>مجموعة الاختبار (للترتيب الموحد)</label>
          <input
            type="number"
            value={formData.test_group}
            onChange={(e) => setFormData(prev => ({ ...prev, test_group: e.target.value }))}
            placeholder="مثلاً: 1 أو 2"
          />
        </div>
          </div>

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
                      <div className="form-group">
                        <label>صورة السؤال (اختياري)</label>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files && e.target.files[0];
                            if (!file) {
                                updateQuestion(index, 'media', null);
                                updateQuestion(index, 'mediaFile', null);
                                return;
                            };
                            const objectUrl = URL.createObjectURL(file);
                            updateQuestion(index, 'media', objectUrl);
                            updateQuestion(index, 'mediaFile', file);
                          }}
                        />
                        {question.media && (
                          <div className="question-media" style={{ marginTop: 8 }}>
                            <img src={question.media} alt="معاينة" style={{ maxWidth: '200px', borderRadius: 6 }} />
                          </div>
                        )}
                      </div>
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

          {/* Image Upload for Bubble Sheet Tests */}
          {(formData.test_type === 'BUBBLE_SHEET' || formData.test_type === 'PHYSICAL_SHEET') && (
            <div className="form-group">
              <label>رفع صور الاختبار (اختياري)</label>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length > 0) {
                    setFormData(prev => ({
                      ...prev,
                      imageFiles: [...(prev.imageFiles || []), ...files],
                      // For preview
                      images: [
                        ...(prev.images || []),
                        ...files.map((file, index) => ({
                          id: `new-${Date.now()}-${index}`,
                          image_path: URL.createObjectURL(file),
                          display_order: (prev.images?.length || 0) + index
                        }))
                      ]
                    }));
                  }
                }}
              />
              
              {/* Display uploaded images with reordering and delete */}
              <div className="image-preview-container" style={{ marginTop: '10px' }}>
                {formData.images?.map((img, index) => (
                  <div key={img.id || index} className="image-preview-item" style={{ 
                    position: 'relative',
                    display: 'inline-block',
                    margin: '5px',
                    border: '1px solid #ddd',
                    padding: '5px',
                    borderRadius: '4px'
                  }}>
                    <img 
                      src={img.image_path.startsWith('blob:') ? img.image_path : 
                        `${process.env.REACT_APP_API_URL || ''}${img.image_path}`} 
                      alt={`صفحة ${index + 1}`} 
                      style={{ 
                        width: '100px', 
                        height: '140px', 
                        objectFit: 'contain' 
                      }} 
                    />
                    <div style={{ 
                      position: 'absolute', 
                      top: '5px', 
                      right: '5px', 
                      background: 'rgba(0,0,0,0.5)', 
                      color: 'white',
                      borderRadius: '50%',
                      width: '20px',
                      height: '20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                    onClick={() => {
                      // Remove the image from both preview and files
                      const newImages = [...formData.images];
                      newImages.splice(index, 1);
                      
                      setFormData(prev => ({
                        ...prev,
                        images: newImages,
                        // If it's a new file (not yet saved), remove from imageFiles
                        imageFiles: prev.imageFiles.filter((_, i) => i !== (index - (prev.images.length - newImages.length)))
                      }));
                    }}
                    >
                      ×
                    </div>
                    <div style={{ 
                      position: 'absolute', 
                      bottom: '5px', 
                      left: '5px', 
                      background: 'rgba(0,0,0,0.7)', 
                      color: 'white',
                      padding: '2px 6px',
                      borderRadius: '3px',
                      fontSize: '12px'
                    }}>
                      صفحة {index + 1}
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Hidden inputs for image reordering */}
              {formData.images?.map((img, index) => (
                <input 
                  key={`order-${img.id || index}`}
                  type="hidden"
                  name={`images[${index}]`}
                  value={img.id}
                />
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
  const [testDetail, setTestDetail] = useState(null);
  const [localSubs, setLocalSubs] = useState(submissions || []);
  const [editingAnswersId, setEditingAnswersId] = useState(null);
  const [answersDetail, setAnswersDetail] = useState(null); // { test, submission, correct_answers }
  const [answersMap, setAnswersMap] = useState({});
  const [answersCount, setAnswersCount] = useState(50);
  const [showImageModal, setShowImageModal] = useState(false);
  const [imageUrl, setImageUrl] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showGradeOverrideModal, setShowGradeOverrideModal] = useState(false);
  const [gradeOverrideSubmission, setGradeOverrideSubmission] = useState(null);

  const handleRegradeAll = async () => {
    if (!window.confirm('هل أنت متأكد من إعادة تصحيح جميع المشاركات؟ قد تستغرق هذه العملية بعض الوقت.')) return;
    try {
      await axios.post(`/tests/${test.id}/regrade-all`);
      alert('بدأت عملية إعادة التصحيح في الخلفية. سيتم تحديث الدرجات قريباً.');
      onClose();
    } catch (error) {
      console.error('Error starting regrade process:', error);
      alert('حدث خطأ في بدء عملية إعادة التصحيح.');
    }
  };

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

  // Fetch full test details (to get correct_answers and test_type) for computing raw counts
  useEffect(() => {
    let mounted = true;
    const fetchTest = async () => {
      try {
        const res = await axios.get(`/tests/${test.id}`);
        // controller returns { test }
        if (mounted) setTestDetail(res.data.test || null);
      } catch (e) {
        console.error('Failed to fetch test details for submissions modal', e);
      }
    };
    fetchTest();
    return () => { mounted = false; };
  }, [test.id]);

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
      // If submission has image path, preload image URL for quick view
      try {
        const imgPath = detail?.submission?.answers && (detail.submission.answers.bubble_image_path || detail.submission.answers.file_path || detail.submission.answers.bubble_image);
        if (imgPath) {
          setImageUrl(makeImageUrl(imgPath));
        } else {
          setImageUrl(null);
        }
      } catch (e) {
        setImageUrl(null);
      }
    } catch (error) {
      console.error('Error fetching submission for grading:', error);
      alert('تعذر تحميل بيانات المشاركة للتصحيح اليدوي');
      setGradingSubmission(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  const makeImageUrl = (p) => {
    if (!p) return null;
    if (p.startsWith('http')) return p;
    // normalize slashes
    const normalized = p.replace(/\\/g, '/').replace(/^\//, '');
    return `${window.location.origin}/${normalized}`;
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

  // Compute correct/total derived from percentage to avoid mismatch
  const computeCorrectTotal = (submission) => {
    if (!testDetail || !testDetail.correct_answers) return null;
    try {
      const ttype = testDetail.test_type;
      const ca = testDetail.correct_answers;
      let total = 0;
      if (ttype === 'MCQ') {
        const questions = ca.questions || [];
        total = questions.length;
      } else {
        const correctMap = ca.answers || ca;
        total = Object.keys(correctMap || {}).length;
      }
      const pct = Number(submission?.score || 0);
      const correct = Math.round((pct / 100) * (total || 0));
      return { correct, total };
    } catch (e) {
      console.error('Error computing correct/total:', e);
      return null;
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content submissions-modal">
        <div className="modal-header">
          <h2>مشاركات الاختبار: {test.title}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        {/* Modern toolbar section */}
        <div className="submissions-toolbar">
          <div className="toolbar-row">
            <div className="search-box">
              <FaSearch className="search-icon" />
              <input
                type="text"
                placeholder="ابحث باسم الطالب..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="toolbar-actions">
              {test.test_type === 'PHYSICAL_SHEET' && (
                <>
                  <button className="toolbar-btn primary" onClick={() => setShowBatchModal(true)} title="تصحيح جماعي للبابل">
                    <FaEdit /> <span>تصحيح جماعي</span>
                  </button>
                  <button className="toolbar-btn outline" onClick={() => setShowIncludeModal(true)} title="إضافة طلاب للاختبار">
                    <FaUserPlus /> <span>إضافة طلاب</span>
                  </button>
                </>
              )}
              {(test.test_type === 'MCQ' || test.test_type === 'BUBBLE_SHEET') && (
                <button className="toolbar-btn primary" onClick={handleRegradeAll} title="إعادة تصحيح الكل">
                  <FaRedo /> <span>إعادة تصحيح الكل</span>
                </button>
              )}
            </div>
          </div>
          <div className="toolbar-stats">
            <span className="stat-badge">الإجمالي: <strong>{localSubs.length}</strong></span>
            <span className="stat-badge">نتائج البحث: <strong>{localSubs.filter(sub => 
              searchTerm === '' || 
              (sub.student_name && sub.student_name.includes(searchTerm))
            ).length}</strong></span>
            {testDetail?.average_score !== null && testDetail?.average_score !== undefined && (
              <span className="stat-badge average">📊 المتوسط: <strong>{Math.floor(Number(testDetail.average_score))}%</strong></span>
            )}
          </div>
        </div>

        <div className="submissions-list">
          {localSubs.length === 0 ? (
            <p>لا توجد مشاركات</p>
          ) : (
            localSubs
              .filter(submission => 
                searchTerm === '' || 
                (submission.student_name && submission.student_name.includes(searchTerm))
              )
              .map(submission => (
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
                    (() => {
                      const stats = computeCorrectTotal(submission);
                      return (
                        <p className="score">الدرجة: {submission.score}%{stats ? ` (${stats.correct}/${stats.total})` : ''}</p>
                      );
                    })()
                  ) : (
                    (() => {
                      const stats = computeCorrectTotal(submission);
                      return (
                        <p className="no-score">{stats ? `صحيح ${stats.correct} من ${stats.total}` : 'لم يتم التقدير'}</p>
                      );
                    })()
                  )}
                </div>

                <div className="submission-actions-modern">
                  <div className="action-group primary-actions">
                    {test.test_type !== 'PHYSICAL_SHEET' && (
                      <button 
                        className="action-btn primary"
                        onClick={() => openManualGrading(submission)}
                        title="عرض/تصحيح يدوي"
                      >
                        <FaEye /> <span>عرض/تصحيح</span>
                      </button>
                    )}
                    {test.test_type === 'PHYSICAL_SHEET' && (
                      <>
                        <button 
                          className="action-btn primary"
                          onClick={async () => {
                            if (!window.confirm('هل أنت متأكد من إعادة تصحيح هذه المشاركة؟')) return;
                            try {
                              const res = await axios.post(`/submissions/${submission.id}/regrade-physical`);
                              if (res.data.success) {
                                alert(`تم إعادة التصحيح بنجاح. الدرجة: ${res.data.score}%`);
                                await refreshSubmissions();
                                onGradeUpdate && onGradeUpdate();
                              } else {
                                alert('فشل: ' + (res.data.message || 'خطأ غير معروف'));
                              }
                            } catch (e) {
                              console.error('Failed to regrade', e);
                              alert('فشل إعادة التصحيح');
                            }
                          }}
                          title="إعادة تصحيح"
                        >
                          <FaRedo /> <span>إعادة تصحيح</span>
                        </button>
                        <button
                          className="action-btn secondary"
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
                              alert('تعذر تحميل الإجابات');
                              setEditingAnswersId(null);
                            }
                          }}
                          title="تعديل الإجابات"
                        >
                          <FaEdit /> <span>تعديل الإجابات</span>
                        </button>
                        <button
                          className="action-btn secondary"
                          onClick={() => {
                            setGradeOverrideSubmission(submission);
                            setShowGradeOverrideModal(true);
                          }}
                          title="تجاوز الدرجة"
                        >
                          <FaPercent /> <span>تجاوز الدرجة</span>
                        </button>
                      </>
                    )}
                  </div>
                  <div className="action-group secondary-actions">
                    {((submission.answers && (submission.answers.file_path || submission.answers.bubble_image_path || submission.answers.bubble_image)) || submission.bubble_image_path) && (
                      <button
                        className="action-btn icon-only"
                        onClick={() => {
                          const img = (submission.answers && (submission.answers.bubble_image_path || submission.answers.file_path || submission.answers.bubble_image)) || submission.bubble_image_path;
                          const url = makeImageUrl(img);
                          setImageUrl(url);
                          setShowImageModal(true);
                        }}
                        title="عرض صورة البابل"
                      >
                        <FaImage />
                      </button>
                    )}
                    <button
                      className="action-btn icon-only danger"
                      onClick={async () => {
                        if (!window.confirm('هل أنت متأكد من حذف هذه المشاركة؟')) return;
                        try {
                          await axios.delete(`/submissions/${submission.id}`);
                          await refreshSubmissions();
                          onGradeUpdate && onGradeUpdate();
                        } catch (e) {
                          console.error('Failed to delete submission', e);
                          alert('فشل حذف المشاركة');
                        }
                      }}
                      title="حذف المشاركة"
                    >
                      <FaTrash />
                    </button>
                  </div>
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
                      {Array.from({ length: answersCount }, (_, i) => i + 1).map((qnum) => {
                        const correctAnswer = answersDetail?.correct_answers?.answers?.[qnum] || '';
                        const studentAnswer = answersMap[qnum] || '';
                        const isCorrect = correctAnswer && studentAnswer && correctAnswer === studentAnswer;
                        
                        return (
                          <div 
                            key={qnum} 
                            className="bubble-answer-item"
                            style={{
                              backgroundColor: isCorrect ? '#d4edda' : (studentAnswer && correctAnswer && !isCorrect ? '#f8d7da' : 'transparent'),
                              padding: '8px',
                              borderRadius: '4px',
                              border: '1px solid #ddd'
                            }}
                          >
                            <label style={{ fontWeight: 'bold' }}>س{qnum}</label>
                            <select
                              value={studentAnswer}
                              onChange={(e) => setAnswersMap(prev => ({ ...prev, [qnum]: e.target.value }))}
                              style={{
                                width: '100%',
                                padding: '4px',
                                marginTop: '4px'
                              }}
                            >
                              <option value="">-</option>
                              <option value="A">A</option>
                              <option value="B">B</option>
                              <option value="C">C</option>
                              <option value="D">D</option>
                            </select>
                            {correctAnswer && (
                              <div style={{ fontSize: '12px', marginTop: '4px', color: '#666' }}>
                                الصحيح: <strong>{correctAnswer}</strong>
                              </div>
                            )}
                          </div>
                        );
                      })}
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
                            alert('تم حفظ الإجابات بنجاح');
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
        {showImageModal && imageUrl && (
          <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: 900, width: '95%' }}>
              <div className="modal-header">
                <h2>صورة المشاركة</h2>
                <button className="close-btn" onClick={() => { setShowImageModal(false); setImageUrl(null); }}>×</button>
              </div>
              <div style={{ padding: 12, textAlign: 'center' }}>
                <img src={imageUrl} alt="Bubble submission" style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }} />
              </div>
            </div>
          </div>
        )}
        {showGradeOverrideModal && gradeOverrideSubmission && (
          <GradeOverrideModal
            submission={gradeOverrideSubmission}
            test={test}
            onClose={() => {
              setShowGradeOverrideModal(false);
              setGradeOverrideSubmission(null);
            }}
            onSave={async () => {
              setShowGradeOverrideModal(false);
              setGradeOverrideSubmission(null);
              await refreshSubmissions();
              onGradeUpdate && onGradeUpdate();
            }}
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

  const [includeQuery, setIncludeQuery] = useState('');
  const filteredStudents = students.filter(s => String(s.name || '').toLowerCase().includes(includeQuery.toLowerCase()) || String(s.id).includes(includeQuery));

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
              <div>
                <div style={{ marginBottom: 8 }}>
                  <input type="text" placeholder="بحث بالاسم أو ID" value={includeQuery} onChange={e => setIncludeQuery(e.target.value)} style={{ width: '100%', padding: 8 }} />
                </div>
                <div style={{ maxHeight: '50vh', overflow: 'auto' }}>
                {filteredStudents.map(s => (
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

// Grade Override Modal Component
const GradeOverrideModal = ({ submission, test, onClose, onSave }) => {
  const [score, setScore] = useState(submission?.score || 0);
  const [teacherComment, setTeacherComment] = useState(submission?.teacher_comment || '');
  const [submitting, setSubmitting] = useState(false);

  // Calculate total questions from correct answers
  const totalQuestions = React.useMemo(() => {
    if (!test?.correct_answers) return 50; // Default fallback

    try {
      const correctAnswers = typeof test.correct_answers === 'string'
        ? JSON.parse(test.correct_answers)
        : test.correct_answers;

      if (test.test_type === 'MCQ') {
        return correctAnswers.questions?.length || 0;
      } else if (test.test_type === 'BUBBLE_SHEET' || test.test_type === 'PHYSICAL_SHEET') {
        return Object.keys(correctAnswers.answers || {}).length;
      }
      return 50;
    } catch {
      return 50;
    }
  }, [test]);

  const correctAnswers = React.useMemo(() => {
    return Math.round((score / 100) * totalQuestions);
  }, [score, totalQuestions]);

  const handleScoreChange = (newScore) => {
    const numScore = parseFloat(newScore) || 0;
    setScore(Math.max(0, Math.min(100, numScore)));
  };

  const handleCorrectAnswersChange = (newCorrect) => {
    const numCorrect = parseInt(newCorrect) || 0;
    const newScore = totalQuestions > 0 ? Math.round((numCorrect / totalQuestions) * 10000) / 100 : 0;
    setScore(Math.max(0, Math.min(100, newScore)));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await axios.patch(`/submissions/${submission.id}/override-grade`, {
        score: parseFloat(score),
        teacher_comment: teacherComment.trim() || null
      });

      alert('تم تحديث الدرجة بنجاح');
      onSave();
    } catch (error) {
      console.error('Error overriding grade:', error);
      alert('حدث خطأ في تحديث الدرجة');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 500 }}>
        <div className="modal-header">
          <h2>تجاوز الدرجة - {submission.student_name}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div style={{ padding: '20px' }}>
          <div className="form-group">
            <label>إجمالي عدد الأسئلة: <strong>{totalQuestions}</strong></label>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>النسبة المئوية (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={score}
                onChange={(e) => handleScoreChange(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
              />
            </div>

            <div className="form-group" style={{ flex: 1 }}>
              <label>عدد الإجابات الصحيحة</label>
              <input
                type="number"
                min="0"
                max={totalQuestions}
                step="1"
                value={correctAnswers}
                onChange={(e) => handleCorrectAnswersChange(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
              />
            </div>
          </div>

          <div className="form-group">
            <label>تعليق المعلم (اختياري)</label>
            <textarea
              value={teacherComment}
              onChange={(e) => setTeacherComment(e.target.value)}
              rows={3}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                resize: 'vertical'
              }}
            />
          </div>

          <div className="form-actions" style={{ marginTop: '20px' }}>
            <button
              className="btn-secondary"
              onClick={onClose}
              disabled={submitting}
            >
              إلغاء
            </button>
            <button
              className="btn-primary"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? 'جاري الحفظ...' : 'حفظ التغييرات'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Export Rankings Modal
const ExportModal = ({ tests, onClose }) => {
  const [query, setQuery] = useState('');
  const [filtered, setFiltered] = useState(tests || []);
  const [selected, setSelected] = useState(new Set());
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setFiltered(tests.filter(t => t.title.toLowerCase().includes(query.toLowerCase())));
  }, [query, tests]);

  const toggle = (id) => {
    setSelected(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  const handleExport = async () => {
    if (!selected.size) { alert('يرجى اختيار اختبار واحد على الأقل'); return; }
    try {
      setExporting(true);
      const body = { test_ids: Array.from(selected) };
  const res = await axios.post('/tests/export-rankings', body, { responseType: 'blob' });
  const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
  a.download = 'rankings.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      onClose();
    } catch (e) {
      console.error('Export failed', e);
      alert('فشل التصدير');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 800 }}>
        <div className="modal-header">
          <h2>تصدير الترتيب المجموع</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <div style={{ padding: 12 }}>
          <input type="text" placeholder="بحث عن اختبار" value={query} onChange={e => setQuery(e.target.value)} style={{ width: '100%', padding: 8, marginBottom: 12 }} />
          <div style={{ maxHeight: '50vh', overflow: 'auto' }}>
            {filtered.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', padding: 8, borderBottom: '1px solid #eee' }}>
                <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} />
                <div style={{ marginInlineStart: 8 }}>{t.title} — {t.grade}{t.student_group ? ` — ${t.student_group}` : ''}</div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                لا توجد نتائج تطابق البحث
              </div>
            )}
          </div>
        </div>
        <div className="form-actions" style={{ padding: 12 }}>
          <button className="btn-secondary" onClick={onClose}>إلغاء</button>
          <button className="btn-primary" onClick={handleExport} disabled={exporting}>{exporting ? 'جارٍ التصدير...' : 'تصدير'}</button>
        </div>
      </div>
    </div>
  );
};

export default TestManagement;
