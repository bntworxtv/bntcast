import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Radio, Users, Music, Server, Cpu, HardDrive, Play, Square, Upload, Download, Check, X, RefreshCw, Key, Mail, Shield } from 'lucide-react';
import { api } from '../lib/api';
import toast from 'react-hot-toast';
import CreateStationModal from '../components/CreateStationModal';

interface Station {
  id: string;
  name: string;
  shortcode: string;
  listenPort: number;
  enabled: boolean;
  genre: string;
  bitrate: number;
  _count: { media: number; listeners: number };
}

interface SystemInfo {
  counts: { stations: number; media: number; listeners: number; users: number };
  memory: { total: number; free: number; used: number };
  cpus: number;
  loadAvg: number[];
  uptime: number;
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatUptime(seconds: number) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function DashboardPage() {
  const [stations, setStations] = useState<Station[]>([]);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [shoutcastInstalled, setShoutcastInstalled] = useState<boolean | null>(null);
  const [shoutcastVersion, setShoutcastVersion] = useState('');
  const [uploadingSC, setUploadingSC] = useState(false);
  const [installingSC, setInstallingSC] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [changingPw, setChangingPw] = useState(false);
  const [emailNew, setEmailNew] = useState('');
  const [emailPw, setEmailPw] = useState('');
  const [changingEmail, setChangingEmail] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const [stationsData, systemData, scStatus] = await Promise.all([
        api.stations.list(),
        api.system.info(),
        api.system.shoutcastStatus().catch(() => ({ installed: false, version: '' }))
      ]);
      setStations(stationsData.stations);
      setSystemInfo(systemData.info);
      setShoutcastInstalled(scStatus.installed);
      setShoutcastVersion(scStatus.version);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const downloadShoutcast = async () => {
    setInstallingSC(true);
    try {
      const result = await api.system.downloadShoutcast();
      toast.success(result.message || 'SHOUTcast installed!');
      load();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setInstallingSC(false);
    }
  };

  const uploadShoutcast = async (file: File) => {
    setUploadingSC(true);
    try {
      const result = await api.system.uploadShoutcast(file);
      toast.success(result.message || 'SHOUTcast installed!');
      load();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploadingSC(false);
    }
  };

  const handleRestart = async () => {
    if (!confirm('Restart the BNTcast server? All active streams will briefly disconnect.')) return;
    setRestarting(true);
    try {
      await api.system.restart();
      toast.success('Server is restarting... page will reload in 5s');
      setTimeout(() => window.location.reload(), 5000);
    } catch {
      toast.error('Restart failed - try again');
      setRestarting(false);
    }
  };

  const handleChangePassword = async () => {
    if (!pwCurrent || !pwNew) { toast.error('Fill in all fields'); return; }
    if (pwNew !== pwConfirm) { toast.error('New passwords do not match'); return; }
    if (pwNew.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    setChangingPw(true);
    try {
      await api.auth.changePassword(pwCurrent, pwNew);
      toast.success('Password changed successfully');
      setPwCurrent(''); setPwNew(''); setPwConfirm('');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setChangingPw(false);
    }
  };

  const handleChangeEmail = async () => {
    if (!emailNew || !emailPw) { toast.error('Fill in all fields'); return; }
    setChangingEmail(true);
    try {
      await api.auth.changeEmail(emailNew, emailPw);
      toast.success('Email updated successfully');
      setEmailNew(''); setEmailPw('');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setChangingEmail(false);
    }
  };

  const toggleStation = async (station: Station) => {
    try {
      if (station.enabled) {
        await api.stations.stop(station.id);
        toast.success(`${station.name} stopped`);
      } else {
        await api.stations.start(station.id);
        toast.success(`${station.name} started`);
      }
      load();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-10 h-10 border-4 border-bnt-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-gray-400 mt-1">Manage your radio stations</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleRestart} disabled={restarting}
            className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50">
            <RefreshCw size={16} className={restarting ? 'animate-spin' : ''} />
            {restarting ? 'Restarting...' : 'Restart Server'}
          </button>
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
            <Plus size={18} /> New Station
          </button>
        </div>
      </div>

      {systemInfo && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="stat-card">
            <div className="w-12 h-12 bg-bnt-500/20 rounded-xl flex items-center justify-center">
              <Radio size={22} className="text-bnt-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{systemInfo.counts.stations}</p>
              <p className="text-sm text-gray-400">Stations</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center">
              <Users size={22} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{systemInfo.counts.listeners}</p>
              <p className="text-sm text-gray-400">Listeners</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="w-12 h-12 bg-amber-500/20 rounded-xl flex items-center justify-center">
              <Music size={22} className="text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{systemInfo.counts.media}</p>
              <p className="text-sm text-gray-400">Media Files</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center">
              <Server size={22} className="text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{formatUptime(systemInfo.uptime)}</p>
              <p className="text-sm text-gray-400">Uptime</p>
            </div>
          </div>
        </div>
      )}

      {systemInfo && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <div className="card flex items-center gap-3">
            <Cpu size={18} className="text-bnt-400" />
            <div>
              <p className="text-sm text-gray-400">CPU Load</p>
              <p className="font-medium">{systemInfo.loadAvg[0]?.toFixed(2) || '0'} ({systemInfo.cpus} cores)</p>
            </div>
          </div>
          <div className="card flex items-center gap-3">
            <HardDrive size={18} className="text-bnt-400" />
            <div>
              <p className="text-sm text-gray-400">Memory</p>
              <p className="font-medium">{formatBytes(systemInfo.memory.used)} / {formatBytes(systemInfo.memory.total)}</p>
            </div>
          </div>
          <div className="card flex items-center gap-3">
            <Users size={18} className="text-bnt-400" />
            <div>
              <p className="text-sm text-gray-400">Admin Users</p>
              <p className="font-medium">{systemInfo.counts.users}</p>
            </div>
          </div>
        </div>
      )}

      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-4">Radio Stations</h2>
        {stations.length === 0 ? (
          <div className="card text-center py-12">
            <Radio size={48} className="text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No stations yet</h3>
            <p className="text-gray-400 mb-4">Create your first radio station to get started</p>
            <button onClick={() => setShowCreate(true)} className="btn-primary inline-flex items-center gap-2">
              <Plus size={18} /> Create Station
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {stations.map(station => (
              <div key={station.id} className="card flex items-center justify-between">
                <Link to={`/station/${station.id}`} className="flex items-center gap-4 flex-1 min-w-0">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${station.enabled ? 'bg-emerald-500/20' : 'bg-gray-700/50'}`}>
                    <Radio size={22} className={station.enabled ? 'text-emerald-400' : 'text-gray-500'} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold truncate">{station.name}</h3>
                      {station.enabled ? <span className="badge-green">Live</span> : <span className="badge-red">Offline</span>}
                    </div>
                    <p className="text-sm text-gray-400 mt-0.5">
                      {station.genre} &middot; {station.bitrate}kbps &middot; Port {station.listenPort} &middot; /{station._count.media} files
                    </p>
                  </div>
                </Link>
                <div className="flex items-center gap-2 ml-4">
                  <button onClick={(e) => { e.stopPropagation(); toggleStation(station); }}
                    className={station.enabled ? 'btn-danger text-sm py-1.5 px-3' : 'btn-success text-sm py-1.5 px-3'}>
                    {station.enabled ? <Square size={14} /> : <Play size={14} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="card">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Shield size={18} className="text-bnt-400" /> Change Password
          </h3>
          <div className="space-y-3">
            <input type="password" placeholder="Current password" value={pwCurrent} onChange={e => setPwCurrent(e.target.value)}
              className="input-field w-full" />
            <input type="password" placeholder="New password" value={pwNew} onChange={e => setPwNew(e.target.value)}
              className="input-field w-full" />
            <input type="password" placeholder="Confirm new password" value={pwConfirm} onChange={e => setPwConfirm(e.target.value)}
              className="input-field w-full" />
            <button onClick={handleChangePassword} disabled={changingPw}
              className="btn-primary w-full flex items-center justify-center gap-2">
              <Key size={16} /> {changingPw ? 'Changing...' : 'Update Password'}
            </button>
          </div>
        </div>

        <div className="card">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Mail size={18} className="text-bnt-400" /> Change Email
          </h3>
          <div className="space-y-3">
            <input type="email" placeholder="New email address" value={emailNew} onChange={e => setEmailNew(e.target.value)}
              className="input-field w-full" />
            <input type="password" placeholder="Current password (for verification)" value={emailPw} onChange={e => setEmailPw(e.target.value)}
              className="input-field w-full" />
            <button onClick={handleChangeEmail} disabled={changingEmail}
              className="btn-primary w-full flex items-center justify-center gap-2">
              <Mail size={16} /> {changingEmail ? 'Updating...' : 'Update Email'}
            </button>
          </div>
        </div>
      </div>

      <div className="card mb-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Server size={18} className="text-bnt-400" /> Stream Engine
        </h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-400">SHOUTcast DNAS {shoutcastInstalled ? <span className="text-emerald-400">({shoutcastVersion || 'installed'})</span> : <span className="text-red-400">(not installed)</span>}</p>
            <p className="text-xs text-gray-500 mt-1">Required for streaming. Install automatically from Nullsoft or upload manually.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={downloadShoutcast} disabled={installingSC}
              className="btn-primary text-sm flex items-center gap-2">
              {installingSC ? <><RefreshCw size={14} className="animate-spin" /> Downloading...</> : <><Download size={14} /> Install</>}
            </button>
            <input ref={fileRef} type="file" accept=".zip,.tar.gz,.tgz" className="hidden"
              onChange={e => { if (e.target.files?.[0]) uploadShoutcast(e.target.files[0]); e.target.value = ''; }} />
            <button onClick={() => fileRef.current?.click()} disabled={uploadingSC}
              className="bg-gray-700 hover:bg-gray-600 text-white text-sm py-2 px-4 rounded-lg flex items-center gap-2 disabled:opacity-50">
              {uploadingSC ? <><RefreshCw size={14} className="animate-spin" /> Uploading...</> : <><Upload size={14} /> Upload</>}
            </button>
          </div>
        </div>
      </div>

      {showCreate && <CreateStationModal onClose={() => setShowCreate(false)} onCreate={() => { setShowCreate(false); load(); }} />}
    </div>
  );
}
