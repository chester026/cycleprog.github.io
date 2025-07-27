import React from 'react';
import './Footer.css';
import FooterImg from '../assets/img/footer.jpg';

const Footer = () => {
  return (
    <footer className="footer">
      <div className="footer-content">
        
        
        <div className="footer-section">
         <img src={FooterImg} alt="Footer" />
        </div>
        <div className="footer-section copyright">
        <p>Built with React & Node.js</p>
          <h4>© 2025 BikeLab</h4>
          
        </div>
      </div>
    </footer>
  );
};

export default Footer; 