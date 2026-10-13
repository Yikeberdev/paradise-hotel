import React, { useState, useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
import api from '../../api';
import toast from 'react-hot-toast';

const Feedback = () => {
    const { user } = useContext(AuthContext);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        feedback: '',
        rating: 5,
        jobTitle: '',
    });

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (formData.feedback.length < 5) {
            toast.error('Please provide more detailed feedback (at least 5 characters)');
            return;
        }

        setLoading(true);
        try {
            await api.post('/comments', formData);
            toast.success('Thank you for your feedback! It has been submitted for review.');
            setFormData({ feedback: '', rating: 5, jobTitle: '' });
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to submit feedback');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="inside">
            <div className="page-header">
                <h1>Leave a Comment</h1>
                <p>We value your feedback. Let us know about your experience at Paradise Hotel</p>
            </div>

            <div className="feedback-container">
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Rating</label>
                        <div className="rating-stars">
                            {[5,4,3,2,1].map(r => (
                                <label key={r} className={r <= formData.rating ? 'active' : ''}>
                                    <input type="radio" name="rating" value={r} checked={formData.rating === r} onChange={handleChange} />
                                    ★
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Job Title (Optional)</label>
                        <input type="text" name="jobTitle" value={formData.jobTitle} onChange={handleChange} placeholder="e.g., Business Traveler, Tourist" />
                    </div>

                    <div className="form-group">
                        <label>Your Feedback</label>
                        <textarea name="feedback" value={formData.feedback} onChange={handleChange} placeholder="Share your experience with us..." rows="6" required />
                    </div>

                    <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
                        {loading ? 'Submitting...' : 'Submit Feedback'}
                    </button>
                </form>

                {!user && (
                    <div className="login-note">
                        <p>💡 <a href="/login">Login</a> or <a href="/register">Register</a> to have your feedback linked to your account.</p>
                    </div>
                )}
            </div>

            <style>{`
                .page-header { text-align: center; padding: 20px 0 30px; }
                .page-header h1 { font-size: 32px; color: #1a1a2e; }
                .page-header p { color: #666; }
                .feedback-container { max-width: 600px; margin: 0 auto; background: #fff; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.08); }
                .rating-stars { display: flex; gap: 5px; flex-direction: row-reverse; justify-content: flex-end; }
                .rating-stars label { font-size: 32px; color: #ddd; cursor: pointer; transition: color 0.3s; }
                .rating-stars label:hover, .rating-stars label:hover ~ label, .rating-stars label.active { color: #f0a500; }
                .rating-stars input { display: none; }
                .feedback-container .form-group { margin-bottom: 20px; }
                .feedback-container .form-group label { display: block; font-weight: 500; margin-bottom: 5px; color: #333; }
                .feedback-container .form-group input, .feedback-container .form-group textarea { width: 100%; padding: 10px 15px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; }
                .feedback-container .form-group textarea { resize: vertical; min-height: 120px; }
                .feedback-container .form-group input:focus, .feedback-container .form-group textarea:focus { border-color: #f0a500; outline: none; }
                .login-note { margin-top: 20px; padding: 15px; background: #d1ecf1; border-radius: 6px; text-align: center; color: #0c5460; }
                .login-note a { color: #0c5460; font-weight: 600; }
                .btn { display: inline-block; padding: 12px 25px; border: none; border-radius: 6px; cursor: pointer; font-size: 16px; font-weight: 500; transition: all 0.3s; text-decoration: none; text-align: center; }
                .btn-primary { background: #f0a500; color: #1a1a2e; }
                .btn-primary:hover { background: #d49400; transform: translateY(-2px); }
                .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
                .btn-block { width: 100%; display: block; }
            `}</style>
        </div>
    );
};

export default Feedback;