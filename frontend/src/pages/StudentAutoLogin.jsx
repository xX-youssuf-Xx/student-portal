import axios from "axios";
import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

const StudentAutoLogin = () => {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();

	useEffect(() => {
		const token = searchParams.get("token");
		const userData = searchParams.get("user");

		if (token && userData) {
			localStorage.removeItem("token");
			localStorage.removeItem("user");
			delete axios.defaults.headers.common["Authorization"];

			try {
				const parsedUser = JSON.parse(decodeURIComponent(userData));
				localStorage.setItem("token", token);
				localStorage.setItem("user", JSON.stringify(parsedUser));
				axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
			} catch (e) {
				console.error("Error parsing token data:", e);
			}
		}

		navigate("/student/dashboard", { replace: true });
	}, [searchParams, navigate]);

	return (
		<div className="loading" style={{ textAlign: "center", padding: "50px" }}>
			جاري تسجيل الدخول...
		</div>
	);
};

export default StudentAutoLogin;
