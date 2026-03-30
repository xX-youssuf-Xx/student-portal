import axios from "axios";
import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import "../styles/PdfImageViewer.css";

// Number of pages to preload before and after current page
const PRELOAD_PAGES = 1;

const PdfImageViewer = ({ testId }) => {
	const [pages, setPages] = useState([]);
	const [currentPage, setCurrentPage] = useState(1);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
	const [isZoomed, setIsZoomed] = useState(false);
	const [retryCount, setRetryCount] = useState(0);
	const MAX_RETRIES = 10;
	const containerRef = React.useRef(null);
	const imageRef = React.useRef(null);
	const retryTimeoutRef = React.useRef(null);

	// Preload images for better performance
	const preloadImages = useCallback(
		(pageNumber) => {
			if (!pages.length) return;

			const start = Math.max(1, pageNumber - PRELOAD_PAGES);
			const end = Math.min(pages.length, pageNumber + PRELOAD_PAGES);

			for (let i = start; i <= end; i++) {
				const page = pages[i - 1];
				if (!page.loaded && !page.loading) {
					// Mark as loading
					setPages((prev) =>
						prev.map((p) => (p.number === i ? { ...p, loading: true } : p)),
					);

					const img = new Image();
					img.src = page.url;
					img.onload = () => {
						setPages((prev) =>
							prev.map((p) =>
								p.number === i ? { ...p, loaded: true, loading: false } : p,
							),
						);
					};
					img.onerror = () => {
						console.error(`Failed to load page ${i}`);
						setPages((prev) =>
							prev.map((p) =>
								p.number === i ? { ...p, error: true, loading: false } : p,
							),
						);
					};
				}
			}
		},
		[pages],
	);

	// Handle page change
	const handlePageChange = (newPage) => {
		if (newPage < 1 || newPage > pages.length) return;

		setCurrentPage(newPage);
		preloadImages(newPage);

		// Scroll to top of container
		if (containerRef.current) {
			containerRef.current.scrollTo({ top: 0, behavior: "smooth" });
		}
	};

	// Go to specific page
	const goToPage = (pageNumber) => {
		handlePageChange(pageNumber);
	};

	// Handle zoom toggle
	const toggleZoom = () => {
		setIsZoomed(!isZoomed);
	};

	// Memoize preloadImages to prevent unnecessary re-renders
	const memoizedPreloadImages = useCallback(
		(pageNumber) => {
			if (!pages.length) return;

			const start = Math.max(1, pageNumber - PRELOAD_PAGES);
			const end = Math.min(pages.length, pageNumber + PRELOAD_PAGES);

			for (let i = start; i <= end; i++) {
				const page = pages[i - 1];
				if (!page.loaded && !page.loading) {
					setPages((prev) =>
						prev.map((p) => (p.number === i ? { ...p, loading: true } : p)),
					);

					const img = new Image();
					img.src = page.url;
					img.onload = () => {
						setPages((prev) =>
							prev.map((p) =>
								p.number === i ? { ...p, loaded: true, loading: false } : p,
							),
						);
					};
					img.onerror = () => {
						console.error(`Failed to load page ${i}`);
						setPages((prev) =>
							prev.map((p) =>
								p.number === i ? { ...p, error: true, loading: false } : p,
							),
						);
					};
				}
			}
		},
		[pages],
	);

	// Fetch page count with retry logic
	useEffect(() => {
		let isMounted = true;
		const retryTimer = null;
		const currentRetry = 0;
		const MAX_RETRIES = 5;
		const RETRY_DELAY = 2000; // 2 seconds

		const fetchPageCount = async () => {
			if (!testId) return;

			try {
				setLoading(true);
				setError(null);

				const response = await axios.get(`/api/tests/${testId}/pages/count`, {
					timeout: 10000, // 10 second timeout
					headers: {
						"Cache-Control": "no-cache",
						Pragma: "no-cache",
					},
				});

				if (!isMounted) return;

				const { pageCount } = response.data;
				if (pageCount > 0) {
					const newPages = Array.from({ length: pageCount }, (_, i) => ({
						number: i + 1,
						url: `/api/tests/${testId}/pages/${i + 1}?t=${Date.now()}`,
						loaded: false,
						loading: false,
						error: false,
					}));

					setPages(newPages);
					setRetryCount(0);

					// Preload first page
					if (newPages.length > 0) {
						memoizedPreloadImages(1);
					}
				} else {
					setError("لا توجد صفحات متاحة لهذا الاختبار");
				}
			} catch (err) {
				console.error("Error fetching page count:", err);
				if (!isMounted) return;

				if (retryCount < MAX_RETRIES - 1) {
					timeoutId = setTimeout(() => {
						fetchPageCount(true);
					}, 1000);
				} else {
					setError("فشل تحميل صفحات الاختبار. يرجى المحاولة مرة أخرى.");
				}
			} finally {
				if (isMounted) {
					setLoading(false);
				}
			}
		};

		if (testId) {
			fetchPageCount();
		}

		return () => {
			isMounted = false;
			if (timeoutId) {
				clearTimeout(timeoutId);
			}
		};
	}, [testId, retryCount, memoizedPreloadImages]);

	// Handle window resize with debounce
	useEffect(() => {
		let timeoutId = null;

		const updateDimensions = () => {
			if (containerRef.current) {
				const { width } = containerRef.current.getBoundingClientRect();
				const maxWidth = Math.min(width - 40, 1000); // Max width with padding
				setDimensions({
					width: maxWidth,
					height: maxWidth * 1.414, // A4 aspect ratio
				});
			}
		};

		const handleResize = () => {
			if (timeoutId) {
				clearTimeout(timeoutId);
			}
			timeoutId = setTimeout(updateDimensions, 100);
		};

		updateDimensions();
		window.addEventListener("resize", handleResize);

		return () => {
			if (timeoutId) {
				clearTimeout(timeoutId);
			}
			window.removeEventListener("resize", handleResize);
		};
	}, []);

	// Update dimensions when container ref changes
	useEffect(() => {
		if (containerRef.current) {
			const { width } = containerRef.current.getBoundingClientRect();
			const maxWidth = Math.min(width - 40, 1000);
			setDimensions({
				width: maxWidth,
				height: maxWidth * 1.414,
			});
		}
	}, [containerRef.current]);

	if (loading) {
		return (
			<div className="pdf-viewer-loading">
				<div className="spinner"></div>
				<p>جاري تحميل الاختبار...</p>
				{retryCount > 0 && (
					<div style={{ marginTop: "10px", fontSize: "0.9em" }}>
						المحاولة {retryCount + 1} من {MAX_RETRIES}
					</div>
				)}
			</div>
		);
	}

	if (error) {
		return (
			<div className="pdf-viewer-error">
				<div className="error-icon">!</div>
				<p>{error}</p>
				<button
					className="retry-button"
					onClick={() => {
						if (retryCount < MAX_RETRIES) {
							fetchPageCount(true);
						} else {
							// Reset and try again
							setRetryCount(0);
							fetchPageCount();
						}
					}}
				>
					{retryCount < MAX_RETRIES
						? "إعادة المحاولة"
						: "إعادة المحاولة من جديد"}
				</button>
			</div>
		);
	}

	if (pages.length === 0) {
		return (
			<div className="pdf-viewer-empty">
				<div className="empty-icon">📄</div>
				<p>لا توجد صفحات متاحة للعرض</p>
			</div>
		);
	}

	const currentPageData = pages[currentPage - 1];
	const isFirstPage = currentPage === 1;
	const isLastPage = currentPage === pages.length;
	const hasPrevious = currentPage > 1;
	const hasNext = currentPage < pages.length;

	return (
		<div className="pdf-viewer-container" ref={containerRef}>
			<div className="pdf-navigation">
				<div className="navigation-group">
					<button
						className={`nav-button prev ${isFirstPage ? "disabled" : ""}`}
						onClick={() => handlePageChange(currentPage - 1)}
						disabled={isFirstPage}
						aria-label="الصفحة السابقة"
					>
						<span className="nav-arrow">❮</span>
						<span className="nav-text">السابق</span>
					</button>

					<div className="page-indicator">
						<span className="current-page">{currentPage}</span>
						<span className="separator">/</span>
						<span className="total-pages">{pages.length}</span>
					</div>

					<button
						className={`nav-button next ${isLastPage ? "disabled" : ""}`}
						onClick={() => handlePageChange(currentPage + 1)}
						disabled={isLastPage}
						aria-label="الصفحة التالية"
					>
						<span className="nav-text">التالي</span>
						<span className="nav-arrow">❯</span>
					</button>
				</div>

				<div className="zoom-controls">
					<button
						className={`zoom-button ${isZoomed ? "zoomed" : ""}`}
						onClick={toggleZoom}
						aria-label={isZoomed ? "تصغير" : "تكبير"}
						title={isZoomed ? "تصغير" : "تكبير"}
					>
						{isZoomed ? "⊖" : "⊕"}
					</button>
				</div>
			</div>

			<div
				className={`pdf-page-container ${isZoomed ? "zoomed" : ""}`}
				style={{
					height: isZoomed ? "auto" : `${dimensions.height}px`,
					maxHeight: isZoomed ? "none" : "calc(100vh - 200px)",
				}}
			>
				{pages.map((page) => (
					<div
						key={page.number}
						className={`pdf-page ${currentPage === page.number ? "active" : ""}`}
						style={{
							display: currentPage === page.number ? "block" : "none",
							width: "100%",
							height: isZoomed ? "auto" : "100%",
							position: "relative",
							margin: "0 auto",
							maxWidth: isZoomed ? "100%" : "100%",
						}}
						onLoad={() => {
							setPages((prev) =>
								prev.map((page, idx) =>
									idx === currentPage - 1 ? { ...page, loaded: true } : page,
								),
							);
						}}
						onError={() => {
							setPages((prev) =>
								prev.map((page, idx) =>
									idx === currentPage - 1 ? { ...page, error: true } : page,
								),
							);
						}}
					/>
				))}
				{!currentPageData.loaded && !currentPageData.error && (
					<div className="page-loading">
						<div className="spinner small"></div>
						<p>Loading page {currentPage}...</p>
					</div>
				)}
			</div>

			<div className="pdf-navigation bottom">
				<div className="page-selector">
					<label htmlFor="page-select">Go to page:</label>
					<select
						id="page-select"
						value={currentPage}
						onChange={(e) => goToPage(parseInt(e.target.value))}
						className="page-select"
					>
						{pages.map((_, index) => (
							<option key={index + 1} value={index + 1}>
								{index + 1}
							</option>
						))}
					</select>
				</div>
			</div>
		</div>
	);
};

export default PdfImageViewer;
