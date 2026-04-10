import { useEffect, useRef, useState } from "react";
import "./StudentCard.css";

const StudentCard = ({
	student,
	onEdit,
	onDelete,
	onCopyLoginLink,
	onViewResults,
}) => {
	const [copied, setCopied] = useState(false);
	const [menuOpen, setMenuOpen] = useState(false);
	const actionsMenuRef = useRef(null);

	const copyId = () => {
		navigator.clipboard.writeText(student.id.toString());
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	};

	const closeMenu = () => setMenuOpen(false);

	useEffect(() => {
		if (!menuOpen) return;

		const handleOutsideClick = (event) => {
			if (
				actionsMenuRef.current &&
				!actionsMenuRef.current.contains(event.target)
			) {
				setMenuOpen(false);
			}
		};

		document.addEventListener("mousedown", handleOutsideClick);
		return () => document.removeEventListener("mousedown", handleOutsideClick);
	}, [menuOpen]);

	useEffect(() => {
		if (!menuOpen) return;

		const handleEscape = (event) => {
			if (event.key === "Escape") {
				setMenuOpen(false);
			}
		};

		document.addEventListener("keydown", handleEscape);
		return () => document.removeEventListener("keydown", handleEscape);
	}, [menuOpen]);

	const gradeLabels = {
		"3MIDDLE": "الصف الثالث الإعدادي",
		"1HIGH": "الصف الأول الثانوي",
		"2HIGH": "الصف الثاني الثانوي",
		"3HIGH": "الصف الثالث الثانوي",
	};

	const groupLabels = {
		"MINYAT-EL-NASR": "منية النصر",
		RIYAD: "رياض",
		"MEET-HADID": "ميت حديد",
	};
	return (
		<div className="student-card">
			<div className="student-card-header">
				<h3>
					{student.name}
					<span className="student-id">
						#{student.id}
						<button
							type="button"
							className="copy-id-btn"
							onClick={copyId}
							title="نسخ الرقم"
							aria-label="نسخ رقم الطالب"
						>
							{copied ? (
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="14"
									height="14"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
									aria-hidden="true"
								>
									<polyline points="20 6 9 17 4 12"></polyline>
								</svg>
							) : (
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="14"
									height="14"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
									aria-hidden="true"
								>
									<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
									<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
								</svg>
							)}
						</button>
					</span>
				</h3>
				<div className="student-card-actions-menu" ref={actionsMenuRef}>
					<button
						type="button"
						className="menu-trigger-btn"
						onClick={() => setMenuOpen((prev) => !prev)}
						title="قائمة الإجراءات"
						aria-expanded={menuOpen}
						aria-haspopup="menu"
					>
						⋯
					</button>
					{menuOpen && (
						<div className="student-actions-dropdown">
							<button
								type="button"
								onClick={() => {
									onEdit(student);
									closeMenu();
								}}
								className="dropdown-action-btn"
							>
								تعديل
							</button>
							<button
								type="button"
								onClick={() => {
									onDelete(student.id);
									closeMenu();
								}}
								className="dropdown-action-btn danger"
							>
								حذف
							</button>
							<button
								type="button"
								onClick={() => {
									if (onCopyLoginLink) {
										onCopyLoginLink(student);
									}
									closeMenu();
								}}
								className="dropdown-action-btn"
							>
								نسخ رابط الدخول كطالب
							</button>
							<button
								type="button"
								onClick={() => {
									if (onViewResults) {
										onViewResults(student);
									}
									closeMenu();
								}}
								className="dropdown-action-btn"
							>
								عرض النتائج
							</button>
						</div>
					)}
				</div>
			</div>
			<div className="student-card-body">
				<p>
					<strong>الهاتف:</strong> {student.phone_number}
				</p>
				{student.parent_phone && (
					<p>
						<strong>هاتف ولي الأمر:</strong> {student.parent_phone}
					</p>
				)}
				<p>
					<strong>الصف:</strong> {gradeLabels[student.grade] || student.grade}
				</p>
				<p>
					<strong>المجموعة:</strong>{" "}
					{groupLabels[student.student_group] || student.student_group || "N/A"}
				</p>
			</div>
		</div>
	);
};

export default StudentCard;
