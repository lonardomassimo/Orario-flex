// =========================================================================
// Cronoflex Cloud Multi-Utente (Firebase Authentication + Cloud Firestore)
// Ogni utente accede con Google oppure Email/Password (per chi non ha Gmail)
// e sincronizza automaticamente in privato i propri dati su tutti i device.
// =========================================================================
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signInWithCredential,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  onSnapshot
} from 'https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyA-e7PSA6UaU-JWQwLP-ajCXRgVo0nEUgk',
  authDomain: 'cronoflex-orario-flex.firebaseapp.com',
  projectId: 'cronoflex-orario-flex',
  storageBucket: 'cronoflex-orario-flex.firebasestorage.app',
  messagingSenderId: '758581490274',
  appId: '1:758581490274:web:dd839d3b528fbda0f0d73b'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

const CLIENT_WRITER_ID = 'w_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
const CLOUD_VER = '4.57';

let currentUser = null;
let unsubscribeSnapshot = null;
let syncDebounceTimer = null;
let cloudEmailMode = 'login';
let readyResolved = false;
let readyResolve = null;
let cloudHydrated = false;
let lastAppliedCloudMs = 0;
let lastKnownRecordCount = 0;

const readyPromise = new Promise(resolve => {
  readyResolve = () => {
    if (!readyResolved) {
      readyResolved = true;
      resolve(true);
    }
  };
});

// Fallback di sicurezza se offline o inizializzazione Auth ritarda
setTimeout(() => readyResolve(), 6000);

const el = id => document.getElementById(id);
const showToast = msg => {
  if (typeof window.toast === 'function') window.toast(msg);
};

function getStateObj() {
  return typeof window.__cfGetState === 'function' ? window.__cfGetState() : {};
}

function hasLocalUserData() {
  const s = getStateObj() || {};
  return (
    (Array.isArray(s.t) && s.t.length > 0) ||
    (Array.isArray(s.g) && s.g.length > 0) ||
    (Array.isArray(s.ev) && s.ev.length > 0) ||
    (Array.isArray(s.todo) && s.todo.length > 0) ||
    (Array.isArray(s.rep) && s.rep.length > 0) ||
    (Array.isArray(s.chiusure) && s.chiusure.length > 0) ||
    (Array.isArray(s.favAtt) && s.favAtt.length > 0) ||
    (s.att && Object.keys(s.att).length > 0) ||
    !!s.pz ||
    !!s.prm
  );
}

function countRecords(s) {
  if (!s) return 0;
  return (Array.isArray(s.t) ? s.t.length : 0) +
    (Array.isArray(s.g) ? s.g.length : 0) +
    (s.att ? Object.keys(s.att).length : 0);
}

function getLocalUpdatedMs() {
  return lastAppliedCloudMs;
}

function setLocalUpdatedMs(ms) {
  lastAppliedCloudMs = Number(ms) || 0;
}

function nowTimeStr() {
  return new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function traduciErroreFirebase(err) {
  const code = err && err.code ? err.code : '';
  switch (code) {
    case 'auth/unauthorized-domain':
      return `Dominio non ancora autorizzato (${window.location.hostname}). Aggiungilo in Firebase Console → Authentication → Impostazioni → Domini autorizzati.`;
    case 'auth/popup-blocked':
      return 'Popup bloccato dal browser: riprova oppure consenti i popup per questo sito.';
    case 'auth/popup-closed-by-user':
      return 'Accesso annullato prima di completare la selezione dell’account.';
    case 'auth/invalid-email':
      return 'Indirizzo email non valido.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Email o password non corretti.';
    case 'auth/email-already-in-use':
      return 'Questa email è già registrata: passa alla scheda "Accedi con Email".';
    case 'auth/weak-password':
      return 'La password deve avere almeno 6 caratteri.';
    case 'auth/too-many-requests':
      return 'Troppi tentativi ravvicinati: attendi qualche minuto e riprova.';
    case 'auth/network-request-failed':
      return 'Connessione Internet assente: i dati risiedono solo su Cloud Firebase, riprova quando torni online.';
    case 'permission-denied':
      return 'Permesso negato dal Cloud: verifica di aver effettuato l’accesso con il tuo account.';
    default:
      return (err && err.message) ? err.message : 'Errore imprevisto durante la connessione al Cloud.';
  }
}

function setAuthErrorMsg(msg = '') {
  const box = el('cloudAuthErr');
  if (!box) return;
  if (msg) {
    box.textContent = msg;
    box.style.display = 'block';
  } else {
    box.textContent = '';
    box.style.display = 'none';
  }
}

function aggiornaUIStatoSync() {
  const dot = el('cloudSyncDot');
  const boxOut = el('cloudBoxLoggedOut');
  const boxIn = el('cloudBoxLoggedIn');
  const lastSync = localStorage.getItem('cf_last_cloud_sync');

  if (currentUser) {
    if (dot) {
      dot.style.display = 'block';
      dot.style.background = '#107c41';
    }
    if (boxOut) boxOut.style.display = 'none';
    if (boxIn) boxIn.style.display = 'block';
    const emailEl = el('cloudUserEmail');
    if (emailEl) {
      emailEl.textContent = currentUser.email || currentUser.displayName || 'Account collegato';
    }
    const titleEl = el('syncStatusTitle');
    if (titleEl) titleEl.textContent = 'Sincronizzazione Cloud attiva ✓';
    const subEl = el('syncStatusSub');
    if (subEl) subEl.textContent = lastSync ? `Ultimo sync: ${lastSync}` : 'Sincronizzato in tempo reale';
  } else {
    if (dot) dot.style.display = 'none';
    if (boxOut) boxOut.style.display = 'block';
    if (boxIn) boxIn.style.display = 'none';
    const subEl = el('syncStatusSub');
    if (subEl) subEl.textContent = 'Non collegato — accedi al Cloud Firebase';
  }
}

function apriModalSyncCloud() {
  setAuthErrorMsg('');
  aggiornaUIStatoSync();
  if (typeof window.__cfOpenModal === 'function') window.__cfOpenModal('modalSyncCloud');
  else if (el('modalSyncCloud')) el('modalSyncCloud').classList.add('active');
}

function cloudSwitchEmailTab(mode) {
  cloudEmailMode = mode === 'register' ? 'register' : 'login';
  setAuthErrorMsg('');
  const tabLogin = el('tabCloudLogin');
  const tabReg = el('tabCloudRegister');
  const btnSub = el('btnCloudEmailSubmit');
  const btnReset = el('btnCloudResetPwd');
  if (tabLogin) tabLogin.classList.toggle('on', cloudEmailMode === 'login');
  if (tabReg) tabReg.classList.toggle('on', cloudEmailMode === 'register');
  if (btnSub) btnSub.textContent = cloudEmailMode === 'register' ? '✨ Crea account gratuito' : '🔐 Accedi con Email';
  if (btnReset) btnReset.style.display = cloudEmailMode === 'login' ? 'inline-block' : 'none';
}

async function cloudLoginGoogle() {
  setAuthErrorMsg('');
  try {
    await signInWithPopup(auth, googleProvider);
    showToast('Accesso Google completato! Sincronizzazione attiva ✓');
  } catch (err) {
    const code = err && err.code ? err.code : '';
    const isStandalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
    if (code === 'auth/popup-blocked' || (isStandalone && code === 'auth/popup-closed-by-user')) {
      try {
        await signInWithRedirect(auth, googleProvider);
        return;
      } catch (redirErr) {
        setAuthErrorMsg(traduciErroreFirebase(redirErr));
        return;
      }
    }
    setAuthErrorMsg(traduciErroreFirebase(err));
  }
}

async function loginWithGoogleIdToken(idToken) {
  setAuthErrorMsg('');
  try {
    const cred = GoogleAuthProvider.credential(idToken);
    await signInWithCredential(auth, cred);
    showToast('Accesso Google completato! Sincronizzazione attiva ✓');
    return true;
  } catch (err) {
    setAuthErrorMsg(traduciErroreFirebase(err));
    return false;
  }
}

async function cloudSubmitEmailForm(ev) {
  if (ev && ev.preventDefault) ev.preventDefault();
  setAuthErrorMsg('');
  const email = (el('cloudEmailInput') ? el('cloudEmailInput').value : '').trim();
  const pwd = el('cloudPassInput') ? el('cloudPassInput').value : '';
  if (!email) return setAuthErrorMsg('Inserisci la tua email.');
  if (!pwd || pwd.length < 6) return setAuthErrorMsg('Inserisci una password di almeno 6 caratteri.');

  try {
    if (cloudEmailMode === 'register') {
      await createUserWithEmailAndPassword(auth, email, pwd);
      showToast('Account creato! Sincronizzazione Cloud attiva ✓');
    } else {
      await signInWithEmailAndPassword(auth, email, pwd);
      showToast('Accesso eseguito! Sincronizzazione Cloud attiva ✓');
    }
    if (el('cloudPassInput')) el('cloudPassInput').value = '';
  } catch (err) {
    setAuthErrorMsg(traduciErroreFirebase(err));
  }
}

async function cloudResetPassword() {
  setAuthErrorMsg('');
  const email = (el('cloudEmailInput') ? el('cloudEmailInput').value : '').trim();
  if (!email) return setAuthErrorMsg('Scrivi prima la tua email nel campo sopra per ricevere il link di ripristino.');
  try {
    await sendPasswordResetEmail(auth, email);
    showToast('Email di ripristino password inviata! Controlla la casella di posta (anche Spam).');
  } catch (err) {
    setAuthErrorMsg(traduciErroreFirebase(err));
  }
}

async function cloudLogout() {
  if (!currentUser) return;
  const cancellaLocale = confirm(
    'Vuoi disconnettere questo account?\n\n' +
    '• Premi OK per disconnettere e rimuovere anche i dati dal browser di questo dispositivo (consigliato su PC condivisi).\n' +
    '• Oppure Annulla per annullare la disconnessione.'
  );
  if (!cancellaLocale) return;

  if (unsubscribeSnapshot) {
    unsubscribeSnapshot();
    unsubscribeSnapshot = null;
  }
  clearTimeout(syncDebounceTimer);
  syncDebounceTimer = null;

  await signOut(auth);
  localStorage.removeItem('cf_cloud_last_uid');
  localStorage.removeItem('cf_last_cloud_sync');
  if (typeof window.__cfResetLocalState === 'function') {
    window.__cfResetLocalState();
  }
  aggiornaUIStatoSync();
  showToast('Account scollegato e dati locali puliti.');
}

async function syncInviaDatiCloud(silenzioso = false) {
  if (!currentUser) {
    if (!silenzioso) {
      apriModalSyncCloud();
      showToast('Accedi con Google o Email per salvare sul Cloud.');
    }
    return false;
  }
  if (!cloudHydrated) {
    if (!silenzioso) showToast('Attendi il caricamento iniziale dal Cloud prima di salvare.');
    return false;
  }
  try {
    const stateObj = getStateObj();
    const newCount = countRecords(stateObj);
    if (lastKnownRecordCount > 30 && newCount < Math.floor(lastKnownRecordCount * 0.5) && !window.__cfAllowShrinkWrite) {
      console.warn(`Protezione Cloud: blocco invio riduttivo (${newCount} vs ${lastKnownRecordCount} record).`);
      showToast('Protezione Cloud attiva: ripristino lo stato aggiornato dal Cloud.');
      await syncScaricaDatiCloud(false);
      return false;
    }

    const nowMs = Math.max(Date.now(), getLocalUpdatedMs() || Date.now());
    const stateJson = JSON.stringify(stateObj);
    if (stateJson.length > 940000) {
      if (!silenzioso) alert('Attenzione: archivio troppo grande per un singolo documento Cloud.');
      return false;
    }

    const docRef = doc(db, 'users', currentUser.uid, 'sync', 'state');
    await setDoc(docRef, {
      updatedAt: new Date(nowMs).toISOString(),
      updatedAtMs: nowMs,
      writerId: CLIENT_WRITER_ID,
      deviceInfo: (navigator.userAgent || 'browser').slice(0, 120),
      version: CLOUD_VER,
      stateJson
    });

    window.__cfAllowShrinkWrite = false;
    setLocalUpdatedMs(nowMs);
    lastKnownRecordCount = newCount;
    localStorage.setItem('cf_last_cloud_sync', nowTimeStr());
    aggiornaUIStatoSync();
    if (!silenzioso) showToast('Dati salvati sul tuo Cloud privato! ✓');
    return true;
  } catch (err) {
    console.warn('Errore salvataggio Cloud Firestore:', err);
    if (!silenzioso) showToast(traduciErroreFirebase(err));
    return false;
  }
}

// Unisce lo stato cloud "seme" (solo attività importate) ai dati locali senza mai sovrascrivere timbrature/giustificativi
function mergeSeedRemote(remoteState) {
  const sLoc = JSON.parse(JSON.stringify(getStateObj()));
  sLoc.att = sLoc.att || {};
  sLoc.exportedAttDays = sLoc.exportedAttDays || {};
  Object.keys(remoteState.att || {}).forEach(iso => {
    if (!Array.isArray(sLoc.att[iso]) || sLoc.att[iso].length === 0) {
      sLoc.att[iso] = remoteState.att[iso];
      sLoc.exportedAttDays[iso] = true;
    }
  });
  delete sLoc._initialAttSeed;
  return sLoc;
}

async function syncScaricaDatiCloud(chiediConferma = false) {
  if (!currentUser) {
    if (chiediConferma) apriModalSyncCloud();
    return false;
  }
  try {
    if (!chiediConferma && syncDebounceTimer) return false;
    const docRef = doc(db, 'users', currentUser.uid, 'sync', 'state');
    const snap = await getDoc(docRef);

    if (!snap.exists()) {
      cloudHydrated = true;
      if (hasLocalUserData()) {
        await syncInviaDatiCloud(true);
        if (chiediConferma) showToast('Dati caricati per la prima volta nel tuo Cloud! ✓');
      } else if (chiediConferma) {
        showToast('Nessun dato presente ancora sul Cloud per questo account.');
      }
      return true;
    }

    const data = snap.data();
    if (!data || !data.stateJson) {
      cloudHydrated = true;
      return false;
    }
    const remoteState = JSON.parse(data.stateJson);
    const remoteMs = Number(data.updatedAtMs) || 0;

    if (remoteState && remoteState._initialAttSeed === true) {
      if (hasLocalUserData()) {
        const merged = mergeSeedRemote(remoteState);
        cloudHydrated = true;
        if (typeof window.__cfApplyCloudState === 'function') window.__cfApplyCloudState(merged, Date.now());
        await syncInviaDatiCloud(true);
        localStorage.setItem('cf_last_cloud_sync', nowTimeStr());
        aggiornaUIStatoSync();
        if (chiediConferma) showToast('Attività importate dal Cloud e unite ai tuoi dati! ✓');
        return true;
      }
      delete remoteState._initialAttSeed;
    }

    if (chiediConferma) {
      const sLoc = getStateObj();
      const locCount = (sLoc.t ? sLoc.t.length : 0) + (sLoc.g ? sLoc.g.length : 0);
      const remCount = (remoteState.t ? remoteState.t.length : 0) + (remoteState.g ? remoteState.g.length : 0);
      if (locCount > 0 && remCount !== locCount) {
        if (!confirm(`Trovate ${remCount} registrazioni nel Cloud (attuali nella vista: ${locCount}). Vuoi scaricarle e applicarle?`)) {
          return false;
        }
      }
    }

    // Cloud vince sempre: applica integralmente lo stato Firestore
    if (typeof window.__cfApplyCloudState === 'function') {
      window.__cfApplyCloudState(remoteState, remoteMs || Date.now());
    }
    setLocalUpdatedMs(remoteMs || Date.now());
    lastKnownRecordCount = countRecords(remoteState);
    cloudHydrated = true;
    localStorage.setItem('cf_last_cloud_sync', nowTimeStr());
    aggiornaUIStatoSync();
    if (chiediConferma) showToast('Dati sincronizzati dal Cloud! ✓');
    return true;
  } catch (err) {
    console.warn('Errore download Cloud Firestore:', err);
    if (chiediConferma) showToast(traduciErroreFirebase(err));
    return false;
  }
}

function syncForzaSubito() {
  if (!currentUser) return apriModalSyncCloud();
  return syncScaricaDatiCloud(true);
}

function triggerAutoSyncCloud() {
  if (!currentUser) {
    showToast('Accedi al Cloud Firebase per salvare le modifiche.');
    return;
  }
  if (!cloudHydrated) {
    showToast('Attendi il caricamento iniziale dal Cloud prima di salvare.');
    return;
  }
  clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(() => {
    syncDebounceTimer = null;
    syncInviaDatiCloud(true);
  }, 1500);
}

function attivaListenerRealtime(user) {
  if (unsubscribeSnapshot) {
    unsubscribeSnapshot();
    unsubscribeSnapshot = null;
  }
  const docRef = doc(db, 'users', user.uid, 'sync', 'state');
  unsubscribeSnapshot = onSnapshot(docRef, snap => {
    if (!snap.exists() || snap.metadata.hasPendingWrites) return;
    const data = snap.data();
    if (!data || !data.stateJson || data.writerId === CLIENT_WRITER_ID) return;
    if (data.stateJson.indexOf('"_initialAttSeed":true') !== -1) return;
    const remoteMs = Number(data.updatedAtMs) || 0;
    if (remoteMs >= lastAppliedCloudMs) {
      try {
        const remoteState = JSON.parse(data.stateJson);
        if (typeof window.__cfApplyCloudState === 'function') {
          window.__cfApplyCloudState(remoteState, remoteMs);
        }
        setLocalUpdatedMs(remoteMs);
        lastKnownRecordCount = countRecords(remoteState);
        cloudHydrated = true;
        localStorage.setItem('cf_last_cloud_sync', nowTimeStr());
        aggiornaUIStatoSync();
      } catch (e) {
        console.warn('Errore parsing snapshot Cloud:', e);
      }
    }
  }, err => {
    console.warn('Listener real-time Firestore interrotto:', err);
  });
}

// Gestisce eventuale ritorno da redirect OAuth su mobile
getRedirectResult(auth).catch(err => {
  if (err && err.code) setAuthErrorMsg(traduciErroreFirebase(err));
});

onAuthStateChanged(auth, async user => {
  if (unsubscribeSnapshot) {
    unsubscribeSnapshot();
    unsubscribeSnapshot = null;
  }

  if (!user) {
    currentUser = null;
    cloudHydrated = false;
    lastAppliedCloudMs = 0;
    lastKnownRecordCount = 0;
    if (typeof window.__cfResetLocalState === 'function') {
      window.__cfResetLocalState();
    }
    aggiornaUIStatoSync();
    readyResolve();
    return;
  }

  currentUser = user;
  cloudHydrated = false;
  lastAppliedCloudMs = 0;
  lastKnownRecordCount = 0;
  if (typeof window.__cfResetLocalState === 'function') {
    window.__cfResetLocalState();
  }
  localStorage.setItem('cf_cloud_last_uid', user.uid);

  await syncScaricaDatiCloud(false);
  attivaListenerRealtime(user);
  aggiornaUIStatoSync();
  readyResolve();
});

// Esposizione API globale per index.html e app.js
window.apriModalSyncCloud = apriModalSyncCloud;
window.aggiornaUIStatoSync = aggiornaUIStatoSync;
window.syncInviaDatiCloud = syncInviaDatiCloud;
window.syncScaricaDatiCloud = syncScaricaDatiCloud;
window.syncForzaSubito = syncForzaSubito;
window.triggerAutoSyncCloud = triggerAutoSyncCloud;
window.cloudLoginGoogle = cloudLoginGoogle;
window.cloudSubmitEmailForm = cloudSubmitEmailForm;
window.cloudSwitchEmailTab = cloudSwitchEmailTab;
window.cloudResetPassword = cloudResetPassword;
window.cloudLogout = cloudLogout;
window.__cfLoginWithGoogleIdToken = loginWithGoogleIdToken;
window.CF_CLOUD = {
  readyPromise,
  isDebouncePending: () => !!syncDebounceTimer,
  getCurrentUser: () => currentUser
};
