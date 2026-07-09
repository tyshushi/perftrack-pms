import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { authApi } from '../api/client';

type Status = 'checking' | 'invalid' | 'valid' | 'done';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const { register, handleSubmit } = useForm<{ password: string; confirm: string }>();
  const [status, setStatus] = useState<Status>('checking');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    async function verify() {
      if (!token) {
        if (active) setStatus('invalid');
        return;
      }
      try {
        const res = await authApi.verifyResetToken(token);
        if (active) setStatus(res.data?.valid ? 'valid' : 'invalid');
      } catch {
        if (active) setStatus('invalid');
      }
    }
    verify();
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    if (status === 'done') {
      const t = setTimeout(() => navigate('/login', { replace: true }), 3000);
      return () => clearTimeout(t);
    }
  }, [status]);

  async function onSubmit(data: { password: string; confirm: string }) {
    setError('');
    if (data.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (data.password !== data.confirm) {
      setError('Passwords do not match.');
      return;
    }
    setIsSubmitting(true);
    try {
      await authApi.resetPassword(token, data.password);
      setStatus('done');
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
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

        {status === 'checking' && (
          <p style={{ fontFamily:"'Inter', sans-serif", fontWeight:300, fontSize:13, color:'#6b6b6b', textAlign:'center' }}>
            Verifying your reset link…
          </p>
        )}

        {status === 'invalid' && (
          <>
            <h1 style={{ fontSize:18, fontWeight:500, marginBottom:4 }}>Link expired</h1>
            <p style={{ fontFamily:"'Inter', sans-serif", fontWeight:300, fontSize:13, color:'#6b6b6b', lineHeight:1.6, marginBottom:20 }}>
              This reset link is invalid or has expired. Please request a new one.
            </p>
            <div style={{ textAlign:'center', marginTop:16 }}>
              <span
                onClick={() => navigate('/forgot-password')}
                style={{ fontFamily:"'Inter', sans-serif", fontWeight:300, fontSize:12, color:'#6b6b6b', cursor:'pointer' }}
              >
                Request a new link
              </span>
            </div>
          </>
        )}

        {status === 'done' && (
          <>
            <h1 style={{ fontSize:18, fontWeight:500, marginBottom:4 }}>Password reset successfully</h1>
            <p style={{ fontFamily:"'Inter', sans-serif", fontWeight:300, fontSize:13, color:'#6b6b6b', lineHeight:1.6, marginBottom:20 }}>
              You can now sign in with your new password. Redirecting you to sign in…
            </p>
          </>
        )}

        {status === 'valid' && (
          <>
            <h1 style={{ fontSize:18, fontWeight:500, marginBottom:4 }}>Set a new password</h1>
            <p style={{ fontSize:13, color:'#888', marginBottom:20 }}>Choose a new password for your account.</p>

            {error && <div style={{ background:'#fee2e2', color:'#991b1b', padding:'8px 12px', borderRadius:8, fontFamily:"'Inter', sans-serif", fontWeight:300, fontSize:12, marginBottom:14 }}>{error}</div>}

            <form onSubmit={handleSubmit(onSubmit)}>
              <div style={{ marginBottom:12 }}>
                <label style={{ fontFamily:"'Inter', sans-serif", fontWeight:300, fontSize:11, letterSpacing:'0.06em', textTransform:'uppercase', color:'#9a9a9a', display:'block', marginBottom:5 }}>New Password</label>
                <input style={S.input} type="password" {...register('password', { required:true })} placeholder="••••••••" autoFocus />
              </div>
              <div style={{ marginBottom:20 }}>
                <label style={{ fontFamily:"'Inter', sans-serif", fontWeight:300, fontSize:11, letterSpacing:'0.06em', textTransform:'uppercase', color:'#9a9a9a', display:'block', marginBottom:5 }}>Confirm Password</label>
                <input style={S.input} type="password" {...register('confirm', { required:true })} placeholder="••••••••" />
              </div>
              <button type="submit" disabled={isSubmitting} style={{ width:'100%', padding:'10px', border:'none', borderRadius:8, background:'#1a1a18', color:'#fff', fontFamily:"'Inter', sans-serif", fontWeight:600, fontSize:13, letterSpacing:'0.04em', textTransform:'uppercase', cursor:'pointer', opacity: isSubmitting ? 0.7 : 1 }}>
                {isSubmitting ? 'Resetting...' : 'Reset Password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  input: { width:'100%', padding:'9px 12px', border:'0.5px solid #d0d0cc', borderRadius:8, fontFamily:"'Inter', sans-serif", fontWeight:300, fontSize:14, background:'#fff', color:'#1a1a18', outline:'none' },
};
