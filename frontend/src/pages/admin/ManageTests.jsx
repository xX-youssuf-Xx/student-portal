import React, { useState, useEffect } from 'react';
import { Button, Card, Container, Row, Col, Spinner, Alert } from 'react-bootstrap';
import { FaPlus, FaEdit, FaTrash, FaEye } from 'react-icons/fa';
import axios from 'axios';
import CreateTestModal from '../../components/admin/CreateTestModal';

const ManageTests = () => {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    fetchTests();
  }, []);

  const fetchTests = async () => {
    try {
      setLoading(true);
      // Replace with your actual API endpoint
      // const response = await axios.get('/api/tests');
      // setTests(response.data);
      
      // Mock data for demonstration
      setTimeout(() => {
        setTests([
          {
            id: '1',
            title: 'Math Test - Chapter 1',
            description: 'Basic arithmetic operations',
            duration: 45,
            imageCount: 5,
            createdAt: '2025-08-30T10:00:00Z',
            status: 'draft'
          },
          {
            id: '2',
            title: 'Science Quiz',
            description: 'General science questions',
            duration: 30,
            imageCount: 3,
            createdAt: '2025-08-29T14:30:00Z',
            status: 'published'
          }
        ]);
        setLoading(false);
      }, 500);
    } catch (err) {
      console.error('Error fetching tests:', err);
      setError('Failed to load tests. Please try again later.');
      setLoading(false);
    }
  };

  const handleTestCreated = (newTest) => {
    setTests(prev => [newTest, ...prev]);
  };

  const handleDeleteTest = async (testId) => {
    if (window.confirm('Are you sure you want to delete this test? This action cannot be undone.')) {
      try {
        // Replace with your actual API endpoint
        // await axios.delete(`/api/tests/${testId}`);
        setTests(prev => prev.filter(test => test.id !== testId));
      } catch (err) {
        console.error('Error deleting test:', err);
        alert('Failed to delete test. Please try again.');
      }
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Container className="py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1>Manage Tests</h1>
        <Button 
          variant="primary" 
          onClick={() => setShowCreateModal(true)}
          className="d-flex align-items-center gap-2"
        >
          <FaPlus /> Create New Test
        </Button>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {loading ? (
        <div className="text-center py-5">
          <Spinner animation="border" role="status">
            <span className="visually-hidden">Loading...</span>
          </Spinner>
          <p className="mt-2">Loading tests...</p>
        </div>
      ) : tests.length === 0 ? (
        <Card className="text-center py-5">
          <Card.Body>
            <h5>No tests found</h5>
            <p className="text-muted">Create your first test by clicking the button above</p>
          </Card.Body>
        </Card>
      ) : (
        <Row xs={1} md={2} lg={3} className="g-4">
          {tests.map((test) => (
            <Col key={test.id}>
              <Card className="h-100">
                <Card.Img 
                  variant="top" 
                  src={`https://via.placeholder.com/300x150?text=${encodeURIComponent(test.title)}`} 
                  alt={test.title}
                  style={{ height: '150px', objectFit: 'cover' }}
                />
                <Card.Body className="d-flex flex-column">
                  <div className="d-flex justify-content-between align-items-start mb-2">
                    <Card.Title className="mb-1">{test.title}</Card.Title>
                    <span className={`badge bg-${test.status === 'published' ? 'success' : 'secondary'}`}>
                      {test.status}
                    </span>
                  </div>
                  <Card.Text className="text-muted small mb-3">
                    {test.description || 'No description provided'}
                  </Card.Text>
                  <div className="mt-auto">
                    <div className="d-flex justify-content-between text-muted small mb-3">
                      <span>{test.imageCount} {test.imageCount === 1 ? 'image' : 'images'}</span>
                      <span>{test.duration} min</span>
                    </div>
                    <div className="d-flex justify-content-between">
                      <Button variant="outline-primary" size="sm" className="me-2">
                        <FaEye className="me-1" /> View
                      </Button>
                      <Button variant="outline-secondary" size="sm" className="me-2">
                        <FaEdit className="me-1" /> Edit
                      </Button>
                      <Button 
                        variant="outline-danger" 
                        size="sm"
                        onClick={() => handleDeleteTest(test.id)}
                      >
                        <FaTrash className="me-1" />
                      </Button>
                    </div>
                  </div>
                </Card.Body>
                <Card.Footer className="text-muted small">
                  Created: {formatDate(test.createdAt)}
                </Card.Footer>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <CreateTestModal
        show={showCreateModal}
        onHide={() => setShowCreateModal(false)}
        onTestCreated={handleTestCreated}
      />
    </Container>
  );
};

export default ManageTests;
