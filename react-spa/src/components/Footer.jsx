import React from 'react';
import './Footer.css';
import FooterImg from '../assets/img/logo/bl_logo.png';


const Footer = () => {
  return (
    <footer className="footer">
      <div className="footer-content">
        
        
        <div className="footer-section">
         <img src={FooterImg} alt="Footer" />
        </div>
        <div className="footer-section copyright">
        <p>Built with React & Node.js</p>
          <b>© 2025 BikeLab</b>
          
        </div>
      
      </div>
    </footer>
  );
};

export default Footer; 