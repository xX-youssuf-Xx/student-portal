import React, { useState } from 'react';
import './StudentCard.css';

const StudentCard = ({ student, onEdit, onDelete, extraActions }) => {
  const [copied, setCopied] = useState(false);

  const copyId = () => {
    navigator.clipboard.writeText(student.id.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

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
        <h3>
          {student.name}
          <span className="student-id">
            #{student.id}
            <button className="copy-id-btn" onClick={copyId} title="نسخ الرقم">
              {copied ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              )}
            </button>
          </span>
        </h3>
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