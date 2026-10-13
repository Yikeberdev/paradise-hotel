import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';

const Footer = () => {
  const [email, setEmail] = useState('');
  const handleSubscribe = (e) => {
    e.preventDefault();
    if (!email.trim()) return toast.error('Enter your email');
    toast.success('Subscribed — thank you!');
    setEmail('');
  };

  return (
    <footer className="site-footer" style={{ background: '#1a1a2e', color: '#eee', marginTop: 40 }}>
      
      <div style={{ textAlign: 'center', padding: '12px 0', opacity: 0.85, borderTop: '1px solid #333' }}>
        © {new Date().getFullYear()} Paradise Hotel · Debre Markos, Ethiopia
      </div>
    </footer>
  );
};

export default Footer;
