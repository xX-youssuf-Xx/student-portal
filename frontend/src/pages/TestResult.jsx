import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import axios from "axios";
import TestImageViewer from "../components/TestImageViewer";
import "./TestResult.css";

const TestResult = () => {
  const { testId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAnswers, setShowAnswers] = useState(false);
  const [showImageViewer, setShowImageViewer] = useState(false);
  const [rank, setRank] = useState(null);
  const [totalStudents, setTotalStudents] = useState(0);

  useEffect(() => {
    fetchResult();
    fetchRank();
  }, [testId]);

  const fetchResult = async () => {
    try {
      const response = await axios.get(`/tests/${testId}/result`);
      setResult(response.data.result);
    } catch (error) {
      console.error("Error fetching result:", error);
      alert("حدث خطأ في تحميل النتيجة");
      navigate("/student/dashboard");
    } finally {
      setLoading(false);
    }
  };

  const fetchRank = async () => {
    try {
      const response = await axios.get(`/tests/${testId}/submissions/rank`);
      setRank(response.data.rank);
      setTotalStudents(response.data.totalStudents);
    } catch (error) {
      console.error("Error fetching rank:", error);
      // rank is optional, so don't alert user
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString("ar-EG", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getTestTypeLabel = (type) => {
    switch (type) {
      case "MCQ":
        return "اختيار من متعدد";
      case "BUBBLE_SHEET":
        return "ورقة إجابة";
      case "PHYSICAL_SHEET":
        return "ورقة فيزيائية";
      default:
        return type;
    }
  };

  const getScoreColors = (score) => {
    const pct = Number(score) || 0;
    let bg = "#f2f6fb";
    if (pct >= 80) bg = "#28a745";
    else if (pct >= 50) bg = "#f1c40f";
    else bg = "#e74c3c";
    return { background: bg, color: "#000" };
  };

  const toggleImageViewer = () => {
    setShowImageViewer(!showImageViewer);
  };

  /** ---------- Comparisons ---------- **/

  const renderBubbleSheetComparison = () => {
    if (!result.correct_answers_visible?.answers) return null;

    let studentAnswers;
    try {
      studentAnswers =
        typeof result.visible_answers === "string"
          ? JSON.parse(result.visible_answers)
          : result.visible_answers;
    } catch (error) {
      console.error("Error parsing visible_answers:", error);
      return <div>خطأ في تحميل الإجابات</div>;
    }

    const correctAnswers = result.correct_answers_visible.answers;

    return (
      <div className="bubble-comparison">
        <h3>مقارنة الإجابات</h3>
        <div className="bubble-grid-comparison">
          {Object.entries(correctAnswers).map(([qNum, correct]) => {
            const student = studentAnswers.answers?.[qNum];
            const isCorrect = student === correct;
            return (
              <div
                key={qNum}
                className={`bubble-item ${isCorrect ? "correct" : "incorrect"}`}
              >
                <span className="question-num">س{qNum}</span>
                <div className="answers">
                  <span className="student-answer">
                    إجابتك: {student || "-"}
                  </span>
                  <span className="correct-answer">الصحيح: {correct}</span>
                </div>
                <span
                  className={`result-icon ${isCorrect ? "correct" : "incorrect"}`}
                >
                  {isCorrect ? "✓" : "✗"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderPhysicalSheetComparison = () => {
    if (!result.correct_answers_visible?.answers) return null;

    let studentAnswers;
    try {
      studentAnswers =
        typeof result.visible_answers === "string"
          ? JSON.parse(result.visible_answers)
          : result.visible_answers;
    } catch (error) {
      return <div>خطأ في تحميل الإجابات</div>;
    }

    const correctAnswers = result.correct_answers_visible.answers;
    const API_BASE =
      import.meta?.env?.VITE_API_BASE_URL ||
      "https://studentportal.egypt-tech.com";

    const imgSrc = studentAnswers?.bubble_image_path
      ? `${API_BASE}/${studentAnswers.bubble_image_path}`
      : null;

    return (
      <div className="bubble-comparison">
        <h3>مقارنة الإجابات</h3>
        <div className="bubble-grid-comparison">
          {Object.entries(correctAnswers).map(([qNum, correct]) => {
            const student = studentAnswers.answers?.[qNum];
            const isCorrect = student === correct;
            return (
              <div
                key={qNum}
                className={`bubble-item ${isCorrect ? "correct" : "incorrect"}`}
              >
                <span className="question-num">س{qNum}</span>
                <div className="answers">
                  <span className="student-answer">
                    إجابتك: {student || "-"}
                  </span>
                  <span className="correct-answer">الصحيح: {correct}</span>
                </div>
                <span
                  className={`result-icon ${isCorrect ? "correct" : "incorrect"}`}
                >
                  {isCorrect ? "✓" : "✗"}
                </span>
              </div>
            );
          })}
        </div>
        {imgSrc && (
          <div className="graded-bubble-image" style={{ marginTop: 16 }}>
            <h4>صورة البابل المصححة</h4>
            <img
              src={imgSrc}
              alt="الورقة المصححة"
              style={{
                maxWidth: "100%",
                borderRadius: 8,
                border: "1px solid #eee",
              }}
            />
          </div>
        )}
      </div>
    );
  };

  const renderMCQComparison = () => {
    if (!result.correct_answers_visible?.questions) return null;

    let studentAnswers;
    try {
      studentAnswers =
        typeof result.visible_answers === "string"
          ? JSON.parse(result.visible_answers)
          : result.visible_answers;
    } catch (error) {
      return <div>خطأ في تحميل الإجابات</div>;
    }

    const correctQuestions = result.correct_answers_visible.questions;
    const manualGrades =
      result.manual_grades_visible?.grades ||
      result.manual_grades_visible ||
      {};

    return (
      <div className="answers-comparison">
        <h3>مقارنة الإجابات</h3>
        {correctQuestions.map((q, idx) => {
          const studentAns = studentAnswers.answers?.find((a) => a.id === q.id);
          const openGradeRaw = manualGrades?.[q.id] ?? manualGrades?.[String(q.id)];
          const openGrade =
            typeof openGradeRaw === "number" ? openGradeRaw : null;

          const isCorrect =
            q.type === "OPEN"
              ? openGrade !== null && openGrade > 0
              : studentAns?.answer === q.correct;

          return (
            <div
              key={q.id}
              className={`question-comparison ${
                isCorrect ? "correct" : "incorrect"
              }`}
            >
              <div className="question-header">
                <h4>السؤال {idx + 1}</h4>
                <span
                  className={`result-badge ${
                    isCorrect ? "correct" : "incorrect"
                  }`}
                >
                  {isCorrect ? "✓ صحيح" : "✗ خطأ"}
                </span>
              </div>

              <div className="question-text">
                <p>{q.text}</p>
                {q.media && (
                  <div className="question-media">
                    {q.media.endsWith(".mp4") ? (
                      <video controls>
                        <source src={q.media} type="video/mp4" />
                      </video>
                    ) : (
                      <img src={q.media} alt="سؤال" />
                    )}
                  </div>
                )}
              </div>

              {q.type === "MCQ" && q.options && (
                <div className="options-comparison">
                  {q.options.map((opt, i) => {
                    const isStudentAns = studentAns?.answer === opt;
                    const isCorrectAns = q.correct === opt;

                    return (
                      <div
                        key={i}
                        className={`option-item ${
                          isCorrectAns ? "correct-answer" : ""
                        } ${
                          isStudentAns && !isCorrectAns ? "wrong-answer" : ""
                        } ${
                          isStudentAns && isCorrectAns ? "student-correct" : ""
                        }`}
                      >
                        <span>{opt}</span>
                        {isCorrectAns && (
                          <span className="correct-mark">✓ الإجابة الصحيحة</span>
                        )}
                        {isStudentAns && !isCorrectAns && (
                          <span className="wrong-mark">✗ إجابتك</span>
                        )}
                        {isStudentAns && isCorrectAns && (
                          <span className="student-mark">✓ إجابتك الصحيحة</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {q.type === "OPEN" && (
                <div className="open-answer-comparison">
                  <div className="student-answer">
                    <h5>إجابتك:</h5>
                    <p>{studentAns?.answer || "لم تجب"}</p>
                  </div>
                  <div className="open-grade">
                    <h5>التقييم:</h5>
                    <p>
                      {openGrade !== null
                        ? `${Math.round(openGrade * 100)}%`
                        : "لم يتم التقييم بعد"}
                    </p>
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

  /** ---------- Loader / No Result ---------- **/

  if (loading) {
    return <div className="loading">جاري تحميل النتيجة...</div>;
  }

  if (!result) {
    return <div className="error">لم يتم العثور على النتيجة</div>;
  }

  /** ---------- Main JSX ---------- **/

  return (
    <div className="test-result">
      {showImageViewer && (
        <div className="test-image-viewer-modal">
          <div className="test-image-viewer-header">
            <h3>عرض صور الاختبار</h3>
            <button
              className="close-button"
              onClick={toggleImageViewer}
              aria-label="إغلاق معرض الصور"
            >
              &times;
            </button>
          </div>
          <div className="test-image-viewer-content">
            <TestImageViewer testId={testId} />
          </div>
        </div>
      )}

      <div className="result-header">
        <div className="header-content">
          <h1>نتيجة الاختبار</h1>
          <button
            className="view-images-button"
            onClick={toggleImageViewer}
            title="عرض صور الاختبار"
          >
            <i className="fas fa-images"></i> عرض صور الاختبار
          </button>
        </div>
        <button
          className="back-btn"
          onClick={() => navigate("/student/dashboard")}
        >
          ← العودة للوحة التحكم
        </button>
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

        {/* Score */}
        {result.visible_score !== null && (
          <div className="score-card">
            {(() => {
              const colors = getScoreColors(result.visible_score);
              return (
                <div
                  className="score-circle"
                  style={{ background: colors.background }}
                >
                  <span
                    className="score-value"
                    style={{ color: colors.color }}
                  >
                    {result.visible_score}%
                  </span>
                </div>
              );
            })()}

            <div className="score-details">
              <h3>درجتك</h3>
              <p className="score-description">
                {result.visible_score >= 85 && "ممتاز! أداء رائع"}
                {result.visible_score >= 70 &&
                  result.visible_score < 85 &&
                  "جيد جداً! استمر في التحسن"}
                {result.visible_score >= 50 &&
                  result.visible_score < 70 &&
                  "جيد، يمكنك التحسن أكثر"}
                {result.visible_score < 50 && "يحتاج إلى مراجعة المادة"}
              </p>

              {/* Show Raw Score */}
              {(() => {
                const compute = () => {
                  try {
                    const ca = result.correct_answers_visible;
                    let sa = result.visible_answers;
                    if (!ca) return null;
                    if (typeof sa === "string") sa = JSON.parse(sa);

                    if (result.test_type === "MCQ") {
                      const questions = ca.questions || [];
                      const total = questions.length;
                      let correct = 0;
                      const stuArr = sa?.answers || [];
                      for (const q of questions) {
                        const ans = stuArr.find((a) => a.id === q.id);
                        if (ans && ans.answer === q.correct) correct++;
                      }
                      return { correct, total };
                    }

                    if (
                      result.test_type === "BUBBLE_SHEET" ||
                      result.test_type === "PHYSICAL_SHEET"
                    ) {
                      const correctMap = ca.answers || {};
                      const studentMap = sa?.answers || {};
                      const keys = Object.keys(correctMap);
                      const total = keys.length;
                      let correct = 0;
                      for (const k of keys) {
                        if (
                          studentMap[k] &&
                          String(correctMap[k]) === String(studentMap[k])
                        ) {
                          correct++;
                        }
                      }
                      return { correct, total };
                    }
                  } catch {
                    return null;
                  }
                  return null;
                };

                const stats = compute();
                if (!stats) {
                  return (
                    <p style={{ marginTop: 8 }}>
                      <strong>الدرجة:</strong> غير متاحة
                    </p>
                  );
                }
                const pct =
                  stats.total > 0
                    ? Math.round((stats.correct / stats.total) * 10000) / 100
                    : 0;
                return (
                  <p style={{ marginTop: 8 }}>
                    <strong>الدرجة:</strong>  {"( "} {stats.correct} من {stats.total} {" )"} — {"  "}
                    {pct}%
                  </p>
                );
              })()}

              {/* Rank */}
              {rank !== null && rank > 0 && (
                <div
                  className="rank-display"
                  style={{
                    marginTop: "12px",
                    padding: "12px",
                    backgroundColor: "#f8f9fa",
                    borderRadius: "8px",
                    border: "1px solid #e9ecef",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "8px",
                    }}
                  >
                    <span style={{ fontWeight: "bold", color: "#2c3e50" }}>
                      الترتيب:
                    </span>
                    <span
                      style={{
                        fontWeight: "bold",
                        fontSize: "1.2em",
                        color: "#1a73e8",
                      }}
                    >
                      {rank} / {totalStudents}
                    </span>
                  </div>
                </div>
              )}
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

        {/* Toggle Answers */}
        {result.visible_answers && result.correct_answers_visible && (
          <div className="answers-toggle">
            <button
              className="btn-outline"
              onClick={() => setShowAnswers(!showAnswers)}
            >
              {showAnswers ? "إخفاء الإجابات" : "عرض الإجابات والمقارنة"}
            </button>
          </div>
        )}

        {/* Comparisons */}
        {showAnswers && result.visible_answers && result.correct_answers_visible && (
          <div className="answers-section">
            {result.test_type === "MCQ" && renderMCQComparison()}
            {result.test_type === "BUBBLE_SHEET" && renderBubbleSheetComparison()}
            {result.test_type === "PHYSICAL_SHEET" &&
              renderPhysicalSheetComparison()}
          </div>
        )}

        {/* PDF */}
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