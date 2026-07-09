import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { authApi } from '../api/client';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const { register, handleSubmit } = useForm<{ email: string }>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(data: { email: string }) {
    setError('');
    setIsLoading(true);
    try {
      await authApi.requestPasswordReset(data.email);
      setSentTo(data.email);
    } catch (e) {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#FAF9F7', fontFamily:"'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <div style={{ background:'#fff', boxShadow:'0 2px 24px rgba(0,0,0,0.07)', borderRadius:16, padding:36, width:360 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img src="/perftrack-pms/pr-mark-80.png" alt="PerformRight"
            style={{ width: 80, height: 80, borderRadius: 12, marginBottom: 16 }} />
          <div style={{ fontFamily:"'Cormorant Garamond', Georgia, serif", fontSize: 28, fontWeight: 500, color: '#1a1a1a', marginBottom: 4 }}>
            <span style={{fontStyle:'italic'}}>Perform</span><span>Right</span>
          </div>
          <div style={{ fontFamily:"'Inter', sans-serif", fontWeight: 300, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#6b6b6b' }}>by Valiram</div>
        </div>

        {sentTo ? (
          <>
            <h1 style={{ fontSize:18, fontWeight:500, marginBottom:4 }}>Check your email</h1>
            <p style={{ fontFamily:"'Inter', sans-serif", fontWeight:300, fontSize:13, color:'#6b6b6b', lineHeight:1.6, marginBottom:20 }}>
              Check your email — if <strong style={{ fontWeight:500, color:'#1a1a1a' }}>{sentTo}</strong> is registered, we've sent a reset link. Link expires in 15 minutes.
            </p>
          </>
        ) : (
          <>
            <h1 style={{ fontSize:18, fontWeight:500, marginBottom:4 }}>Reset your password</h1>
            <p style={{ fontSize:13, color:'#888', marginBottom:20 }}>Enter your work email and we'll send you a reset link.</p>

            {error && <div style={{ background:'#fee2e2', color:'#991b1b', padding:'8px 12px', borderRadius:8, fontFamily:"'Inter', sans-serif", fontWeight:300, fontSize:12, marginBottom:14 }}>{error}</div>}

            <form onSubmit={handleSubmit(onSubmit)}>
              <div style={{ marginBottom:20 }}>
                <label style={{ fontFamily:"'Inter', sans-serif", fontWeight:300, fontSize:11, letterSpacing:'0.06em', textTransform:'uppercase', color:'#9a9a9a', display:'block', marginBottom:5 }}>Email</label>
                <input style={S.input} type="email" {...register('email', { required:true })} placeholder="you@company.com" autoFocus />
              </div>
              <button type="submit" disabled={isLoading} style={{ width:'100%', padding:'10px', border:'none', borderRadius:8, background:'#1a1a18', color:'#fff', fontFamily:"'Inter', sans-serif", fontWeight:600, fontSize:13, letterSpacing:'0.04em', textTransform:'uppercase', cursor:'pointer', opacity: isLoading ? 0.7 : 1 }}>
                {isLoading ? 'Sending...' : 'Send Reset Link'}
              </button>
            </form>
          </>
        )}

        <div style={{ textAlign:'center', marginTop:16 }}>
          <span
            onClick={() => navigate('/login')}
            style={{ fontFamily:"'Inter', sans-serif", fontWeight:300, fontSize:12, color:'#6b6b6b', cursor:'pointer' }}
          >
            Back to sign in
          </span>
        </div>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  input: { width:'100%', padding:'9px 12px', border:'0.5px solid #d0d0cc', borderRadius:8, fontFamily:"'Inter', sans-serif", fontWeight:300, fontSize:14, background:'#fff', color:'#1a1a18', outline:'none' },
};
