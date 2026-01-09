import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import StudentCard from '../../components/admin/StudentCard';
import StudentModal from '../../components/admin/StudentModal';
import { useAuth } from '../../contexts/AuthContext';
import './StudentManagement.css';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

const StudentManagement = () => {
  const [students, setStudents] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState(null); // { type: 'success' | 'error', message: string }
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [resultsData, setResultsData] = useState({ student: null, results: [] });
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(12);
  

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    try {
      const response = await axios.get('/admin/students');
      setStudents(response.data && response.data.students ? response.data.students : []);
    } catch (error) {
      console.error('Error fetching students:', error);
    }
  };

  const handleAddStudent = () => {
    setEditingStudent(null);
    setIsModalOpen(true);
  };

  const handleEditStudent = (student) => {
    setEditingStudent(student);
    setIsModalOpen(true);
  };

  const handleDeleteStudent = async (id) => {
    if (window.confirm('هل أنت متأكد أنك تريد حذف هذا الطالب؟')) {
      try {
        await axios.delete(`/admin/students/${id}`);
        fetchStudents();
      } catch (error) {
        console.error('Error deleting student:', error);
      }
    }
  };

  const openResultsModal = async (student) => {
    try {
      setResultsLoading(true);
      setShowResultsModal(true);
      const res = await axios.get(`/admin/students/${student.id}/results`);
      setResultsData({ student, results: Array.isArray(res.data?.results) ? res.data.results : [] });
    } catch (e) {
      setResultsData({ student, results: [] });
    } finally {
      setResultsLoading(false);
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

  const handleSaveStudent = async (formData, id) => {
    try {
      setIsSaving(true);
      const dataToSave = { ...formData };
      if (id && !dataToSave.password) {
        delete dataToSave.password;
      }

      if (id) {
        await axios.put(`/admin/students/${id}`, dataToSave);
        setToast({ type: 'success', message: 'تم تحديث بيانات الطالب بنجاح' });
      } else {
        await axios.post('/admin/students', dataToSave);
        setToast({ type: 'success', message: 'تم إضافة الطالب بنجاح' });
      }
      fetchStudents();
      setIsModalOpen(false);
    } catch (error) {
      console.error('Error saving student:', error);
      setToast({ type: 'error', message: 'حدث خطأ أثناء حفظ بيانات الطالب' });
    } finally {
      setIsSaving(false);
      // auto hide toast
      setTimeout(() => setToast(null), 3000);
    }
  };

  const filteredStudents = useMemo(() => {
    return students.filter(student => {
      const searchMatch = (student.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (student.phone_number || '').includes(searchTerm);
      const gradeMatch = gradeFilter ? student.grade === gradeFilter : true;
      const groupMatch = groupFilter ? student.student_group === groupFilter : true;
      return searchMatch && gradeMatch && groupMatch;
    });
  }, [students, searchTerm, gradeFilter, groupFilter]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, gradeFilter, groupFilter, itemsPerPage]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredStudents.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedStudents = filteredStudents.slice(startIndex, endIndex);

  // Generate page numbers for pagination
  const getPageNumbers = () => {
    const pages = [];
    const maxVisiblePages = 5;
    
    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      }
    }
    return pages;
  };

  return (
    <div className="student-management">
      <div className="student-management-header">
        <h1>إدارة الطلاب</h1>
        <button onClick={handleAddStudent} className="add-student-btn">+ إضافة طالب</button>
      </div>

      <div className="filters">
        <input
          type="text"
          placeholder="البحث بالاسم أو الهاتف..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <select value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)}>
          <option value="">جميع الصفوف</option>
          <option value="3MIDDLE">الصف الثالث الإعدادي</option>
          <option value="1HIGH">الصف الأول الثانوي</option>
          <option value="2HIGH">الصف الثاني الثانوي</option>
          <option value="3HIGH">الصف الثالث الثانوي</option>
        </select>
        <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
          <option value="">جميع المجموعات</option>
          <option value="MINYAT-EL-NASR">منية النصر</option>
          <option value="RIYAD">رياض</option>
          <option value="MEET-HADID">ميت حديد</option>
        </select>
        <div className="per-page-selector">
          <label>عرض:</label>
          <select value={itemsPerPage} onChange={(e) => setItemsPerPage(Number(e.target.value))}>
            <option value={6}>6</option>
            <option value={12}>12</option>
            <option value={24}>24</option>
            <option value={48}>48</option>
            <option value={100}>100</option>
          </select>
          <span>لكل صفحة</span>
        </div>
        <div className="results-count">
          إجمالي: {filteredStudents.length} طالب
        </div>
      </div>

      <div className="student-list">
        {paginatedStudents.map(student => (
          <StudentCard
            key={student.id}
            student={student}
            onEdit={handleEditStudent}
            onDelete={handleDeleteStudent}
            extraActions={<button className="edit-btn" onClick={() => openResultsModal(student)}>عرض النتائج</button>}
          />
        ))}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="pagination">
          <button
            className="pagination-btn"
            onClick={() => setCurrentPage(1)}
            disabled={currentPage === 1}
          >
            الأولى
          </button>
          <button
            className="pagination-btn"
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
          >
            السابق
          </button>
          
          <div className="pagination-pages">
            {getPageNumbers().map((page, index) => (
              page === '...' ? (
                <span key={`ellipsis-${index}`} className="pagination-ellipsis">...</span>
              ) : (
                <button
                  key={page}
                  className={`pagination-page ${currentPage === page ? 'active' : ''}`}
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </button>
              )
            ))}
          </div>
          
          <button
            className="pagination-btn"
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages}
          >
            التالي
          </button>
          <button
            className="pagination-btn"
            onClick={() => setCurrentPage(totalPages)}
            disabled={currentPage === totalPages}
          >
            الأخيرة
          </button>
          
          <span className="pagination-info">
            صفحة {currentPage} من {totalPages}
          </span>
        </div>
      )}

      <StudentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveStudent}
        student={editingStudent}
        isSaving={isSaving}
      />
      {toast && (
        <div className={`toast ${toast.type}`}>{toast.message}</div>
      )}

      {showResultsModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '800px', width: '90%' }}>
            <div className="modal-header">
              <h3>سجل درجات الطالب: {resultsData.student?.name}</h3>
              <button onClick={() => setShowResultsModal(false)} className="close-btn">×</button>
            </div>
            <div className="modal-body" style={{ padding: '20px' }}>
              {resultsLoading ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>جاري تحميل النتائج...</div>
              ) : resultsData.results.length > 0 ? (
                <>
                  <div style={{ marginBottom: '1rem' }}>
                    <p style={{ textAlign: 'center', color: '#64748b' }}>
                      تطور الأداء في الاختبارات السابقة
                    </p>
                  </div>
                  <ResultsLineChart data={resultsData.results} />
                  {/* Overall Average Display */}
                  {(() => {
                    const scores = resultsData.results
                      .map(r => parseFloat(r.visible_score ?? r.score ?? 0))
                      .filter(s => !isNaN(s));
                    if (scores.length === 0) return null;
                    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
                    return (
                      <div style={{
                        marginTop: '20px',
                        padding: '16px',
                        background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
                        borderRadius: '12px',
                        border: '1px solid #bae6fd',
                        textAlign: 'center'
                      }}>
                        <span style={{ fontSize: '1rem', color: '#0369a1', fontWeight: '500' }}>
                          📊 المتوسط العام للطالب:
                        </span>
                        <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#0284c7', marginRight: '10px' }}>
                          {avg.toFixed(2)}%
                        </span>
                        <span style={{ fontSize: '0.9rem', color: '#64748b', marginRight: '8px' }}>
                          (من {scores.length} اختبار)
                        </span>
                      </div>
                    );
                  })()}
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                  لا توجد نتائج متاحة لهذا الطالب بعد
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentManagement;