import React, { useState, useEffect } from 'react';

const PDFViewer = ({ pdfUrl, height = "100%", className = "" }) => {
  const [viewerType, setViewerType] = useState('primary');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const detectMobile = () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  };

  const isMobile = detectMobile();
  const encodedUrl = encodeURIComponent(pdfUrl);
  const isLocalFile = pdfUrl.startsWith('blob:') || pdfUrl.startsWith('http://localhost') || pdfUrl.startsWith(window.location.origin);

  useEffect(() => {
    // Auto-switch to Google Docs viewer on mobile after 3 seconds if not a local file
    if (isMobile && !isLocalFile) {
      const timer = setTimeout(() => {
        setViewerType('google');
        setLoading(false);
      }, 3000);
      return () => clearTimeout(timer);
    } else {
      // On desktop or local files, try PDF.js first
      const timer = setTimeout(() => {
        setLoading(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isMobile, isLocalFile]);

  const handlePdfError = () => {
    console.log('PDF viewer failed, switching fallback');
    setError(true);
    if (viewerType === 'primary') {
      setViewerType('google');
    } else if (viewerType === 'google') {
      setViewerType('office');
    }
  };

  const renderViewer = () => {
    const baseStyle = {
      border: 'none',
      userSelect: 'none',
      WebkitUserSelect: 'none',
      msUserSelect: 'none',
      MozUserSelect: 'none',
      KhtmlUserSelect: 'none',
      width: '100%',
      height: height,
      minHeight: '500px',
      backgroundColor: '#f5f5f5',
      borderRadius: '4px'
    };

    if (!pdfUrl) {
      return (
        <div style={baseStyle} className="flex items-center justify-center">
          <p>No PDF file available</p>
        </div>
      );
    }

    switch (viewerType) {
      case 'primary':
        return (
          <object
            data={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=0`}
            type="application/pdf"
            style={baseStyle}
            onError={handlePdfError}
            onLoad={() => setLoading(false)}
            aria-label="PDF Document"
          >
            <p>Your browser does not support PDFs. Please download the PDF to view it.
              <a href={pdfUrl} className="text-blue-600 hover:underline ml-2">Download PDF</a>
            </p>
          </object>
        );
      
      case 'google':
        return (
          <iframe
            src={`https://docs.google.com/viewer?url=${encodedUrl}&embedded=true`}
            style={baseStyle}
            onError={handlePdfError}
            title="PDF Viewer (Google)"
            loading="lazy"
          />
        );
      
      case 'office':
        return (
          <iframe
            src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodedUrl}`}
            style={baseStyle}
            onError={handlePdfError}
            title="PDF Viewer (Office)"
            loading="lazy"
          />
        );
      
      default:
        return (
          <div style={baseStyle} className="flex flex-col items-center justify-center p-4">
            <p className="mb-4">Unable to display PDF in this browser</p>
            <a 
              href={pdfUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Open PDF in new tab
            </a>
          </div>
        );
    }
  };

  return (
    <div className={`relative w-full h-full ${className}`}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-80 z-10">
          <div className="text-center p-4 bg-white rounded-lg shadow-md">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
            <p className="text-gray-700">Loading PDF...</p>
          </div>
        </div>
      )}
      
      {error && (
        <div className="absolute top-2 right-2 bg-yellow-100 text-yellow-800 text-xs px-3 py-1 rounded z-20">
          Using fallback viewer
        </div>
      )}
      
      <div className="w-full h-full">
        {renderViewer()}
      </div>
    </div>
  );
};

export default React.memo(PDFViewer);
