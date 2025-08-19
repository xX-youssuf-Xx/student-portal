import React, { useState, useEffect } from 'react';
import './StudentModal.css';

const StudentModal = ({ isOpen, onClose, onSave, student, isSaving = false }) => {
  const [formData, setFormData] = useState({
    name: '',
    phone_number: '',
    parent_phone: '',
    grade: '3MIDDLE',
    student_group: 'MINYAT-EL-NASR',
    password: '',
  });

  useEffect(() => {
    if (student) {
      setFormData({
        name: student.name,
        phone_number: student.phone_number,
        parent_phone: student.parent_phone || '',
        grade: student.grade,
        student_group: student.student_group || 'MINYAT-EL-NASR',
        password: '', // Password should not be pre-filled
      });
    } else {
      setFormData({
        name: '',
        phone_number: '',
        parent_phone: '',
        grade: '3MIDDLE',
        student_group: 'MINYAT-EL-NASR',
        password: '',
      });
    }
  }, [student, isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = {
      ...formData,
      student_group: formData.grade === '3MIDDLE' ? null : formData.student_group,
    };
    onSave(payload, student?.id);
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onClick={() => {
        setFormData({
          name: '',
          phone_number: '',
          parent_phone: '',
          grade: '3MIDDLE',
          student_group: 'MINYAT-EL-NASR',
          password: '',
        });
        onClose();
      }}
    >
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2>{student ? 'تعديل طالب' : 'إضافة طالب'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>الاسم</label>
            <input type="text" name="name" value={formData.name} onChange={handleChange} required disabled={isSaving} />
          </div>
          <div className="form-group">
            <label>رقم الهاتف</label>
            <input type="text" name="phone_number" value={formData.phone_number} onChange={handleChange} required disabled={isSaving} />
          </div>
          <div className="form-group">
            <label>هاتف ولي الأمر (اختياري)</label>
            <input type="text" name="parent_phone" value={formData.parent_phone} onChange={handleChange} disabled={isSaving} />
          </div>
          <div className="form-group">
            <label>الصف</label>
            <select name="grade" value={formData.grade} onChange={handleChange} disabled={isSaving}>
              <option value="3MIDDLE">الصف الثالث الإعدادي</option>
              <option value="1HIGH">الصف الأول الثانوي</option>
              <option value="2HIGH">الصف الثاني الثانوي</option>
              <option value="3HIGH">الصف الثالث الثانوي</option>
            </select>
          </div>
          {formData.grade !== '3MIDDLE' && (
            <div className="form-group">
              <label>المجموعة</label>
              <select name="student_group" value={formData.student_group} onChange={handleChange} disabled={isSaving}>
                <option value="MINYAT-EL-NASR">منية النصر</option>
                <option value="RIYAD">رياض</option>
                <option value="MEET-HADID">ميت حديد</option>
              </select>
            </div>
          )}
          <div className="form-group">
            <label>كلمة المرور {student ? '(اتركه فارغاً للاحتفاظ بالحالية)' : ''}</label>
            <input type="password" name="password" value={formData.password} onChange={handleChange} required={!student} disabled={isSaving} />
          </div>
          <div className="modal-actions">
            <button
              type="button"
              onClick={() => {
                // reset fields on close
                setFormData({
                  name: '',
                  phone_number: '',
                  parent_phone: '',
                  grade: '3MIDDLE',
                  student_group: 'MINYAT-EL-NASR',
                  password: '',
                });
                onClose();
              }}
              className="cancel-btn"
              disabled={isSaving}
            >
              إلغاء
            </button>
            <button type="submit" className="save-btn" disabled={isSaving}>
              {isSaving ? 'جارٍ الحفظ...' : 'حفظ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default StudentModal;