import { useState, useEffect, useRef } from 'react';
import { ModelManager, ModelCategory } from '@runanywhere/web';

export default function ModelDownloader() {
  const [isLoaded, setIsLoaded]   = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress]   = useState(0);
  const [error, setError]         = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const isLoadingRef = useRef(false);

  useEffect(() => {
    tryLoadFromCache();
    const iv = setInterval(() => {
      if (!isLoadingRef.current && ModelManager.getLoadedModel(ModelCategory.Language)) setIsLoaded(true);
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  const tryLoadFromCache = async () => {
    try {
      if (ModelManager.getLoadedModel(ModelCategory.Language)) { setIsLoaded(true); return; }
      setStatusMsg('Checking cache...');
      try { await ModelManager.loadModel('lfm2-350m-q4_k_m'); } catch { setStatusMsg(''); return; }
      await new Promise(r => setTimeout(r, 600));
      if (ModelManager.getLoadedModel(ModelCategory.Language)) { setIsLoaded(true); }
      else { setStatusMsg(''); }
    } catch { setStatusMsg(''); }
  };

  const waitForModel = async (): Promise<boolean> => {
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 1000));
      if (ModelManager.getLoadedModel(ModelCategory.Language)) return true;
      setStatusMsg(`Verifying... ${i + 1}s`);
    }
    return false;
  };

  const download = async () => {
    setIsLoading(true); isLoadingRef.current = true;
    setError(''); setProgress(0); setStatusMsg('Starting...');
    try {
await ModelManager.downloadModel('lfm2-350m-q4_k_m', (pct: number) => {
  setProgress(pct); setStatusMsg(`Downloading ${pct}%`);
});
      setProgress(95); setStatusMsg('Loading into memory...');
      await ModelManager.loadModel('lfm2-350m-q4_k_m');
      setProgress(98); setStatusMsg('Verifying...');
      let model = ModelManager.getLoadedModel(ModelCategory.Language);
      if (!model) { const ok = await waitForModel(); model = ok ? ModelManager.getLoadedModel(ModelCategory.Language) : null; }
      if (model) { setProgress(100); setIsLoaded(true); setStatusMsg('Ready!'); }
      else throw new Error('Model verification failed. Please refresh and try again.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setProgress(0); setStatusMsg('');
    } finally {
      setIsLoading(false); isLoadingRef.current = false;
    }
  };

  if (isLoaded) return (
    <div style={{
      padding: '12px 16px',
      background: 'rgba(16,185,129,0.07)',
      border: '1px solid rgba(16,185,129,0.18)',
      borderRadius: '12px',
      display: 'flex', alignItems: 'center', gap: '12px',
    }}>
      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981', boxShadow: '0 0 8px #10B981', flexShrink: 0, animation: 'pulse-dot 2s ease-in-out infinite' }} />
      <div>
        <div style={{ fontWeight: 600, fontSize: '13px', color: '#10B981' }}>MODEL READY</div>
        <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '1px' }}>On-device AI · LFM2 350M · CPU mode</div>
      </div>
      <style>{`@keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );

  if (isLoading) return (
    <div style={{ padding: '16px', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
        <span style={{ fontSize: '12px', color: '#3B82F6', fontWeight: 600, letterSpacing: '0.06em' }}>
          {progress < 95 ? 'DOWNLOADING MODEL' : 'LOADING INTO MEMORY'}
        </span>
        <span style={{ fontSize: '12px', color: '#3B82F6', fontWeight: 600 }}>{progress}%</span>
      </div>
      <div style={{ height: '4px', background: '#E5E7EB', borderRadius: '99px', overflow: 'hidden', marginBottom: '10px' }}>
        <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg, #3B82F6, #10B981)', borderRadius: '99px', transition: 'width 0.3s ease' }} />
      </div>
      <div style={{ fontSize: '11px', color: '#9CA3AF' }}>{statusMsg}</div>
      {progress < 95 && <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '6px' }}>⚡ Keep this tab open and active</div>}
    </div>
  );

  return (
    <div style={{ padding: '16px', background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#92400E', marginBottom: '3px' }}>
            AI Model Required
          </div>
          <div style={{ fontSize: '12px', color: '#9CA3AF' }}>250 MB · Downloads once · Cached locally forever</div>
        </div>
        <button onClick={download} className="btn" style={{ flexShrink: 0, padding: '9px 18px', fontSize: '13px' }}>
          ↓ Download Model
        </button>
      </div>
      {error && (
        <div style={{ marginTop: '12px', padding: '10px 14px', background: 'rgba(239,68,68,0.08)', borderRadius: '8px', fontSize: '12px', color: '#EF4444' }}>
          {error}
        </div>
      )}
      {statusMsg && <div style={{ marginTop: '8px', fontSize: '12px', color: '#9CA3AF' }}>{statusMsg}</div>}
    </div>
  );
}