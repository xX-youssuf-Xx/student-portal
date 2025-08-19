import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import StudentCard from '../../components/admin/StudentCard';
import StudentModal from '../../components/admin/StudentModal';
import { useAuth } from '../../contexts/AuthContext';
import './StudentManagement.css';

const StudentManagement = () => {
  const [students, setStudents] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState(null); // { type: 'success' | 'error', message: string }
  

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    try {
      const response = await axios.get('http://localhost:3000/api/admin/students');
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
        await axios.delete(`http://localhost:3000/api/admin/students/${id}`);
        fetchStudents();
      } catch (error) {
        console.error('Error deleting student:', error);
      }
    }
  };

  const handleSaveStudent = async (formData, id) => {
    try {
      setIsSaving(true);
      const dataToSave = { ...formData };
      if (id && !dataToSave.password) {
        delete dataToSave.password;
      }

      if (id) {
        await axios.put(`http://localhost:3000/api/admin/students/${id}`, dataToSave);
        setToast({ type: 'success', message: 'تم تحديث بيانات الطالب بنجاح' });
      } else {
        await axios.post('http://localhost:3000/api/admin/students', dataToSave);
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
      </div>

      <div className="student-list">
        {filteredStudents.map(student => (
          <StudentCard
            key={student.id}
            student={student}
            onEdit={handleEditStudent}
            onDelete={handleDeleteStudent}
          />
        ))}
      </div>

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
    </div>
  );
};

export default StudentManagement;