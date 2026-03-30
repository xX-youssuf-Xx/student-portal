import axios from "axios";
import React, { createContext, useContext, useEffect, useState } from "react";

// Set global API base URL for all axios requests
const API_BASE_URL = "https://studentportal.8bitsolutions.net/api";
axios.defaults.baseURL = API_BASE_URL;
console.log("✅ AuthContext loaded with API_BASE_URL:", API_BASE_URL);

// Add axios response interceptor to log responses
axios.interceptors.response.use(
	(response) => {
		console.log(
			"✅ API Response:",
			response.config.url,
			response.status,
			response.data,
		);
		return response;
	},
	(error) => {
		console.error(
			"❌ API Error:",
			error.config?.url,
			error.response?.status,
			error.response?.data,
		);
		console.error("Error details:", error.message);
		return Promise.reject(error);
	},
);

const AuthContext = createContext();

export const useAuth = () => {
	const context = useContext(AuthContext);
	if (!context) {
		throw new Error("useAuth must be used within an AuthProvider");
	}
	return context;
};

export const AuthProvider = ({ children }) => {
	const [user, setUser] = useState(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		// Check if user is logged in on app start
		const token = localStorage.getItem("token");
		const userData = localStorage.getItem("user");

		if (token && userData) {
			setUser(JSON.parse(userData));
			axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
		}

		setLoading(false);
	}, []);

	const login = async (phoneNumber, password, userType) => {
		try {
			const endpoint = userType === "admin" ? "/admin/login" : "/student/login";
			console.log("🔐 Attempting login to:", axios.defaults.baseURL + endpoint);
			const response = await axios.post(endpoint, {
				phone_number: phoneNumber,
				password: password,
			});

			const { token, user: userData } = response.data;

			// Store token and user data
			localStorage.setItem("token", token);
			localStorage.setItem("user", JSON.stringify(userData));

			// Set axios default header
			axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;

			// Update state
			setUser(userData);

			return { success: true, user: userData };
		} catch (error) {
			console.error("Login error:", error);
			return {
				success: false,
				message: error.response?.data?.message || "حدث خطأ في تسجيل الدخول",
			};
		}
	};

	const logout = () => {
		// Clear local storage
		localStorage.removeItem("token");
		localStorage.removeItem("user");

		// Clear axios header
		delete axios.defaults.headers.common["Authorization"];

		// Update state
		setUser(null);
	};

	const value = {
		user,
		loading,
		login,
		logout,
	};

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
