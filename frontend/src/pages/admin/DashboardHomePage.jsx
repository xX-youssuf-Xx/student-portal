import React from "react";

const DashboardHomePage = () => {
	return (
		<div className="dashboard-content">
			{/* Welcome Card */}
			<div className="welcome-card">
				<div className="welcome-content">
					<h2>مرحباً بك في لوحة تحكم المدير</h2>
					<p>يمكنك من خلال هذه اللوحة إدارة الطلاب والاختبارات وعرض التقارير</p>
				</div>
				<div className="welcome-visual">
					<div className="placeholder-image">👨‍💼</div>
				</div>
			</div>

			{/* Quick Stats */}
			<div className="stats-grid">
				<div className="stat-card">
					<div className="stat-icon">👥</div>
					<div className="stat-content">
						<h3>إجمالي الطلاب</h3>
						<p className="stat-number">150</p>
						<p className="stat-description">طالب نشط</p>
					</div>
				</div>

				<div className="stat-card">
					<div className="stat-icon">📝</div>
					<div className="stat-content">
						<h3>الاختبارات النشطة</h3>
						<p className="stat-number">12</p>
						<p className="stat-description">اختبار جاري</p>
					</div>
				</div>
			</div>

			{/* Quick Actions */}
			<div className="quick-actions">
				<h2>إجراءات سريعة</h2>
				<div className="actions-grid">
					<button className="action-button">
						<span className="action-icon">👥</span>
						<span>إدارة الطلاب</span>
					</button>

					<button className="action-button">
						<span className="action-icon">📝</span>
						<span>إنشاء اختبار</span>
					</button>

					<button className="action-button">
						<span className="action-icon">📊</span>
						<span>التقارير</span>
					</button>

					<button className="action-button">
						<span className="action-icon">⚙️</span>
						<span>إعدادات النظام</span>
					</button>
				</div>
			</div>
		</div>
	);
};

export default DashboardHomePage;
