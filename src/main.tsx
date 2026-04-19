import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// Register service worker and log status
const updateSW = registerSW({
  onNeedRefresh() {
    if (confirm('새로운 버전의 앱이 있습니다. 업데이트하시겠습니까?')) {
      updateSW(true);
    }
  },
  onOfflineReady() {
    console.log('PWA: 앱이 오프라인에서 사용할 준비가 되었습니다.');
  },
  onRegistered(r) {
    console.log('PWA: 서비스 워커가 정상적으로 등록되었습니다:', r);
  },
  onRegisterError(error) {
    console.error('PWA: 서비스 워커 등록 실패:', error);
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
