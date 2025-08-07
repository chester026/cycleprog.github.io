import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { apiFetch } from '../utils/api';
import './LoginPage.css';
import bannerImg from '../assets/img/banner_bg.png';

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('verifying'); // 'verifying', 'success', 'error'
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const verifyEmail = async () => {
      const token = searchParams.get('token');
      
      if (!token) {
        setStatus('error');
        setMessage('Invalid verification link');
        setLoading(false);
        return;
      }

      try {
        const response = await apiFetch(`/api/verify-email?token=${token}`);
        setStatus('success');
        setMessage('Email verified successfully! You can now log in.');
      } catch (error) {
        setStatus('error');
        setMessage('Network error. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    verifyEmail();
  }, [searchParams]);

  const handleLogin = () => {
    navigate('/login');
  };

  return (
    <div className="login-root">
      <div className="login-container">
        {/* Left column with image */}
        <div className="login-image" style={{ backgroundImage: `url(${bannerImg})` }}>
          <div className="login-image-text">
            <h1 className="login-image-title">BIKELAB <span className="login-app-span">.app</span></h1>
          </div>
        </div>
        {/* Right column with content */}
        <div className="login-form-block">
          <div className="login-form">
            <h2 className="register-title">Email Verification</h2>
            
            {loading ? (
              <div >
                <div style={{ fontSize: '1.2em', marginBottom: '1em' }}>Verifying your email...</div>
                <div className="loading-spinner"></div>
              </div>
            ) : status === 'success' ? (
              <div >
                <div style={{ fontSize: '1.2em', color: '#388e3c', marginBottom: '1em' }}>
                  ✓ {message}
                </div>
                <button 
                  onClick={handleLogin}
                  className="accent-btn" 
                  style={{ width: '100%', marginTop: '1em' }}
                >
                  Go to Login
                </button>
              </div>
            ) : (
              <div >
                <div style={{ fontSize: '1.2em', color: '#d32f2f', marginBottom: '1em' }}>
                  ✗ {message}
                </div>
                <button 
                  onClick={handleLogin}
                  className="accent-btn" 
                  style={{ width: '100%', marginTop: '1em' }}
                >
                  Go to Login
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 