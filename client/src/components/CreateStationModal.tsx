import { useState } from 'react';
import { X, Radio } from 'lucide-react';
import { api } from '../lib/api';
import toast from 'react-hot-toast';

export default function CreateStationModal({ onClose, onCreate }: { onClose: () => void; onCreate: () => void }) {
  const [name, setName] = useState('');
  const [shortcode, setShortcode] = useState('');
  const [description, setDescription] = useState('');
  const [genre, setGenre] = useState('Various');
  const [bitrate, setBitrate] = useState(128);
  const [engine, setEngine] = useState('shoutcast');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.stations.create({
        name, shortcode, description, genre, bitrate,
        streamEngine: engine
      });
      toast.success(`Station "${name}" created!`);
      onCreate();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="card w-full max-w-lg">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-bnt-500/20 rounded-xl flex items-center justify-center">
              <Radio size={20} className="text-bnt-400" />
            </div>
            <h2 className="text-xl font-semibold">New Station</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Station Name *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="input-field" placeholder="My Radio Station" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Shortcode *</label>
              <input type="text" value={shortcode} onChange={e => setShortcode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} className="input-field" placeholder="mystation" required />
              <p className="text-xs text-gray-500 mt-1">Unique URL identifier</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Genre</label>
              <input type="text" value={genre} onChange={e => setGenre(e.target.value)} className="input-field" placeholder="Rock, Pop, etc." />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} className="input-field" rows={2} placeholder="About this station..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Streaming Engine *</label>
              <select value={engine} onChange={e => setEngine(e.target.value)} className="input-field">
                <option value="shoutcast">SHOUTcast v2</option>
                <option value="icecast">Icecast 2</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Bitrate</label>
              <select value={bitrate} onChange={e => setBitrate(parseInt(e.target.value))} className="input-field">
                <option value={64}>64 kbps</option>
                <option value={96}>96 kbps</option>
                <option value={128}>128 kbps</option>
                <option value={192}>192 kbps</option>
                <option value={256}>256 kbps</option>
                <option value={320}>320 kbps</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2">
              {loading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              Create Station
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
