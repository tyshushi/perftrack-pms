import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useAuthStore } from '../store/auth';

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
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f5f5f3', fontFamily:'system-ui,sans-serif' }}>
      <div style={{ background:'#fff', border:'0.5px solid #e5e4df', borderRadius:16, padding:36, width:360 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:28 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:'#1a1a18', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:600 }}>PMS</div>
          <div>
            <div style={{ fontWeight:600, fontSize:15 }}>PerfTrack</div>
            <div style={{ fontSize:11, color:'#888' }}>Enterprise Performance Management</div>
          </div>
        </div>

        <h1 style={{ fontSize:18, fontWeight:500, marginBottom:4 }}>Sign in</h1>
        <p style={{ fontSize:13, color:'#888', marginBottom:20 }}>Enter your work email and password</p>

        {error && <div style={{ background:'#fee2e2', color:'#991b1b', padding:'8px 12px', borderRadius:8, fontSize:13, marginBottom:14 }}>{error}</div>}

        <form onSubmit={handleSubmit(onSubmit)}>
          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:12, fontWeight:500, color:'#666', display:'block', marginBottom:5 }}>Email</label>
            <input style={S.input} type="email" {...register('email', { required:true })} placeholder="you@company.com" autoFocus />
          </div>
          <div style={{ marginBottom:20 }}>
            <label style={{ fontSize:12, fontWeight:500, color:'#666', display:'block', marginBottom:5 }}>Password</label>
            <input style={S.input} type="password" {...register('password', { required:true })} placeholder="••••••••" />
          </div>
          <button type="submit" disabled={isLoading} style={{ width:'100%', padding:'10px', border:'none', borderRadius:8, background:'#1a1a18', color:'#fff', fontSize:14, cursor:'pointer', fontFamily:'inherit', opacity: isLoading ? 0.7 : 1 }}>
            {isLoading ? 'Signing in...' : 'Sign in →'}
          </button>
        </form>

        <div style={{ marginTop:16, padding:12, background:'#f9f9f7', borderRadius:8, fontSize:12, color:'#666' }}>
          <div style={{ fontWeight:500, marginBottom:4 }}>Demo accounts</div>
          <div>staff@pms.local · manager@pms.local</div>
          <div>hod@pms.local · hradmin@pms.local</div>
          <div style={{ marginTop:2, color:'#aaa' }}>All passwords: <code>demo1234</code></div>
        </div>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  input: { width:'100%', padding:'9px 12px', border:'0.5px solid #d0d0cc', borderRadius:8, fontSize:14, background:'#fff', color:'#1a1a18', fontFamily:'inherit', outline:'none' },
};
