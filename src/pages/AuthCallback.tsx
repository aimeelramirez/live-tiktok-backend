import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

const AuthCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      console.error('TikTok OAuth error:', error);
      navigate('/');
      return;
    }

    if (code) {
      console.log('Received TikTok code:', code);

      // Simulate processing delay
      setTimeout(() => {
        navigate('/');
      }, 1500);
    }
  }, [searchParams, navigate]);

  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h2>Authenticating with TikTok...</h2>
      <p>Please wait while we complete your login.</p>
    </div>
  );
};

export default AuthCallback;
