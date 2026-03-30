import {
	Navigate,
	Route,
	BrowserRouter as Router,
	Routes,
	useSearchParams,
} from "react-router-dom";
import Footer from "./components/Footer";
import Navbar from "./components/Navbar";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import AdminDashboard from "./pages/AdminDashboard";
import AdminLogin from "./pages/AdminLogin";
import DashboardHomePage from "./pages/admin/DashboardHomePage";
import StudentManagement from "./pages/admin/StudentManagement";
import TestManagement from "./pages/admin/TestManagement";
import Home from "./pages/Home";
import StudentAutoLogin from "./pages/StudentAutoLogin";
import StudentDashboard from "./pages/StudentDashboard";
import StudentLogin from "./pages/StudentLogin";
import TestResult from "./pages/TestResult";
import TestTaking from "./pages/TestTaking";
import "./App.css";

// Protected Route  Component
const ProtectedRoute = ({ children, allowedTypes }) => {
	const { user, loading } = useAuth();
	const [searchParams] = useSearchParams();

	const token = searchParams.get("token");
	const userData = searchParams.get("user");

	if (loading) {
		return <div className="loading">جاري التحميل...</div>;
	}

	// Allow access if there's a valid token in URL for student dashboard
	if (!user && token && userData) {
		return children;
	}

	if (!user) {
		return <Navigate to="/student/login" replace />;
	}

	if (!allowedTypes.includes(user.type)) {
		return <Navigate to="/" replace />;
	}

	return children;
};

// Main App Component
const AppContent = () => {
	return (
		<Router future={{ v7_relativeSplatPath: true }}>
			<div className="app" dir="rtl">
				<Navbar />
				<main className="main-content">
					<Routes>
						<Route path="/" element={<Home />} />
						<Route path="/student/login" element={<StudentLogin />} />
						<Route path="/student/auto-login" element={<StudentAutoLogin />} />
						<Route path="/admin/login" element={<AdminLogin />} />
						<Route
							path="/student/dashboard"
							element={
								<ProtectedRoute allowedTypes={["student"]}>
									<StudentDashboard />
								</ProtectedRoute>
							}
						/>
						<Route
							path="/test/:testId"
							element={
								<ProtectedRoute allowedTypes={["student"]}>
									<TestTaking />
								</ProtectedRoute>
							}
						/>
						<Route
							path="/test/:testId/result"
							element={
								<ProtectedRoute allowedTypes={["student"]}>
									<TestResult />
								</ProtectedRoute>
							}
						/>
						<Route
							path="/admin/dashboard"
							element={
								<ProtectedRoute allowedTypes={["admin"]}>
									<AdminDashboard />
								</ProtectedRoute>
							}
						>
							<Route index element={<DashboardHomePage />} />
							<Route path="students" element={<StudentManagement />} />
							<Route path="tests" element={<TestManagement />} />
						</Route>
						<Route path="*" element={<Navigate to="/" replace />} />
					</Routes>
				</main>
				<Footer />
			</div>
		</Router>
	);
};

// Root App Component with Auth Provider
function App() {
	return (
		<AuthProvider>
			<AppContent />
		</AuthProvider>
	);
}

export default App;
