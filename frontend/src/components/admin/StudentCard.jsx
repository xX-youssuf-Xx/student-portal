import React from 'react';
import './StudentCard.css';

const StudentCard = ({ student, onEdit, onDelete, extraActions }) => {
  const gradeLabels = {
    '3MIDDLE': 'الصف الثالث الإعدادي',
    '1HIGH': 'الصف الأول الثانوي',
    '2HIGH': 'الصف الثاني الثانوي',
    '3HIGH': 'الصف الثالث الثانوي',
  };

  const groupLabels = {
    'MINYAT-EL-NASR': 'منية النصر',
    'RIYAD': 'رياض',
    'MEET-HADID': 'ميت حديد',
  };
  return (
    <div className="student-card">
      <div className="student-card-header">
        <h3>{student.name}</h3>
        <div className="student-card-actions">
          <button onClick={() => onEdit(student)} className="edit-btn">تعديل</button>
          <button onClick={() => onDelete(student.id)} className="delete-btn">حذف</button>
        {extraActions}
        </div>
      </div>
      <div className="student-card-body">
        <p><strong>الهاتف:</strong> {student.phone_number}</p>
        {student.parent_phone && (
          <p><strong>هاتف ولي الأمر:</strong> {student.parent_phone}</p>
        )}
        <p><strong>الصف:</strong> {gradeLabels[student.grade] || student.grade}</p>
        <p><strong>المجموعة:</strong> {groupLabels[student.student_group] || student.student_group || 'N/A'}</p>
      </div>
    </div>
  );
};

export default StudentCard;