import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Modal, Button, Form, Alert, Spinner, Row, Col } from 'react-bootstrap';
import axios from 'axios';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { arrayMoveImmutable } from 'array-move';
import { toast } from 'react-toastify';

// Constants
const GRADES = [
  { value: '1PRIM', label: 'Primary 1' },
  { value: '2PRIM', label: 'Primary 2' },
  { value: '3PRIM', label: 'Primary 3' },
  { value: '4PRIM', label: 'Primary 4' },
  { value: '5PRIM', label: 'Primary 5' },
  { value: '6PRIM', label: 'Primary 6' },
  { value: '1PREP', label: 'Preparatory 1' }, 
  { value: '2PREP', label: 'Preparatory 2' },
  { value: '3PREP', label: 'Preparatory 3' },
  { value: '1SEC', label: 'Secondary 1' },
  { value: '2SEC', label: 'Secondary 2' },
  { value: '3SEC', label: 'Secondary 3' },
];

const TEST_TYPES = [
  { value: 'BUBBLE_SHEET', label: 'Bubble Sheet' },
  { value: 'WRITTEN', label: 'Written' },
  { value: 'ORAL', label: 'Oral' },
];

// Draggable image item component
const DraggableImage = ({ id, src, index, moveImage, onRemove }) => {
  const ref = React.useRef(null);
  
  const [{ isDragging }, drag] = useDrag({
    type: 'image',
    item: () => ({ id, index }),
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const [, drop] = useDrop({
    accept: 'image',
    hover(item, monitor) {
      if (!ref.current) {
        return;
      }
      const dragIndex = item.index;
      const hoverIndex = index;

      // Don't replace items with themselves
      if (dragIndex === hoverIndex) {
        return;
      }

      // Determine rectangle on screen
      const hoverBoundingRect = ref.current?.getBoundingClientRect();
      // Get vertical middle
      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
      // Determine mouse position
      const clientOffset = monitor.getClientOffset();
      // Get pixels to the top
      const hoverClientY = clientOffset.y - hoverBoundingRect.top;

      // Only perform the move when the mouse has crossed half of the items height
      // When dragging downwards, only move when the cursor is below 50%
      // When dragging upwards, only move when the cursor is above 50%
      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) {
        return;
      }
      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) {
        return;
      }

      // Time to actually perform the action
      moveImage(dragIndex, hoverIndex);

      // Note: we're mutating the monitor item here!
      // Generally it's better to avoid mutations,
      // but it's good here for the sake of performance
      // to avoid expensive index searches.
      item.index = hoverIndex;
    },
  });

  const opacity = isDragging ? 0.4 : 1;
  drag(drop(ref));

  return (
    <div 
      ref={ref} 
      style={{ 
        opacity, 
        padding: '10px', 
        margin: '5px 0', 
        border: '1px solid #ddd', 
        borderRadius: '4px',
        display: 'flex',
        alignItems: 'center',
        backgroundColor: '#fff',
        cursor: 'move'
      }}
    >
      <div style={{ marginRight: '10px', fontWeight: 'bold' }}>{index + 1}.</div>
      <img 
        src={src} 
        alt={`Question ${index + 1}`} 
        style={{ 
          maxWidth: '100px', 
          maxHeight: '100px',
          objectFit: 'contain',
          marginRight: '10px'
        }} 
      />
      <Button 
        variant="danger" 
        size="sm" 
        onClick={() => onRemove(index)}
        style={{ marginLeft: 'auto' }}
      >
        Remove
      </Button>
    </div>
  );
};

// Main modal component
const CreateTestModal = ({ show, onHide, onTestCreated, existingTest = null }) => {
  // Preserve local wall time: extract YYYY-MM-DDTHH:mm from stored ISO (no timezone shift)
  const isoToDatetimeLocalPreserve = (iso) => {
    if (!iso) return '';
    const m = String(iso).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
    return m ? `${m[1]}T${m[2]}` : '';
  };

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    grade: '3SEC',
    test_type: 'BUBBLE_SHEET',
    duration_minutes: 0,
    start_time: '',
    end_time: '',
    view_type: 'IMMEDIATE',
    correct_answers: { answers: {} }
  });
  
  const [images, setImages] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [answers, setAnswers] = useState({});
  const fileInputRef = useRef(null);
  
  // Set default start and end times or load existing test data
  useEffect(() => {
    if (show) {
      if (existingTest) {
        // Load existing test data for editing
        setFormData({
          title: existingTest.title || '',
          description: existingTest.description || '',
          grade: existingTest.grade || '3SEC',
          test_type: existingTest.test_type || 'BUBBLE_SHEET',
          duration_minutes: existingTest.duration_minutes || 0,
          start_time: isoToDatetimeLocalPreserve(existingTest.start_time),
          end_time: isoToDatetimeLocalPreserve(existingTest.end_time),
          view_type: existingTest.view_type || 'IMMEDIATE',
          correct_answers: existingTest.correct_answers || { answers: {} }
        });
        
        // Load existing images
        if (existingTest.images) {
          setImages(existingTest.images.map(img => ({
            id: img.id || `img-${Date.now()}`,
            src: img.url,
            file: null,
            isExisting: true
          })));
        }
        
        // Load existing answers
        if (existingTest.correct_answers?.answers) {
          setAnswers(existingTest.correct_answers.answers);
        }
      } else {
        // Set default times for new test
        const now = new Date();
        const toLocalDatetime = (d) => {
          const pad = (n) => String(n).padStart(2, '0');
          const year = d.getFullYear();
          const month = pad(d.getMonth() + 1);
          const day = pad(d.getDate());
          const hours = pad(d.getHours());
          const minutes = pad(d.getMinutes());
          return `${year}-${month}-${day}T${hours}:${minutes}`;
        };
        const defaultStart = toLocalDatetime(now);
        const defaultEnd = toLocalDatetime(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000));
        
        setFormData(prev => ({
          ...prev,
          start_time: defaultStart,
          end_time: defaultEnd
        }));
      }
    } else {
      // Reset form when modal is closed
      setFormData({
        title: '',
        description: '',
        grade: '3SEC',
        test_type: 'BUBBLE_SHEET',
        duration_minutes: 0,
        start_time: '',
        end_time: '',
        view_type: 'IMMEDIATE',
        correct_answers: { answers: {} }
      });
      setImages([]);
      setAnswers({});
      setError('');
    }
  }, [show, existingTest]);

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    
    // Validate file types and size
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const invalidFiles = files.filter(file => !validTypes.includes(file.type));
    const oversizedFiles = files.filter(file => file.size > MAX_SIZE);
    
    if (invalidFiles.length > 0) {
      setError(`Invalid file type. Only JPG, PNG, and WebP images are allowed.`);
      return;
    }
    
    if (oversizedFiles.length > 0) {
      setError(`File size too large. Maximum size is 10MB.`);
      return;
    }

    if (files.length + images.length > 20) {
      setError('Maximum 20 images allowed per test.');
      return;
    }

    setIsUploading(true);
    setError('');
    
    try {
      const newImages = await Promise.all(files.map(async (file) => {
        const imageUrl = URL.createObjectURL(file);
        // Get image dimensions for validation
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = () => reject(new Error('Failed to load image'));
          img.src = imageUrl;
        });
        
        return {
          id: `${Date.now()}-${file.name}`,
          src: imageUrl,
          file,
          width: img.width,
          height: img.height,
          isExisting: false
        };
      }));
      
      setImages(prev => [...prev, ...newImages]);
      // Clear the input value so selecting the same files again will retrigger onChange
      if (e.target) {
        e.target.value = '';
      }
      
      // Initialize answers for new images if they don't exist
      const newAnswers = { ...answers };
      newImages.forEach((img, idx) => {
        const questionNum = images.length + idx + 1;
        if (!newAnswers[questionNum]) {
          newAnswers[questionNum] = 'A';
        }
      });
      setAnswers(newAnswers);
      
    } catch (err) {
      console.error('Error processing images:', err);
      setError('Error processing images. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const moveImage = useCallback((fromIndex, toIndex) => {
    setImages(prevImages => {
      const newImages = arrayMoveImmutable(prevImages, fromIndex, toIndex);
      return newImages.map((img, idx) => ({
        ...img,
        // Update the order if needed for backend
        order: idx
      }));
    });
  }, []);

  const removeImage = (index) => {
    setImages(prev => {
      const newImages = [...prev];
      // Revoke the object URL to free up memory (only for new images)
      if (!newImages[index].isExisting) {
        URL.revokeObjectURL(newImages[index].src);
      }
      newImages.splice(index, 1);
      return newImages;
    });
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleAnswerChange = (questionNum, answer) => {
    setAnswers(prev => ({
      ...prev,
      [questionNum]: answer
    }));
  };

  const validateForm = () => {
    if (!formData.title.trim()) {
      setError('Test title is required');
      return false;
    }
    
    if (images.length === 0) {
      setError('Please upload at least one question image');
      return false;
    }
    
    if (!formData.start_time || !formData.end_time) {
      setError('Please select both start and end times');
      return false;
    }
    
    if (new Date(formData.end_time) <= new Date(formData.start_time)) {
      setError('End time must be after start time');
      return false;
    }
    
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setIsSubmitting(true);
    setError('');
    
    try {
      const formDataToSend = new FormData();
      const toUtcIso = (localDatetimeStr) => {
        // Preserve local wall time as Zulu without shifting
        if (!localDatetimeStr) return localDatetimeStr;
        const base = String(localDatetimeStr).slice(0, 16);
        return `${base}:00.000Z`;
      };
      
      // Append all form data
      Object.entries(formData).forEach(([key, value]) => {
        if (key === 'correct_answers') {
          formDataToSend.append(key, JSON.stringify({
            answers: Object.fromEntries(
              Object.entries(answers).map(([q, a]) => [q, a || 'A'])
            )
          }));
        } else if (key === 'start_time' || key === 'end_time') {
          formDataToSend.append(key, toUtcIso(value));
        } else {
          formDataToSend.append(key, value);
        }
      });
      
      // Append new image files
      images.forEach((image, index) => {
        if (image.file) {
          formDataToSend.append('images', image.file);
        }
      });
      
      // Send existing images info if editing
      if (existingTest) {
        const existingImages = images.filter(img => img.isExisting).map(img => ({
          id: img.id,
          url: img.src
        }));
        if (existingImages.length > 0) {
          formDataToSend.append('existing_images', JSON.stringify(existingImages));
        }
      }
      
      // Make the API call
      const url = existingTest ? `/tests/${existingTest.id}` : '/tests';
      const method = existingTest ? 'put' : 'post';
      
      const response = await axios[method](url, formDataToSend, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      // Show success message
      toast.success(existingTest ? 'Test updated successfully!' : 'Test created successfully!');
      
      // Call the success callback with the created/updated test data
      if (onTestCreated) {
        onTestCreated(response.data.test);
      }
      
      // Reset form
      setFormData({
        title: '',
        description: '',
        grade: '3SEC',
        test_type: 'BUBBLE_SHEET',
        duration_minutes: 60,
        start_time: '',
        end_time: '',
        view_type: 'IMMEDIATE',
        correct_answers: { answers: {} }
      });
      setImages([]);
      setAnswers({});
      
      // Close the modal
      onHide();
      
    } catch (err) {
      console.error('Error saving test:', err);
      const errorMessage = err.response?.data?.message || 'Error saving test. Please try again.';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide} size="xl" centered scrollable>
      <Modal.Header closeButton>
        <Modal.Title>{existingTest ? 'Edit Test' : 'Create New Test'}</Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit}>
        <Modal.Body>
          {error && <Alert variant="danger">{error}</Alert>}
          
          <Row>
            <Col md={6}>
              <Form.Group className="mb-3">
                <Form.Label>Test Title *</Form.Label>
                <Form.Control
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  placeholder="Enter test title"
                  required
                />
              </Form.Group>
              
              <Form.Group className="mb-3">
                <Form.Label>Description</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={2}
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  placeholder="Enter test description (optional)"
                />
              </Form.Group>
              
              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Grade *</Form.Label>
                    <Form.Select
                      name="grade"
                      value={formData.grade}
                      onChange={handleInputChange}
                      required
                    >
                      {GRADES.map(grade => (
                        <option key={grade.value} value={grade.value}>
                          {grade.label}
                        </option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Test Type *</Form.Label>
                    <Form.Select
                      name="test_type"
                      value={formData.test_type}
                      onChange={handleInputChange}
                      required
                    >
                      {TEST_TYPES.map(type => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </Col>
              </Row>
              
              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Start Time *</Form.Label>
                    <Form.Control
                      type="datetime-local"
                      name="start_time"
                      value={formData.start_time}
                      onChange={handleInputChange}
                      required
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>End Time *</Form.Label>
                    <Form.Control
                      type="datetime-local"
                      name="end_time"
                      value={formData.end_time}
                      onChange={handleInputChange}
                      min={formData.start_time}
                      required
                    />
                  </Form.Group>
                </Col>
              </Row>
              
              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>Duration (minutes) *</Form.Label>
                    <Form.Control
                      type="number"
                      min="1"
                      name="duration_minutes"
                      value={formData.duration_minutes}
                      onChange={handleInputChange}
                      required
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label>View Type *</Form.Label>
                    <Form.Select
                      name="view_type"
                      value={formData.view_type}
                      onChange={handleInputChange}
                      required
                    >
                      <option value="IMMEDIATE">Immediate</option>
                      <option value="AFTER_DEADLINE">After Deadline</option>
                      <option value="MANUAL">Manual</option>
                    </Form.Select>
                  </Form.Group>
                </Col>
              </Row>
              
              <Form.Group className="mb-3">
                <Form.Label>Upload Test Images *</Form.Label>
                <Form.Control
                  type="file"
                  accept="image/jpeg, image/png, image/webp"
                  multiple
                  onChange={handleImageUpload}
                  disabled={isUploading || isSubmitting}
                  ref={fileInputRef}
                />
                <Form.Text className="text-muted">
                  Max 20 images, 10MB each. Supported: JPG, PNG, WebP
                </Form.Text>
              </Form.Group>
            </Col>
            
            <Col md={6}>
              <div className="border rounded p-3" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                <h5>Preview ({images.length} {images.length === 1 ? 'image' : 'images'})</h5>
                {images.length > 0 ? (
                  <DndProvider backend={HTML5Backend}>
                    {images.map((image, index) => (
                      <div key={image.id} className="mb-3 p-2 border rounded">
                        <DraggableImage
                          id={image.id}
                          src={image.src}
                          index={index}
                          moveImage={moveImage}
                          onRemove={removeImage}
                        />
                        {formData.test_type === 'BUBBLE_SHEET' && (
                          <div className="mt-2">
                            <Form.Label>Correct Answer for Q{index + 1}:</Form.Label>
                            <div className="d-flex gap-2">
                              {['A', 'B', 'C', 'D'].map(opt => (
                                <Form.Check
                                  key={opt}
                                  type="radio"
                                  id={`q${index}-${opt}`}
                                  name={`answer-${index}`}
                                  label={opt}
                                  checked={answers[index + 1] === opt}
                                  onChange={() => handleAnswerChange(index + 1, opt)}
                                  inline
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </DndProvider>
                ) : (
                  <div className="text-center text-muted p-4">
                    <p>No images uploaded yet.</p>
                    <p>Upload images to see the preview here.</p>
                  </div>
                )}
              </div>
            </Col>
          </Row>
          
        </Modal.Body>
        
        <Modal.Footer className="justify-content-between">
          <div>
            <Button 
              variant="outline-secondary" 
              onClick={onHide} 
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </div>
          <div>
            <Button 
              variant="primary" 
              type="submit" 
              disabled={isSubmitting || images.length === 0}
              className="ms-2"
            >
              {isSubmitting ? (
                <>
                  <Spinner
                    as="span"
                    animation="border"
                    size="sm"
                    role="status"
                    aria-hidden="true"
                    className="me-2"
                  />
                  {existingTest ? 'Updating Test...' : 'Creating Test...'}
                </>
              ) : (
                existingTest ? 'Update Test' : 'Create Test'
              )}
            </Button>
          </div>
        </Modal.Footer>
      </Form>
    </Modal>
  );
};

export default CreateTestModal;