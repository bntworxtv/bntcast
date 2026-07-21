import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Radio, Play, Square, Upload, Music, Users, List, Settings, Globe, Copy, ExternalLink } from 'lucide-react';
import { api } from '../lib/api';
import { useWebSocket } from '../lib/useWebSocket';
import toast from 'react-hot-toast';

interface Station { id: string; name: string; shortcode: string; listenPort: number; enabled: boolean; genre: string; bitrate: number; samplerate: number; channels: number; codec: string; streamMount: string; description?: string; sourcePassword: string; _count: { media: number; listeners: number }; playlists: any[]; }
interface Media { id: string; title: string; artist?: string; filename: string; filesize: number; createdAt: string; }
interface Listener { ip: string; userAgent: string; connected: boolean; duration: number; }

export default function StationPage() {
  const { id } = useParams();
  const [station, setStation] = useState<Station | null>(null);
  const [media, setMedia] = useState<Media[]>([]);
  const [listeners, setListeners] = useState<Listener[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'media' | 'playlists' | 'listeners' | 'settings'>('overview');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [streamStatus, setStreamStatus] = useState<any>(null);
  const [nowPlaying, setNowPlaying] = useState<any>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [sData, mData, lData] = await Promise.all([
        api.stations.get(id),
        api.media.list(id),
        api.listeners.live(id).catch(() => ({ listeners: [] }))
      ]);
      setStation(sData.station);
      setMedia(mData.media);
      setListeners(lData.listeners || []);
      setStreamStatus(sData.status);
      try {
        const np = await api.stream.nowPlaying(sData.station.shortcode);
        setNowPlaying(np.nowPlaying);
      } catch {}
    } catch (err: any) {
      toast.error(err.message);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useWebSocket(id || null, useCallback((event, data) => {
    if (event === 'station:started' || event === 'station:stopped') load();
    if (event === 'song:changed') setNowPlaying(data);
  }, [load]));

  const toggleStation = async () => {
    if (!station) return;
    try {
      if (station.enabled) {
        await api.stations.stop(station.id);
        toast.success('Station stopped');
      } else {
        await api.stations.start(station.id);
        toast.success('Station started');
      }
      load();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || !id) return;
    setUploading(true);
    try {
      const result = await api.media.upload(id, Array.from(files));
      toast.success(`Uploaded ${result.count} file(s)`);
      load();
    } catch (err: any) { toast.error(err.message); } finally { setUploading(false); }
  };

  const copyStreamUrl = () => {
    if (station) {
      navigator.clipboard.writeText(`http://localhost:${station.listenPort}/stream`);
      toast.success('Stream URL copied!');
    }
  };

  const deleteMedia = async (mediaId: string) => {
    if (!id) return;
    try {
      await api.media.delete(id, mediaId);
      toast.success('Deleted');
      setMedia(prev => prev.filter(m => m.id !== mediaId));
    } catch (err: any) { toast.error(err.message); }
  };

  if (!station) {
    return <div className="flex items-center justify-center h-full"><div className="w-10 h-10 border-4 border-bnt-500 border-t-transparent rounded-full animate-spin"></div></div>;
  }

  const streamUrl = `http://localhost:${station.listenPort}/stream`;

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Radio },
    { id: 'media', label: 'Media', icon: Music },
    { id: 'listeners', label: 'Listeners', icon: Users },
    { id: 'settings', label: 'Settings', icon: Settings }
  ] as const;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <Link to="/" className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-6">
        <ArrowLeft size={18} /> Back to Dashboard
      </Link>

      <div className="card mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${station.enabled ? 'bg-emerald-500/20' : 'bg-gray-700/50'}`}>
              <Radio size={28} className={station.enabled ? 'text-emerald-400' : 'text-gray-500'} />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold">{station.name}</h1>
                {station.enabled ? <span className="badge-green">LIVE</span> : <span className="badge-red">OFFLINE</span>}
              </div>
              <p className="text-gray-400 mt-1">{station.genre} &middot; {station.bitrate}kbps &middot; {station.samplerate}Hz &middot; Port {station.listenPort}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={copyStreamUrl} className="btn-secondary text-sm flex items-center gap-2" title="Copy stream URL">
              <Copy size={14} /> Stream URL
            </button>
            <a href={streamUrl} target="_blank" rel="noopener" className="btn-secondary text-sm flex items-center gap-2">
              <ExternalLink size={14} /> Listen
            </a>
            <button onClick={toggleStation} className={station.enabled ? 'btn-danger flex items-center gap-2' : 'btn-success flex items-center gap-2'}>
              {station.enabled ? <><Square size={16} /> Stop</> : <><Play size={16} /> Start</>}
            </button>
          </div>
        </div>

        {station.enabled && nowPlaying && (
          <div className="mt-4 p-4 bg-gray-800/50 rounded-xl border border-gray-700/50">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Now Playing</p>
            <p className="text-lg font-semibold">{nowPlaying.title || 'Unknown'}</p>
            {nowPlaying.artist && <p className="text-gray-400">{nowPlaying.artist}</p>}
          </div>
        )}
      </div>

      <div className="flex gap-1 mb-6 bg-gray-900 rounded-xl p-1 border border-gray-800">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.id ? 'bg-bnt-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
            <tab.icon size={16} /> {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="stat-card"><div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center"><Users size={22} className="text-emerald-400" /></div><div><p className="text-2xl font-bold">{listeners.length}</p><p className="text-sm text-gray-400">Live Listeners</p></div></div>
          <div className="stat-card"><div className="w-12 h-12 bg-bnt-500/20 rounded-xl flex items-center justify-center"><Music size={22} className="text-bnt-400" /></div><div><p className="text-2xl font-bold">{station._count.media}</p><p className="text-sm text-gray-400">Media Files</p></div></div>
          <div className="stat-card"><div className="w-12 h-12 bg-amber-500/20 rounded-xl flex items-center justify-center"><Globe size={22} className="text-amber-400" /></div><div><p className="text-2xl font-bold">{station.listenPort}</p><p className="text-sm text-gray-400">Port</p></div></div>
          <div className="stat-card"><div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center"><Radio size={22} className="text-purple-400" /></div><div><p className="text-2xl font-bold">{station.bitrate}k</p><p className="text-sm text-gray-400">Bitrate</p></div></div>
        </div>
      )}

      {activeTab === 'media' && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold">Media Library ({media.length} files)</h3>
            <label className={`btn-primary text-sm cursor-pointer flex items-center gap-2 ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
              <Upload size={16} /> Upload Files
              <input type="file" multiple accept="audio/*" className="hidden" onChange={e => handleUpload(e.target.files)} disabled={uploading} />
            </label>
          </div>
          <div className={`border-2 border-dashed rounded-xl p-8 text-center mb-6 transition-colors ${dragOver ? 'border-bnt-500 bg-bnt-500/10' : 'border-gray-700'}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); handleUpload(e.dataTransfer.files); }}>
            <Upload size={40} className="text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400">Drag & drop audio files here or <label className="text-bnt-400 cursor-pointer hover:underline">browse</label></p>
            <p className="text-xs text-gray-500 mt-2">MP3, OGG, WAV, AAC, FLAC, M4A, OPUS up to 100MB</p>
          </div>
          {media.length > 0 ? (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-800"><th className="text-left py-3 px-4 text-gray-400 font-medium">Title</th><th className="text-left py-3 px-4 text-gray-400 font-medium">Artist</th><th className="text-left py-3 px-4 text-gray-400 font-medium">File</th><th className="text-left py-3 px-4 text-gray-400 font-medium">Size</th><th className="text-right py-3 px-4 text-gray-400 font-medium">Actions</th></tr></thead>
                <tbody>{media.map(m => (
                  <tr key={m.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="py-3 px-4">{m.title}</td>
                    <td className="py-3 px-4 text-gray-400">{m.artist || '-'}</td>
                    <td className="py-3 px-4 text-gray-500 font-mono text-xs">{m.filename}</td>
                    <td className="py-3 px-4 text-gray-400">{(m.filesize / 1024 / 1024).toFixed(1)} MB</td>
                    <td className="py-3 px-4 text-right"><button onClick={() => deleteMedia(m.id)} className="text-red-400 hover:text-red-300 text-xs">Delete</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <p className="text-gray-500 text-center py-8">No media files. Upload some music!</p>}
        </div>
      )}

      {activeTab === 'listeners' && (
        <div>
          <h3 className="font-semibold mb-4">Live Listeners ({listeners.length})</h3>
          {listeners.length > 0 ? (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-800"><th className="text-left py-3 px-4 text-gray-400 font-medium">IP Address</th><th className="text-left py-3 px-4 text-gray-400 font-medium">User Agent</th><th className="text-left py-3 px-4 text-gray-400 font-medium">Duration</th></tr></thead>
                <tbody>{listeners.map((l, i) => (
                  <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="py-3 px-4 font-mono">{l.ip}</td>
                    <td className="py-3 px-4 text-gray-400 truncate max-w-xs">{l.userAgent || 'Unknown'}</td>
                    <td className="py-3 px-4 text-gray-400">{Math.floor(l.duration / 60)}m {l.duration % 60}s</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <p className="text-gray-500 text-center py-8">No active listeners</p>}
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="card space-y-6">
          <h3 className="font-semibold">Station Settings</h3>
          <div className="grid grid-cols-2 gap-6">
            <div><label className="block text-sm text-gray-400 mb-1">Station Name</label><p className="font-medium">{station.name}</p></div>
            <div><label className="block text-sm text-gray-400 mb-1">Shortcode</label><p className="font-medium font-mono">{station.shortcode}</p></div>
            <div><label className="block text-sm text-gray-400 mb-1">Stream URL</label><p className="font-medium font-mono text-sm break-all">{streamUrl}</p></div>
            <div><label className="block text-sm text-gray-400 mb-1">Port</label><p className="font-medium">{station.listenPort}</p></div>
            <div><label className="block text-sm text-gray-400 mb-1">Source Password</label><p className="font-medium font-mono text-sm">{station.sourcePassword}</p></div>
            <div><label className="block text-sm text-gray-400 mb-1">Codec</label><p className="font-medium">{station.codec.toUpperCase()}</p></div>
            <div><label className="block text-sm text-gray-400 mb-1">Bitrate</label><p className="font-medium">{station.bitrate} kbps</p></div>
            <div><label className="block text-sm text-gray-400 mb-1">Sample Rate</label><p className="font-medium">{station.samplerate} Hz</p></div>
          </div>
          <div className="pt-4 border-t border-gray-800">
            <p className="text-sm text-gray-400 mb-2">Stream with any compatible client (OBS, Mixxx, etc.):</p>
            <code className="block bg-gray-800 rounded-lg p-3 text-sm font-mono text-bnt-400">
              URL: {streamUrl}<br />
              Password: {station.sourcePassword}
            </code>
          </div>
        </div>
      )}
    </div>
  );
}
