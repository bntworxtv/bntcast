import { useState } from 'react';
import { Radio, Eye, EyeOff } from 'lucide-react';
import { api } from '../lib/api';
import toast from 'react-hot-toast';
import { User } from '../App';

export default function LoginPage({ onLogin }: { onLogin: (u: User) => void }) {
  const [email, setEmail] = useState('admin@bntcast.local');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = isRegister
        ? await api.auth.register(email, password, name)
        : await api.auth.login(email, password);
      onLogin(data.user);
      toast.success(`Welcome to BNTcast, ${data.user.name}!`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-bnt-500 to-bnt-700 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-bnt-500/20">
            <Radio size={36} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold">BNTcast</h1>
          <p className="text-gray-400 mt-2">Radio Station Management</p>
        </div>

        <div className="card">
          <h2 className="text-xl font-semibold mb-6">{isRegister ? 'Create Account' : 'Sign In'}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Full Name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} className="input-field" placeholder="Your name" required />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="input-field" placeholder="admin@bntcast.local" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Password</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} className="input-field pr-10" placeholder="Enter password" required />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
              {loading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {isRegister ? 'Create Account' : 'Sign In'}
            </button>
          </form>
          <div className="mt-6 text-center">
            <button onClick={() => setIsRegister(!isRegister)} className="text-bnt-400 hover:text-bnt-300 text-sm">
              {isRegister ? 'Already have an account? Sign in' : "Don't have an account? Register"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
