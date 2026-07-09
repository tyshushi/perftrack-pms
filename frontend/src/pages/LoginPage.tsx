import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useAuthStore } from '../store/auth';
const C = {
  bg:           '#ffffff',
  bgSecondary:  '#f7f7f5',
  bgTertiary:   '#efefec',
  bgInfo:       '#e0f2fe',
  bgWarning:    '#fef9c3',
  text:         '#1a1a1a',
  textSecond:   '#6b6b6b',
  textTertiary: '#9a9a9a',
  textInfo:     '#0369a1',
  textDanger:   '#b91c1c',
  border:       '#dcdcd6',
  borderLight:  '#ececea',
  font:         '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
};

export default function LoginPage() {
  const { login, user, isLoading, error } = useAuthStore();
  const navigate = useNavigate();
  const { register, handleSubmit } = useForm<{ email: string; password: string }>();

  useEffect(() => { 
  if (user) {
    navigate('/kpis', { replace: true });
  }
}, [user]);

  async function onSubmit(data: { email: string; password: string }) {
    await login(data.email, data.password);
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

        <h1 style={{ fontSize:18, fontWeight:500, marginBottom:4 }}>Sign in</h1>
        <p style={{ fontSize:13, color:'#888', marginBottom:20 }}>Enter your work email and password</p>

        {error && <div style={{ background:'#fee2e2', color:'#991b1b', padding:'8px 12px', borderRadius:8, fontFamily:"'Inter', sans-serif", fontWeight:300, fontSize:12, marginBottom:14 }}>{error}</div>}

        <form onSubmit={handleSubmit(onSubmit)}>
          <div style={{ marginBottom:12 }}>
            <label style={{ fontFamily:"'Inter', sans-serif", fontWeight:300, fontSize:11, letterSpacing:'0.06em', textTransform:'uppercase', color:'#9a9a9a', display:'block', marginBottom:5 }}>Email</label>
            <input style={S.input} type="email" {...register('email', { required:true })} placeholder="you@company.com" autoFocus />
          </div>
          <div style={{ marginBottom:20 }}>
            <label style={{ fontFamily:"'Inter', sans-serif", fontWeight:300, fontSize:11, letterSpacing:'0.06em', textTransform:'uppercase', color:'#9a9a9a', display:'block', marginBottom:5 }}>Password</label>
            <input style={S.input} type="password" {...register('password', { required:true })} placeholder="••••••••" />
          </div>
          <button type="submit" disabled={isLoading} style={{ width:'100%', padding:'10px', border:'none', borderRadius:8, background:'#1a1a18', color:'#fff', fontFamily:"'Inter', sans-serif", fontWeight:600, fontSize:13, letterSpacing:'0.04em', textTransform:'uppercase', cursor:'pointer', opacity: isLoading ? 0.7 : 1 }}>
            {isLoading ? 'Signing in...' : 'Sign in →'}
          </button>
        </form>

        <div style={{ textAlign:'center', marginTop:16 }}>
          <span
            onClick={() => navigate('/forgot-password')}
            style={{ fontFamily:"'Inter', sans-serif", fontWeight:300, fontSize:12, color:'#6b6b6b', cursor:'pointer' }}
          >
            Forgot password?
          </span>
        </div>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  input: { width:'100%', padding:'9px 12px', border:'0.5px solid #d0d0cc', borderRadius:8, fontFamily:"'Inter', sans-serif", fontWeight:300, fontSize:14, background:'#fff', color:'#1a1a18', outline:'none' },
};
