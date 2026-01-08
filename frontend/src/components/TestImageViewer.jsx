import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronRight, faChevronLeft } from '@fortawesome/free-solid-svg-icons';
import './TestImageViewer.css';

const TestImageViewer = ({ testId }) => {
   const [images, setImages] = useState([]);
   const [currentIndex, setCurrentIndex] = useState(0);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState('');
 
   useEffect(() => {
     const fetchTestImages = async () => {
       try {
         setLoading(true);
        // axios.defaults.baseURL and axios.defaults.headers.common.Authorization are set by AuthContext on login
        // Fetch student-accessible test images via the images endpoint
        const response = await axios.get(`/tests/${testId}/images`);
         
        // response.data is expected to be an array of image rows
        if (Array.isArray(response.data)) {
          setImages(response.data);
        } else if (response.data && Array.isArray(response.data.images)) {
          setImages(response.data.images);
        } else {
          setImages([]);
        }
         setCurrentIndex(0);
       } catch (err) {
         console.error('Error fetching test images:', err);
         setError('فشل تحميل صور الاختبار. يرجى المحاولة مرة أخرى لاحقاً.');
       } finally {
         setLoading(false);
       }
     };

     if (testId) {
       fetchTestImages();
     }
   }, [testId]);
 
   const goToNext = () => {
     setCurrentIndex((prevIndex) => 
       prevIndex === images.length - 1 ? 0 : prevIndex + 1
     );
   };
 
   const goToPrevious = () => {
     setCurrentIndex((prevIndex) => 
       prevIndex === 0 ? images.length - 1 : prevIndex - 1
     );
   };
 
   const goToImage = (index) => {
     setCurrentIndex(index);
   };
 
   // If no images are available
   if (images.length === 0 && !loading) {
     return (
       <div className="no-images-message">
         لا توجد صور متاحة لهذا الاختبار
       </div>
     );
   }
 
   // If there's an error
   if (error) {
     return <div className="error-message">{error}</div>;
   }
 
   if (loading) {
     return (
       <div className="flex items-center justify-center h-64">
         <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
       </div>
     );
   }
 
   return (
     <div className="test-image-viewer">
       <div className="image-container">
         {images.length > 0 && (
           <img 
             src={`${import.meta.env.VITE_API_BASE_URL || "https://studentportal.elvicsolutions.net"}/` + (images[currentIndex].image_url || images[currentIndex].image_path)} 
             alt={`Test Page ${currentIndex + 1}`}
             className="test-image"
           />
         )} 
       </div>
       
       {images.length > 1 && (
         <div className="navigation-controls">
           <button 
             onClick={goToPrevious}
             className="nav-button prev-button"
             aria-label="Previous image"
           >
             <FontAwesomeIcon icon={faChevronRight} />
           </button>
           
           <div className="page-indicator">
             {currentIndex + 1} / {images.length}
           </div>
           
           <button 
             onClick={goToNext}
             className="nav-button next-button"
             aria-label="Next image"
           >
             <FontAwesomeIcon icon={faChevronLeft} />
           </button>
         </div>
       )}
     </div>
   );
 };
 
 export default TestImageViewer;
