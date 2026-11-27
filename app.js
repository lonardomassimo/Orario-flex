/** Cronoflex — orario flessibile AGESP SPA · by arch. Lonardo Massimo */
const APP_VERSION = '4.68', KEY = 'cronoflex_v4';
const $ = id => document.getElementById(id), F = formatMinutesToHoursMins, T = formatMinutesToTime, P = parseTimeToMinutes;
const VUOTO = () => ({ t: [], g: [], d: {}, pz: null, ver: {}, rep: [], att: {}, ev: [], todo: [], busta: {}, chiusure: [], prm: null, gcal: null, favAtt: [], customCatDir: null, exportedAttDays: {}, notif: null });
let S = VUOTO(), undoStack = [], editIdx = null, currentDate = new Date(), rie = { y: new Date().getFullYear(), m: new Date().getMonth() + 1 };
const TIPI_DURATA = ['FERIE', 'EX-FESTIVITÀ', 'ORE RECUPERO', 'MALATTIA', 'SMART WORKING', 'ORE 4 NOVEMBRE', 'CONGEDO PARENTALE', 'DONAZIONE SANGUE', 'PERMESSO NON RETRIBUITO'];
const LIMITI = { 'EX-FESTIVITÀ': 30 * 60, 'VISITA MEDICA': 30 * 60 }, FERIE_ANNO = 168 * 60, SW_SETT = 480;
const PZ_KEY = { 'FERIE': 'ferie', 'EX-FESTIVITÀ': 'ex', 'VISITA MEDICA': 'visite', 'MALATTIA': 'malattia', 'ORE 4 NOVEMBRE': 'nov4', 'ORE RECUPERO': 'rec' };
const CATEGORIE = ['Manutenzione ordinaria AGESP', 'Manutenzione straordinaria AGESP', 'Manutenzione ordinaria Comune', 'Manutenzione straordinaria Comune'];
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const isRecupero = t => t === 'ORE RECUPERO' || t === 'ORE RECUPERO STRAORDINARI';
const svg = p => `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const IC = { pen: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>'), bin: svg('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>') };
const iso0 = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayISO = () => iso0(new Date()), D = iso => new Date(iso + 'T12:00:00'), dow = iso => D(iso).getDay(), isVen = iso => dow(iso) === 5;
const ymStr = (y, m) => `${y}-${String(m).padStart(2, '0')}`, uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const nomeMese = ym => MESI[+ym.slice(5) - 1] + ' ' + ym.slice(0, 4), cap = s => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- Persistenza, annulla ----------
function formatExcelDate(s) {
  if (!s || s.includes('-')) return s || '';
  const p = s.toLowerCase().split(' '); return p.length >= 4 ? `${p[3]}-${String(MESI.indexOf(p[2]) + 1).padStart(2, '0')}-${p[1].padStart(2, '0')}` : s;
}
function normalizzaOrariStorici() {
  if (!Array.isArray(S.t)) return;
  S.t.forEach(t => {
    if (t && typeof t.ora === 'string') {
      const s = t.ora.trim();
      if (/^\d:\d{2}$/.test(s)) t.ora = '0' + s;
    }
  });
}
function normalizzaGiustificativiStorici() {
  normalizzaOrariStorici();
  if (!Array.isArray(S.g)) return;
  S.g.forEach(g => {
    if (g.data === '2025-03-17') g.data = '2026-03-17';
    // Normalizza i giustificativi da seed con fine al minuto 10:29 (1:29 -> 1:30 fino alle 10:30)
    if (g.oraInizio === '9:00') g.oraInizio = '09:00';
    if (g.oraFine === '10:29' && g.durata === '1:29') {
      g.oraFine = '10:30';
      g.durata = '1:30';
    }
    if (g.tuttaGiornata === undefined && !g.oraInizio && !g.oraFine && g.durata && g.data) {
      const dov = isVen(g.data) ? 360 : 480;
      if (P(g.durata) >= dov && g.tipo !== 'PAUSA NON TIMBRATA' && g.tipo !== 'STRAORDINARIO PAUSA') {
        g.tuttaGiornata = true;
      }
    }
  });
}
function pulisciCacheLocaleDati() {
  try {
    ['cronoflex_v4', 'orario_flex_timbrature', 'orario_flex_giustificativi', 'orario_flex_destinazioni', 'orario_flex_puntozero', 'cf_local_updated_ms']
      .forEach(k => localStorage.removeItem(k));
  } catch (e) {}
}
function load() {
  // Modalità Cloud-Only: i dati risiedono esclusivamente su Firebase Cloud, mai in localStorage
  S = VUOTO();
  pulisciCacheLocaleDati();
  normalizzaGiustificativiStorici();
  applicaParametri();
  allineaImpegniReperibilita();
  invalidaCacheStato();
}

const save = () => {};
function mut(fn) {
  undoStack.push(JSON.stringify(S));
  if (undoStack.length > 30) undoStack.shift();
  fn();
  invalidaCacheStato();
  refresh();
  if (typeof triggerAutoSyncCloud === 'function') triggerAutoSyncCloud();
}
window.__cfGetState = () => S;
window.__cfApplyCloudState = (remoteS, remoteMs) => {
  S = Object.assign(VUOTO(), remoteS);
  invalidaCacheStato();
  normalizzaGiustificativiStorici();
  applicaParametri();
  allineaImpegniReperibilita();
  riallineaConfigGoogleDaCloud();
  riportaTodoNonChiusi(true);
  pulisciCacheLocaleDati();
  refresh();
};
window.__cfResetLocalState = () => {
  S = VUOTO();
  invalidaCacheStato();
  applicaParametri();
  pulisciCacheLocaleDati();
  refresh();
};
window.__cfOpenModal = id => { const e = $(id); if (e) e.classList.add('active'); };
function annulla() { if (!undoStack.length) return toast('Nessuna operazione da annullare'); S = JSON.parse(undoStack.pop()); invalidaCacheStato(); refresh(); if (typeof triggerAutoSyncCloud === 'function') triggerAutoSyncCloud(); toast('Ultima operazione annullata'); }
function toast(m) { const e = $('toast'); e.textContent = m; e.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('on'), 5000); }
const bloccato = iso => { if (S.ver[iso.slice(0, 7)]) { toast('Mese verificato: sbloccalo dal Riepilogo per modificarlo'); return true; } return false; };

// ---------- Calendario: riposo e festivi ----------
function festivi(y) {
  if (festivi.c[y]) return festivi.c[y];
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const pq = iso0(new Date(y, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 2));
  const fissi = ['01-01', '01-06', '04-25', '05-01', '06-02', '08-15', '11-01', '12-08', '12-25', '12-26'];
  const sp = (typeof PARAMETRI !== 'undefined' && PARAMETRI.santoPatrono !== undefined) ? PARAMETRI.santoPatrono : '06-24';
  if (sp) fissi.push(sp);
  String((typeof PARAMETRI !== 'undefined' && PARAMETRI.festiviExtra) || '').split(',').map(s => s.trim()).filter(s => /^\d{2}-\d{2}$/.test(s)).forEach(s => fissi.push(s));
  return festivi.c[y] = new Set(fissi.map(x => y + '-' + x).concat(pq));
}
festivi.c = {};
// Parsing data ricorrente "GG/MM" (o "GG-MM") -> "MM-DD"; '' se vuota, null se non valida
function parseGiornoMeseRicorrente(str) {
  const s = String(str || '').trim();
  if (!s) return '';
  const m = /^(\d{1,2})\s*[\/\-.]\s*(\d{1,2})$/.exec(s);
  if (!m) return null;
  const g = +m[1], me = +m[2];
  if (me < 1 || me > 12 || g < 1 || g > new Date(2024, me, 0).getDate()) return null;
  return String(me).padStart(2, '0') + '-' + String(g).padStart(2, '0');
}
function fmtGiornoMeseIT(mmdd) {
  const m = /^(\d{2})-(\d{2})$/.exec(String(mmdd || ''));
  return m ? m[2] + '/' + m[1] : '';
}
const tipoGiorno = iso => ({ rip: dow(iso) === 0 || dow(iso) === 6, fest: festivi(+iso.slice(0, 4)).has(iso) });
const lavorativo = iso => { const t = tipoGiorno(iso); return !t.rip && !t.fest; };
const ultimoMese = (y, m) => new Date(y, m, 0).getDate();

// ---------- Cache di calcolo per-stato ----------
let _stateRev = 0;
const _calcCache = { rev: -1, day: {}, riparto: {}, giorni: null };
function invalidaCacheStato() {
  _stateRev++;
  _calcCache.rev = _stateRev;
  _calcCache.day = {};
  _calcCache.riparto = {};
  _calcCache.giorni = null;
}

// ---------- Accessi dati ----------
const tDay = iso => S.t.filter(t => t.data === iso && !t.rep), gDay = iso => S.g.filter(g => g.data === iso);
const calcDay = iso => {
  if (_calcCache.rev !== _stateRev) {
    _calcCache.rev = _stateRev;
    _calcCache.day = {};
    _calcCache.riparto = {};
    _calcCache.giorni = null;
  }
  return _calcCache.day[iso] || (_calcCache.day[iso] = calcolaGiornata(iso, tDay(iso), gDay(iso), null));
};
const giorniConDati = () => {
  if (_calcCache.rev !== _stateRev) {
    _calcCache.rev = _stateRev;
    _calcCache.day = {};
    _calcCache.riparto = {};
    _calcCache.giorni = null;
  }
  if (!_calcCache.giorni) {
    _calcCache.giorni = [...new Set([...S.t.map(t => t.data), ...S.g.map(g => g.data)])].filter(Boolean).sort();
  }
  return _calcCache.giorni.slice();
};
const getDest = iso => S.d[iso] || null;
const repCat = r => (r && r.cat === '2SQ') ? '2SQ' : '1SQ';
const repCatLabel = c => c === '2SQ' ? 'Rincalzo 2° squadra' : 'Reperibilità 1° squadra';
const repTitoloAgenda = c => c === '2SQ' ? '🛡️ Rincalzo 2° squadra' : '📟 Reperibilità 1° squadra';
const repTipoGiorno = iso => {
  if (S.rep.some(r => repCat(r) === '1SQ' && iso >= r.da && iso <= r.a)) return '1SQ';
  if (S.rep.some(r => repCat(r) === '2SQ' && iso >= r.da && iso <= r.a)) return '2SQ';
  return null;
};
const inRep = iso => !!repTipoGiorno(iso);
function repGiorniMese(ym) {
  const y = +ym.slice(0, 4), m = +ym.slice(5, 7), maxD = ultimoMese(y, m);
  let gg1 = 0, gg2 = 0;
  for (let d = 1; d <= maxD; d++) {
    const tp = repTipoGiorno(`${ym}-${String(d).padStart(2, '0')}`);
    if (tp === '1SQ') gg1++;
    else if (tp === '2SQ') gg2++;
  }
  return { gg1, gg2, tot: gg1 + gg2 };
}
function repGiorniAnno(y) {
  let gg1 = 0, gg2 = 0;
  for (let m = 1; m <= 12; m++) {
    const rg = repGiorniMese(ymStr(+y, m));
    gg1 += rg.gg1;
    gg2 += rg.gg2;
  }
  return { gg1, gg2, tot: gg1 + gg2 };
}
const durMin = g => {
  if (g.tuttaGiornata) {
    if (g.data) {
      const td = tipoGiorno(g.data);
      if (td.rip || td.fest) return 0;
      return isVen(g.data) ? (PARAMETRI.oreTeoricheVenerdi || 360) : (PARAMETRI.oreTeoricheLunGio || 480);
    }
    return g.durata ? (P(g.durata) || 0) : (PARAMETRI.oreTeoricheLunGio || 480);
  }
  let m = g.durata ? (P(g.durata) || 0) : Math.max(0, (P(g.oraFine) || 0) - (P(g.oraInizio) || 0));
  if (m > 0 && m % 15 !== 0 && g.tipo !== 'VISITA MEDICA' && g.tipo !== 'SMART WORKING') {
    m = Math.ceil(m / 15) * 15;
  }
  return m;
};
const uso = g => durMin(g) + (P(g.tragittoPrima) || 0) + (P(g.tragittoDopo) || 0);
const pzAttivo = y => S.pz && S.pz.data && S.pz.data.slice(0, 4) === String(y) ? S.pz : null;
const primoAnno = () => Math.min(+todayISO().slice(0, 4), ...giorniConDati().map(d => +d.slice(0, 4)), S.pz ? +S.pz.data.slice(0, 4) : 9999);

// ---------- Contatori annuali con riporti ----------
function usatoAnno(tipo, y, fino) {
  const p = pzAttivo(y), ok = g => tipo === 'ORE RECUPERO' ? isRecupero(g.tipo) : g.tipo === tipo;
  return S.g.filter(g => g.data.startsWith(y) && (!p || g.data > p.data) && (!fino || g.data <= fino) && ok(g)).reduce((a, g) => {
    if (tipo === 'FERIE') {
      const dayCalc = calcDay(g.data);
      if (dayCalc && dayCalc.ferieEffettiveMin !== undefined) return a + dayCalc.ferieEffettiveMin;
    }
    return a + uso(g);
  }, 0) + (p ? p[PZ_KEY[tipo]] || 0 : 0);
}
// Ferie: l'avanzo passa all'anno dopo ma va usato entro il 30 giugno
const carryFerie = y => { const p = pzAttivo(y); return p ? p.ferieRip || 0 : +y <= primoAnno() ? 0 : fineFerie(String(+y - 1)); };
const carryUsato = y => Math.min(carryFerie(y), usatoAnno('FERIE', y, y + '-06-30'));
const fineFerie = y => Math.max(0, FERIE_ANNO + carryUsato(y) - usatoAnno('FERIE', y));
const residuoFerie = iso => { const y = iso.slice(0, 4); return FERIE_ANNO + (iso <= y + '-06-30' ? carryFerie(y) : carryUsato(y)) - usatoAnno('FERIE', y, iso); };
// Banca ore: non scade, ma si può accantonare solo se l'anno prima non restano >50h di ferie
const bancaAbilitata = y => carryFerie(y) <= 50 * 60;
const bancaRip = y => { const p = pzAttivo(y); return p ? p.bancaRip || 0 : +y <= primoAnno() ? 0 : saldoBancaFine(String(+y - 1)); };
const saldoBancaFine = y => bancaRip(y) + accantonatoAnno(y) - usatoAnno('ORE RECUPERO', y);
function ripartoAnno(y) {
  const key = String(y);
  if (_calcCache.rev === _stateRev && _calcCache.riparto[key]) return _calcCache.riparto[key];
  const p = pzAttivo(y); let resto = bancaAbilitata(y) ? PARAMETRI.tettoBancaOre - (p ? p.banca || 0 : 0) : 0; const out = {};
  giorniConDati().filter(d => d.startsWith(y) && (!p || d > p.data)).forEach(d => {
    const s = calcDay(d).straordinarioNettoMin, g = getDest(d) || (resto <= 0 ? 'PAGAMENTO' : null), ban = g === 'BANCA' ? Math.min(s, Math.max(0, resto)) : 0; resto -= ban;
    out[d] = { ban, pag: g === 'PAGAMENTO' ? s : g === 'BANCA' ? s - ban : 0, nd: g ? 0 : s };
  });
  _calcCache.riparto[key] = out;
  return out;
}
const sommaBan = (y, ok) => { const o = ripartoAnno(y), p = pzAttivo(y); return (p ? p.banca || 0 : 0) + Object.keys(o).filter(ok).reduce((a, d) => a + o[d].ban, 0); };
const accantonatoAnno = y => sommaBan(String(y), () => true), accantonatoPrima = iso => sommaBan(iso.slice(0, 4), d => d < iso);
const accantonabile = y => bancaAbilitata(y) ? Math.max(0, PARAMETRI.tettoBancaOre - accantonatoAnno(y)) : 0;
const pienoBanca = iso => !bancaAbilitata(iso.slice(0, 4)) || PARAMETRI.tettoBancaOre - accantonatoPrima(iso) <= 0;
const lunediDi = iso => { const d = D(iso); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return iso0(d); };
const usoSettimana = iso => S.g.filter(g => g.tipo === 'SMART WORKING' && lunediDi(g.data) === lunediDi(iso)).reduce((a, g) => a + uso(g), 0);
const lavoratoIl4Nov = y => S.t.some(t => t.data === `${y}-11-04`) || S.g.some(g => g.data === `${y}-11-04` && g.tipo === 'SMART WORKING') || !!(pzAttivo(y) && S.pz.lavNov4);
const extra4Nov = y => lavoratoIl4Nov(y) ? 480 : 0;
function residuo(tipo, iso) {
  const y = iso.slice(0, 4);
  if (tipo === 'FERIE') return residuoFerie(iso);
  if (tipo === 'SMART WORKING') return SW_SETT - usoSettimana(iso);
  if (tipo === 'ORE 4 NOVEMBRE') return extra4Nov(y) - usatoAnno(tipo, y);
  if (tipo === 'ORE RECUPERO') return bancaRip(y) + sommaBan(y, d => d <= iso) - usatoAnno(tipo, y);
  return LIMITI[tipo] === undefined ? null : LIMITI[tipo] - usatoAnno(tipo, y);
}
const ticketGiorno = d => calcDay(d).oreLavorateMin + gDay(d).filter(g => g.tipo === 'SMART WORKING').reduce((a, g) => a + uso(g), 0) >= 240;
const isTipoEntrata = t => t === 'E' || t === 'E PAUSA' || t === 'E VISITA MEDICA';
const isTipoUscita = t => t === 'U' || t === 'U PAUSA' || t === 'U VISITA MEDICA';
function estraiPassaggi(tG) {
  const ord = [...(tG || [])].sort((a, b) => (P(a.ora) || 0) - (P(b.ora) || 0));
  const entrateRaw = ord.filter(t => isTipoEntrata(t.tipo));
  const entrate = [];
  for (const e of entrateRaw) {
    const prev = entrate[entrate.length - 1];
    if (prev && Math.abs((P(e.ora) || 0) - (P(prev.ora) || 0)) <= 1 && (prev.tipo === 'E' || e.tipo === 'E')) {
      if (prev.tipo !== 'E' && e.tipo === 'E') entrate[entrate.length - 1] = e;
      continue;
    }
    entrate.push(e);
  }
  const uscite = ord.filter(t => isTipoUscita(t.tipo));
  return { ord, entrate, uscite };
}
const pausaRaw = tG => {
  const { entrate, uscite } = estraiPassaggi(tG);
  if (entrate.length >= 2 && uscite.length >= 1) {
    return Math.max(0, P(entrate[1].ora) - P(uscite[0].ora));
  }
  const u = (tG || []).find(t => t.tipo === 'U PAUSA'), e = (tG || []).find(t => t.tipo === 'E PAUSA');
  return u && e ? Math.max(0, P(e.ora) - P(u.ora)) : null;
};
const isPausaInCorsoOggi = (iso, tG) => {
  if (iso !== todayISO() || isVen(iso) || dow(iso) === 0 || dow(iso) === 6) return false;
  const { entrate, uscite } = estraiPassaggi(tG);
  if (entrate.length !== 1 || uscite.length !== 1) return false;
  if (uscite[0].tipo === 'U PAUSA') return true;
  const now = new Date(), nm = now.getHours() * 60 + now.getMinutes();
  const e0 = P(entrate[0].ora), u0 = P(uscite[0].ora);
  const hasGiustCopertura = gDay(iso).some(g => g.tipo === 'SMART WORKING' || g.tipo === 'FERIE' || g.tipo === 'ORE RECUPERO' || g.tipo === 'EX-FESTIVITÀ');
  return e0 < (PARAMETRI.pausaInizioFinestra || 735) && u0 >= 720 && u0 <= (PARAMETRI.pausaFineFinestra || 855) && nm <= (14 * 60 + 30) && !hasGiustCopertura;
};
const giornataChiusa = (iso, tG) => {
  const ts = tG || tDay(iso);
  if (iso < todayISO()) return true;
  const { entrate, uscite } = estraiPassaggi(ts);
  if (uscite.length >= 2) return true;
  if (uscite.length === 1) {
    if (entrate.length === 1 && isPausaInCorsoOggi(iso, ts)) return false;
    return entrate.length <= 1;
  }
  if (!ts.length) {
    const gs = gDay(iso);
    if (gs.length > 0) {
      const r = calcDay(iso);
      if (r.oreDovute > 0 && r.oreGiustificateMin >= r.oreDovute) return true;
    }
  }
  return false;
};

// Calcola le ore effettivamente lavorate da rendicontare nelle attività (0 se assente tutto il giorno; solo ore lavorate se assente parzialmente)
function infoOreAttivitaGiorno(iso) {
  const tG = tDay(iso), gG = gDay(iso), r = calcDay(iso);
  const chiusa = giornataChiusa(iso, tG);
  const smartMin = r.smartWorkingMin !== undefined ? r.smartWorkingMin : gG.filter(g => g.tipo === 'SMART WORKING').reduce((a, g) => a + uso(g), 0);
  const assenzaMin = Math.max(0, r.oreGiustificateMin - smartMin);
  const lavoroTotMin = r.oreLavorateMin + smartMin;
  const assenteTuttoGiorno = (lavoroTotMin === 0 && !tG.some(t => t.tipo === 'E') && assenzaMin > 0 && (r.oreDovute === 0 || assenzaMin >= r.oreDovute));

  let targetMin = 0;
  if (assenteTuttoGiorno || lavoroTotMin === 0) {
    targetMin = 0;
  } else if (r.oreDovute === 0) {
    targetMin = r.straordinarioNettoMin > 0 ? r.straordinarioNettoMin : Math.floor(lavoroTotMin / 15) * 15;
  } else {
    const ordinarieNetteDovute = Math.max(0, r.oreDovute - assenzaMin);
    const ordinarieEffettive = Math.min(lavoroTotMin, ordinarieNetteDovute);
    targetMin = ordinarieEffettive + r.straordinarioNettoMin;
  }

  const inCorso = !chiusa && tG.some(t => t.tipo === 'E');
  const previsteInCorsoMin = inCorso ? Math.max(0, r.oreDovute - assenzaMin) : targetMin;

  return {
    targetMin,
    targetOre: targetMin / 60,
    previsteInCorsoOre: previsteInCorsoMin / 60,
    assenzaMin,
    smartMin,
    lavoroTotMin,
    assenteTuttoGiorno,
    inCorso,
    chiusa
  };
}

function iconeGiust(tipo) {
  if (tipo === 'FERIE') return '🏖️';
  if (tipo === 'MALATTIA') return '🏥';
  if (tipo === 'SMART WORKING') return '💻';
  if (tipo === 'VISITA MEDICA') return '🩺';
  if (tipo === 'EX-FESTIVITÀ') return '📅';
  if (isRecupero(tipo)) return '⏱️';
  if (tipo === 'CONGEDO PARENTALE') return '👶';
  if (tipo === 'SCIOPERO') return '✊';
  if (tipo === 'DONAZIONE SANGUE') return '🩸';
  if (tipo === 'PERMESSO NON RETRIBUITO') return '⏳';
  return '📋';
}

function badgesGiustStoricoHTML(gG, r) {
  if (!gG || !gG.length) return '';
  return gG.map(g => {
    if (g.tipo === 'PAUSA NON TIMBRATA' || g.tipo === 'STRAORDINARIO PAUSA') {
      return `<span class="bd n" style="font-weight:600">🍽️ ${g.tipo}</span> `;
    }
    const mins = uso(g);
    const intero = r && r.oreDovute > 0 && mins >= r.oreDovute && r.oreLavorateMin === 0;
    const durTxt = mins > 0 ? (intero ? `INTERA (${F(mins)})` : F(mins)) : '';
    const isSw = g.tipo === 'SMART WORKING';
    const style = isSw
      ? 'background:#eef6ff;color:#0b5cad;border:1px solid #bcd8f8;font-weight:700'
      : 'background:#f3f0ff;color:#5b21b6;border:1px solid #ddd6fe;font-weight:700';
    return `<span class="bd" style="${style}">${iconeGiust(g.tipo)} ${g.tipo}${durTxt ? ' · ' + durTxt : ''}</span> `;
  }).join('');
}

function mancanti(iso, tG) {
  const { entrate, uscite } = estraiPassaggi(tG);
  const m = [];
  if (uscite.length > entrate.length) m.push('E');
  if (entrate.length > uscite.length && iso < todayISO()) m.push('U');
  return m;
}
// Mancate timbrature: ne è tollerata una al mese
const mancateMese = ym => S.t.filter(t => t.mancata && t.data.startsWith(ym)).sort((a, b) => (a.data + a.ora).localeCompare(b.data + b.ora));
const mancataInfo = iso => { const l = mancateMese(iso.slice(0, 7)), k = l.findIndex(t => t.data === iso); return k < 0 ? null : { n: k + 1, tot: l.length, oltre: k > 0 }; };
function repMin(ym) {
  const l = S.t.filter(t => t.rep && t.data.startsWith(ym)).sort((a, b) => (a.data + a.ora).localeCompare(b.data + b.ora)); let tot = 0, e = null;
  l.forEach(t => { if (t.tipo === 'E') e = t; else if (t.tipo === 'U' && e && e.data === t.data) { tot += Math.max(0, P(t.ora) - P(e.ora)); e = null; } }); return tot;
}
function alertGiorno(iso) {
  const out = [], tG = tDay(iso), gG = gDay(iso), r = calcDay(iso), td = tipoGiorno(iso);
  const ch = (S.chiusure || []).find(c => c.data === iso);
  if (ch && !gG.length) {
    out.push({ t: `🏢 Chiusura aziendale (${ch.desc || 'Obbligata'}): inserisci ${ch.giust || 'FERIE'}`, f: `g:FULL:${ch.giust || 'FERIE'}` });
  }
  if ((td.rip || td.fest) && !tG.length && !gG.length) return out;
  if (!tG.length && !gG.length) return [{ t: 'Nessuna registrazione', f: 'nr' }];
  mancanti(iso, tG).forEach(x => out.push({ t: `Manca la timbratura ${x}`, f: 't:' + x }));

  // Controllo scoperti orari calcolati dalle timbrature (ritardo ingresso, ritardo pausa, uscita anticipata / ore mancanti)
  if (Array.isArray(r.scopertiOrari) && r.scopertiOrari.length > 0) {
    r.scopertiOrari.forEach(sc => {
      out.push({
        t: `${sc.label} — inserisci giustificativo`,
        f: `g:${sc.inizio}-${sc.fine}`
      });
    });
  }

  r.attenzioni.forEach(a => {
    if (!/^Ore mancanti|^Uscita mancante|^Ritardo compensato|^Ritardo non compensato|^Pausa convertita|^Pausa non timbrata registrata|^Pausa non timbrata: dedotti 30 min/.test(a)) {
      out.push({ t: a, f: /Pausa non timbrata/i.test(a) ? 'g:PAUSA' : 'd' });
    }
  });
  if (r.straordinarioNettoMin > 0 && !getDest(iso) && !pienoBanca(iso)) out.push({ t: 'Straordinario: destinazione non scelta', f: 'd' });
  const mi = mancataInfo(iso); if (mi && mi.oltre) out.push({ t: `Mancata timbratura oltre il limite mensile (n° ${mi.n}: +${mi.n - 1})` });

  // 1. Check Attività svolte: basato esclusivamente sulle ore effettivamente lavorate (0 se assente tutto il giorno)
  const attInfo = infoOreAttivitaGiorno(iso);
  const atts = S.att[iso] || [];
  let sommaAttOre = 0;
  atts.forEach(a => { sommaAttOre += (typeof a.ore === 'number' ? a.ore : parseOreInput(a.ore)); });

  if (attInfo.targetOre > 0) {
    if (!atts.length) {
      out.push({ t: `Attività svolte non inserite (${attInfo.targetOre.toFixed(2)}h lavorate)`, f: 'att' });
    } else {
      const diff = Math.abs(sommaAttOre - attInfo.targetOre);
      if (diff >= 0.05) {
        const mancano = attInfo.targetOre - sommaAttOre;
        out.push({ t: `Attività da quadrare (${sommaAttOre.toFixed(2)}h su ${attInfo.targetOre.toFixed(2)}h lavorate: ${mancano > 0 ? 'mancano ' + mancano.toFixed(2) + 'h' : 'in eccesso ' + (-mancano).toFixed(2) + 'h'})`, f: 'att' });
      }
    }
  } else if (attInfo.assenteTuttoGiorno && sommaAttOre > 0) {
    out.push({ t: `Rimuovi attività (${sommaAttOre.toFixed(2)}h) in giornata di assenza totale`, f: 'att' });
  }

  // 2. Check Da fare (To-Do) del giorno non chiusi
  const todoAperti = (S.todo || []).filter(x => x.data === iso && !x.fatto);
  if (todoAperti.length) {
    out.push({ t: `${todoAperti.length} ${todoAperti.length === 1 ? 'cosa da fare non chiusa' : 'cose da fare non chiuse'}`, f: 'todo' });
  }

  // 3. Check Appuntamenti / Impegni agenda non conclusi (inclusi multi-giorno, esclusi i turni informativi di reperibilità)
  const impegniAperti = (S.ev || []).filter(e => !e.repId && evCopreGiorno(e, iso) && !isEvConcluso(e, iso));
  if (impegniAperti.length) {
    out.push({ t: `${impegniAperti.length} ${impegniAperti.length === 1 ? 'impegno non concluso' : 'impegni non conclusi'}`, f: 'ev' });
  }

  return out;
}

// ---------- Oggi ----------
const big = (l, v, s) => `<div class="big"><small>${l}</small><b>${v}</b>${s ? `<em>${s}</em>` : ''}</div>`;
const pills = c => `<div class="lbl">Se fai straordinario esci alle</div><div class="pills">${[30, 45, 60].map((m, i) => `<div><small>+${m} min</small><b>${c['oraScatto' + m + 'm']}</b></div>`).join('')}</div>`;
function fase(tG, ven) {
  const { entrate, uscite } = estraiPassaggi(tG);
  const nE = entrate.length, nU = uscite.length;
  if (nE === 0) return 'prima';
  if (nE >= 2 && nU >= 2) return 'fine';
  if (nE >= 2 && nU === 1) return 'pom';
  if (nE === 1 && nU === 1) return isPausaInCorsoOggi(iso0(currentDate), tG) ? 'pausa' : 'fine';
  if (ven || P(entrate[0].ora) >= (PARAMETRI.pausaInizioFinestra || 735)) return 'pom';
  return 'mat';
}
const rientri = c => { const ini = P(c.inizioPausa), mn = ini + 30; return { mn, mx: Math.max(mn, Math.min(ini + P(c.pausaMassimaPerUscitaMinima), PARAMETRI.pausaFineFinestra)) }; };
function aggiornaSchermataOggi() {
  const iso = iso0(currentDate), now = new Date(), nm = now.getHours() * 60 + now.getMinutes(), isOggi = iso === todayISO(), td = tipoGiorno(iso);
  const tG = tDay(iso), gG = gDay(iso), c = calcolaGiornata(iso, tG, gG, isOggi ? nm : null), f = fase(tG, isVen(iso));
  $('dWeek').textContent = cap(currentDate.toLocaleDateString('it-IT', { weekday: 'long' })); $('dDay').textContent = `${currentDate.getDate()} ${MESI[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
  const rTp = repTipoGiorno(iso);
  $('dBadges').innerHTML = [td.rip ? '<span class="bd n">RIPOSO</span>' : '', td.fest ? '<span class="bd n">FESTIVO</span>' : '', rTp === '1SQ' ? '<span class="bd r">REPERIBILE 1° SQUADRA</span>' : rTp === '2SQ' ? '<span class="bd t">RINCALZO 2° SQUADRA</span>' : '', S.ver[iso.slice(0, 7)] ? '<span class="bd g">MESE VERIFICATO</span>' : ''].join('');
  let h = '';
  if (f === 'prima') {
    if (gG.length && c.oreDovute > 0 && c.oreGiustificateMin >= c.oreDovute) {
      const tipiTxt = [...new Set(gG.map(g => g.tipo))].join(', ');
      h = `<div class="tag">Giornata coperta da giustificativo</div><div class="grid2">${big(c.smartWorkingMin >= c.oreDovute ? 'Smart Working' : 'Assenza giustificata', F(c.oreGiustificateMin), tipiTxt)}${big('Ore in sede', '0h 00m', 'intera giornata')}</div>`;
    } else {
      h = `<div class="hl">${!lavorativo(iso) && !gG.length ? (td.fest && td.rip ? 'Festivo che cade di riposo' : td.fest ? 'Giornata festiva' : 'Giornata di riposo') : "In attesa della timbratura d'entrata"}</div>`;
    }
  }
  else if (f === 'mat') {
    if (c.isSwPomeriggio) {
      const oreSedeMin = Math.max(0, c.oreDovute - c.smartWorkingMin);
      h = `<div class="tag">Mattina in sede · entrata ${c.entrataNorm}</div><div class="grid2">${big('Uscita dalla sede', c.uscitaTeorica, `dopo ${F(oreSedeMin)} in sede`)}${big("Inizio Smart (+30')", c.swPomeriggioInizioPrevisto, `fino alle ${c.swPomeriggioFinePrevista} · ${F(c.smartWorkingMin)}`)}</div>`;
    } else {
      h = `<div class="tag">Mattina · entrata ${c.entrataNorm}</div><div class="grid2">${big('Pausa massima', F(P(c.pausaMassimaPerUscitaMinima)), 'per uscire alle 17:15')}${big('Uscita minima', c.uscitaTeorica, 'con pausa di 30 min')}</div>${pills(c)}${c.anticipoRispettoPalettoMin > 0 ? `<div class="sub">Con la pausa minima finisci le ore ${c.anticipoRispettoPalettoMin} min prima delle 17:15</div>` : ''}`;
    }
  }
  else if (f === 'pausa') {
    const { mn, mx } = rientri(c);
    let swHint = '';
    if (!isVen(iso) && lavorativo(iso) && !gG.some(g => g.tipo === 'SMART WORKING')) {
      const lavFinora = Math.floor(Math.max(0, P(c.inizioPausa) - P(c.entrataNorm)) / 15) * 15;
      const mancano = Math.max(0, c.oreDovute - lavFinora - c.oreGiustificateMin);
      const swDur = Math.min(240, mancano);
      if (swDur > 0) {
        const swIni = P(c.inizioPausa) + PARAMETRI.pausaMinimaMinuti;
        const swFin = swIni + swDur;
        swHint = `<div class="sub" style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.18)">💻 Smart pomeridiano: servono <b>${F(swDur)}</b> (${T(swIni)}–${T(swFin)})${mancano > 240 ? ` · max 4h (restano ${F(mancano - 240)} scoperti)` : ''}<div style="margin-top:6px"><button class="btn sec" style="padding:5px 10px;font-size:.78rem;width:auto" onclick="completaInSmartDaPausa('${iso}','${T(swIni)}','${T(swFin)}')">💻 Completa in Smart Working</button></div></div>`;
      }
    }
    h = `<div class="tag">In pausa dalle ${c.inizioPausa}</div><div class="grid2">${big('Rientro minimo', T(mn), '30 minuti di pausa')}${big('Rientro massimo', T(mx), mx === PARAMETRI.pausaFineFinestra ? 'limite fascia 14:15' : 'per uscire alle 17:15')}</div><div class="sub">${isOggi ? `Margine: ${F(Math.max(0, mx - nm))} sotto il rientro massimo · ` : ''}pausa utile ${F(Math.max(0, mx - P(c.inizioPausa)))}</div>${swHint}`;
  }
  else if (f === 'pom') {
    let boxLive = '';
    if (c.isLive) {
      const uscMin = P(c.uscitaTeorica);
      const mancanoMin = uscMin !== null ? (uscMin - nm) : 0;
      if (mancanoMin > 0) {
        boxLive = big('Se esci ora', `−${F(mancanoMin)}`, `mancano ${F(mancanoMin)} all'uscita`);
      } else {
        const persi = Math.max(0, c.minutiOltreOrario - c.straordinarioNettoMin);
        const subOk = persi > 0
          ? `perdi ${persi} min non riconosciuti`
          : (c.straordinarioNettoMin > 0 ? 'scatto pieno maturato' : 'orario minimo raggiunto');
        boxLive = big('Se esci ora', `+${c.straordinarioNettoMin} min`, subOk);
      }
    }
    h = `<div class="tag">Pomeriggio</div><div class="grid2">${big('Uscita minima', c.uscitaTeorica)}${boxLive}</div>${pills(c)}`;
  }
  else {
    const uscSub = (c.uscitaConteggiata && c.uscitaConteggiata !== c.ultimaUscita && c.uscitaConteggiata !== '--:--')
      ? `uscita ${c.ultimaUscita} (contegg. ${c.uscitaConteggiata})`
      : `uscita ${c.ultimaUscita}`;
    const oreSub = c.oreGiustificateMin > 0 ? `${F(c.oreLavorateMin)} lav. + ${F(c.oreGiustificateMin)} giust.` : '';
    h = `<div class="tag">Giornata conclusa</div><div class="grid2">${big('Totale giornata', F(c.oreTotaliSvolteMin), oreSub)}${big('Straordinario', F(c.straordinarioNettoMin), uscSub)}</div>`;
  }
  $('hero').innerHTML = h; destCard(iso, c);
  const bn = []; const rp = S.rep.find(r => repReminderDay(r.da) === iso); if (rp) bn.push(`${repCatLabel(repCat(rp))} dal ${rp.da.split('-').reverse().join('/')}: ricordati prima di staccare`);
  const chiusa = giornataChiusa(iso, tG), al = chiusa ? alertGiorno(iso) : [];
  const okBanner = (chiusa && (tG.length || gG.length) && !al.length) ? `<div class="alert" style="background:rgba(46,157,106,0.1);border-color:var(--green);color:var(--green)"><b>✓ Giornata chiusa e completa</b> — Timbrature, attività svolte e cose da fare sono in regola.</div>` : '';
  $('alertContainer').innerHTML = (bn.length ? `<div class="alert">${bn.join('<br>')}</div>` : '') + (al.length ? `<div class="alert"><b>Da sistemare (Giornata chiusa)</b><div class="chips" style="margin-top:6px">${al.map(a => `<button class="chip" onclick="fix('${iso}','${a.f || 'd'}')">${a.t}</button>`).join('')}</div></div>` : okBanner);
  renderReg(tG, gG, iso); renderAgendaGiorno(iso); renderAttivita(iso); renderTodo(iso);
  const recapRows = [['Entrata normalizzata', c.entrataNorm]];
  if (c.ultimaUscita !== '--:--') {
    recapRows.push(['Uscita conteggiata', (c.uscitaConteggiata && c.uscitaConteggiata !== c.ultimaUscita) ? `${c.uscitaConteggiata} (timbrata ${c.ultimaUscita})` : c.ultimaUscita]);
  }
  recapRows.push(['Ore effettivamente lavorate', F(c.oreLavorateMin)], ['Ore giustificate', F(c.oreGiustificateMin)], ['Totale coperto giornata', F(c.oreTotaliSvolteMin)], ['Pausa', c.pausaEffettivaMin + ' min'], ['Straordinario', F(c.straordinarioNettoMin)], ['Ticket', ticketGiorno(iso) ? 'sì' : 'no']);
  $('recap').innerHTML = recapRows.map(x => `<div class="row"><span>${x[0]}</span><b>${x[1]}</b></div>`).join('');
}
const segHTML = (iso, d, pieno) => `<div class="seg"><button class="${d === 'BANCA' ? 'on' : ''}" ${pieno ? 'disabled' : ''} onclick="setDest('BANCA','${iso}')">Monte ore</button><button class="${d === 'PAGAMENTO' ? 'on' : ''}" ${pieno ? 'disabled' : ''} onclick="setDest('PAGAMENTO','${iso}')">Pagamento</button></div>`;
function avvisaSeTettoBancaOre(iso) {
  const r = calcDay(iso);
  if (r.straordinarioNettoMin > 0 && pienoBanca(iso)) {
    const y = iso.slice(0, 4);
    const msg = !bancaAbilitata(y)
      ? `⚠ Accantonamento non attivo: straordinario di ${F(r.straordinarioNettoMin)} destinato automaticamente a Pagamento`
      : `⚠ Monte ore annuo (${F(PARAMETRI.tettoBancaOre)}) raggiunto: straordinario di ${F(r.straordinarioNettoMin)} destinato automaticamente a Pagamento`;
    toast(msg);
  }
}
function setDest(v, iso) {
  iso = iso || iso0(currentDate);
  if (bloccato(iso)) return;
  if (v === 'BANCA' && pienoBanca(iso)) {
    toast(`Monte ore annuo (${F(PARAMETRI.tettoBancaOre)}) raggiunto: straordinario destinato automaticamente a Pagamento`);
    mut(() => S.d[iso] = 'PAGAMENTO');
    return;
  }
  mut(() => S.d[iso] = v);
}
function destCard(iso, c) {
  const box = $('destCard'), s = c.straordinarioNettoMin; if (s <= 0) { box.style.display = 'none'; return; }
  const pieno = pienoBanca(iso), d = pieno ? 'PAGAMENTO' : getDest(iso), y = iso.slice(0, 4); box.style.display = 'block';
  const msgPieno = !bancaAbilitata(y)
    ? 'Accantonamento non attivo (ferie residue oltre 50h a fine anno scorso): straordinario automaticamente in Pagamento.'
    : `Monte ore annuo di ${F(PARAMETRI.tettoBancaOre)} raggiunto: non è più possibile accantonare, lo straordinario va automaticamente in Pagamento.`;
  box.innerHTML = `${pieno ? `<div class="alert" style="margin-bottom:8px"><b>⚠ Limite monte ore superato</b><br>${msgPieno}</div>` : (d ? '' : '<div class="warn">⚠ Non hai ancora scelto dove va lo straordinario</div>')}<div class="h">Straordinario di ${F(s)}: ${pieno ? 'destinazione automatica' : 'dove va?'}</div>${segHTML(iso, d, pieno)}<small class="note">${pieno ? 'Scelta bloccata: destinazione automatica in Pagamento' : `Ancora accantonabili ${F(accantonabile(y))}`}</small>`;
}
function renderReg(tG, gG, iso) {
  const ts = S.t.filter(t => t.data === iso).sort((a, b) => P(a.ora) - P(b.ora)), ib = (fn, ic, cls, l) => `<button class="ib ${cls}" onclick="${fn}" aria-label="${l}">${ic}</button>`, mi = mancataInfo(iso);
  const { entrate, uscite } = estraiPassaggi(ts);
  $('regList').innerHTML = `<div class="h">Timbrature</div>` + (ts.length ? ts.map(t => { const i = S.t.indexOf(t);
    let labelTipo = isTipoUscita(t.tipo) ? 'Uscita' : 'Entrata';
    if ((entrate.length >= 2 && uscite.length >= 2 && (t === uscite[0] || t === entrate[1])) || t.tipo === 'U PAUSA' || t.tipo === 'E PAUSA') {
      labelTipo += ' (pausa)';
    }
    return `<div class="tl"><span class="bd t">TIMBRATURA</span><span class="nm">${labelTipo}${t.mancata ? ' <span class="bd x">MANCATA</span>' : ''}${t.rep ? ' <span class="bd r">REP</span>' : ''}</span><b>${t.ora}</b>${ib(`modificaTimb(${i})`, IC.pen, '', 'Modifica')}${ib(`eliminaTimb(${i})`, IC.bin, 'd', 'Elimina')}</div>`; }).join('') : '<div class="empty">Nessuna timbratura</div>')
    + (mi ? `<div class="empty" style="color:var(--danger)">Mancata timbratura n° ${mi.n} del mese${mi.oltre ? ` — oltre il limite di 1: +${mi.n - 1}` : ' (tollerata)'}</div>` : '')
    + `<div class="h" style="margin-top:12px">Giustificativi</div>` + (gG.length ? gG.map(g => {
      const i = S.g.indexOf(g);
      let v = '';
      if (g.tipo === 'VISITA MEDICA') {
        v = `${g.oraInizio}–${g.oraFine} (${F(uso(g))})`;
      } else if (g.tuttaGiornata) {
        v = `Tutta la giornata (${g.durata ? F(P(g.durata)) : F(oreGiornataMin())})`;
      } else if (g.oraInizio && g.oraFine) {
        v = `${g.oraInizio}–${g.oraFine}${g.durata ? ` (${F(P(g.durata))})` : ''}`;
      } else if (g.durata) {
        v = F(P(g.durata));
      }
      return `<div class="tl"><span class="bd g">GIUSTIFICATIVO</span><span class="nm">${g.tipo}</span><b>${v}</b>${ib(`modificaGiust(${i})`, IC.pen, '', 'Modifica')}${ib(`eliminaGiust(${i})`, IC.bin, 'd', 'Elimina')}</div>`;
    }).join('') : '<div class="empty">Nessun giustificativo</div>');
}
function eliminaTimb(i) { const t = S.t[i]; if (bloccato(t.data)) return; if (confirm(`Eliminare la timbratura ${t.tipo} delle ${t.ora}?`)) mut(() => S.t.splice(i, 1)); }
async function eliminaGiust(i) {
  const g = S.g[i];
  if (!g || bloccato(g.data)) return;
  if (!confirm(`Eliminare il giustificativo ${g.tipo}?`)) return;
  let hasGoogleDel = false;
  mut(() => {
    S.g.splice(i, 1);
    if (g.tipo === 'SMART WORKING') {
      const linked = S.ev.filter(e => (g.id && e.giustId === g.id) || (!g.id && e.data === g.data && e.titolo === '💻 Smart Working'));
      if (linked.length) {
        linked.forEach(ev => {
          if (ev.googleId && isGoogleConfigured()) {
            S.gcal = S.gcal || { connected: true, email: getGooglePrimaryEmail(), selectedCals: getGoogleSelectedCalendars(), calCache: [], dismissedIds: [], pendingDeletes: [] };
            S.gcal.pendingDeletes = S.gcal.pendingDeletes || [];
            if (!S.gcal.pendingDeletes.some(d => d.googleId === ev.googleId)) {
              S.gcal.pendingDeletes.push({ googleId: ev.googleId, calId: ev.googleCalId || getWritableSelectedGoogleCalendars()[0] || 'primary' });
              hasGoogleDel = true;
            }
          }
        });
        const linkedIds = new Set(linked.map(e => e.id));
        S.ev = S.ev.filter(e => !linkedIds.has(e.id));
      }
    }
  });
  if (hasGoogleDel && isGoogleConfigured()) {
    await eseguiPendingDeletesGoogle();
  }
}
const cambiaGiorno = n => {
  const prevDate = iso0(currentDate);
  currentDate.setDate(currentDate.getDate() + n);
  navStack.push({ page: 'oggi', date: prevDate });
  if (navStack.length > 30) navStack.shift();
  salvaNavStack();
  pagina.lastDate = iso0(currentDate);
  aggiornaSchermataOggi();
  aggiornaBtnBackUI();
};
const vaiAOggi = () => {
  currentDate = new Date();
  pagina.lastDate = iso0(currentDate);
  aggiornaSchermataOggi();
  aggiornaBtnBackUI();
};

function initSwipeOggi() {
  const el = $('p-oggi');
  if (!el || el.dataset.swipeInit) return;
  el.dataset.swipeInit = '1';
  let startX = 0, startY = 0, startT = 0, active = false;
  el.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) { active = false; return; }
    if (document.querySelector('.modal.active') || ($('drawer') && $('drawer').classList.contains('open'))) { active = false; return; }
    if (e.target && e.target.closest('input, select, textarea, button, a, label')) { active = false; return; }
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    startT = Date.now();
    active = true;
  }, { passive: true });
  el.addEventListener('touchend', e => {
    if (!active || e.changedTouches.length !== 1) return;
    active = false;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    const dt = Date.now() - startT;
    if (dt < 700 && Math.abs(dx) >= 55 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      cambiaGiorno(dx > 0 ? -1 : 1);
    }
  }, { passive: true });
}

function initSwipeAgenda() {
  const el = $('p-agenda');
  if (!el || el.dataset.swipeInit) return;
  el.dataset.swipeInit = '1';
  let startX = 0, startY = 0, lastX = 0, lastY = 0, startT = 0, active = false, justSwiped = false;
  const finishSwipe = (endX, endY) => {
    if (!active) return;
    active = false;
    const dx = endX - startX;
    const dy = endY - startY;
    const dt = Date.now() - startT;
    if (dt < 1200 && Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.15) {
      justSwiped = true;
      setTimeout(() => { justSwiped = false; }, 350);
      navMese(dx > 0 ? -1 : 1);
    }
  };
  el.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) { active = false; return; }
    if (document.querySelector('.modal.active') || ($('drawer') && $('drawer').classList.contains('open'))) { active = false; return; }
    if (e.target && e.target.closest('input, select, textarea, button, a, label')) { active = false; return; }
    startX = lastX = e.touches[0].clientX;
    startY = lastY = e.touches[0].clientY;
    startT = Date.now();
    active = true;
  }, { passive: true });
  el.addEventListener('touchmove', e => {
    if (!active || e.touches.length !== 1) return;
    lastX = e.touches[0].clientX;
    lastY = e.touches[0].clientY;
  }, { passive: true });
  el.addEventListener('touchend', e => {
    if (!active || e.changedTouches.length !== 1) return;
    finishSwipe(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
  }, { passive: true });
  el.addEventListener('touchcancel', () => {
    finishSwipe(lastX, lastY);
  }, { passive: true });
  el.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    if (document.querySelector('.modal.active') || ($('drawer') && $('drawer').classList.contains('open'))) return;
    if (e.target && e.target.closest('input, select, textarea, button, a, label')) return;
    startX = lastX = e.clientX;
    startY = lastY = e.clientY;
    startT = Date.now();
    active = true;
  });
  el.addEventListener('mouseup', e => {
    if (!active) return;
    finishSwipe(e.clientX, e.clientY);
  });
  el.addEventListener('click', e => {
    if (justSwiped) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
}

// Agenda, attività, cose da fare (con supporto eventi multi-giorno e modifica/sync bidirezionale)
let editEvId = null;
const evFine = e => (e && e.dataFine && e.dataFine >= e.data) ? e.dataFine : (e ? e.data : '');
const isMultiGiorno = e => evFine(e) > e.data;
const evCopreGiorno = (e, iso) => !!(e && e.data && e.data <= iso && evFine(e) >= iso);
const isEvConcluso = (e, iso) => {
  if (!e) return false;
  if (isMultiGiorno(e) && iso) return !!(e.concluso || (e.conclusiGiorni && e.conclusiGiorni[iso]));
  return !!e.concluso;
};
const fmtShortDM = iso => iso && iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '';
const oraLabelEv = (e, iso) => {
  if (!isMultiGiorno(e)) {
    if (e.ora && e.oraFine) return `${e.ora}–${e.oraFine}`;
    return e.ora || '';
  }
  if (!iso) return e.ora || '';
  if (iso === e.data) return e.ora ? `dalle ${e.ora}` : 'Tutto il gg';
  if (iso === evFine(e)) return e.oraFine ? `fino alle ${e.oraFine}` : 'Tutto il gg';
  return 'Tutto il gg';
};

const rowEv = (e, isoCtx) => {
  const iso = isoCtx || e.data;
  const fatto = isEvConcluso(e, iso);
  const multi = isMultiGiorno(e);
  const calTag = e.googleCalName ? `<span class="bd n" style="font-size:0.65rem;border-left:3px solid ${escHtml(e.googleCalColor || '#4285F4')}">${escHtml(e.googleCalName)}</span>` : '';
  const multiTag = multi ? `<span class="bd n" style="font-size:0.65rem;background:#eef5fc;color:var(--navy)">📅 ${fmtShortDM(e.data)} → ${fmtShortDM(evFine(e))}</span>` : '';
  const syncPendingTag = e.pendingSync ? `<span class="bd n" style="font-size:0.62rem" title="In attesa di invio a Google Calendar">⏳ sync</span>` : '';
  const oraTxt = oraLabelEv(e, iso);
  return `<div class="tl" style="align-items:center;${fatto ? 'opacity:0.6;' : ''}">
    <label class="chk" style="margin:0;padding-right:6px" title="Segna come svolto / concluso">
      <input type="checkbox" ${fatto ? 'checked' : ''} onchange="togEv('${e.id}','${iso}')">
    </label>
    <div style="flex:1;min-width:0">
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        <span class="bd ${e.tipo === 'Lavoro' ? 't' : 'g'}" style="font-size:0.7rem">${escHtml((e.tipo || 'Lavoro').toUpperCase())}</span>
        ${calTag}
        ${multiTag}
        ${oraTxt ? `<b style="font-size:0.84rem">${escHtml(oraTxt)}</b>` : ''}
        <span class="nm" style="${fatto ? 'text-decoration:line-through;color:var(--muted)' : 'font-weight:600'}">${escHtml(e.titolo)}</span>
        ${syncPendingTag}
      </div>
      ${(e.luogo || e.fuori) ? `<div style="font-size:0.78rem;color:var(--muted);margin-top:2px">${e.luogo ? '📍 ' + escHtml(e.luogo) : ''}${e.fuori ? ' <span class="bd x" style="font-size:0.65rem">FUORI SEDE</span>' : ''}</div>` : ''}
    </div>
    <button class="ib" onclick="modificaEv('${e.id}')" aria-label="Modifica impegno" title="Modifica">${IC.pen}</button>
    <button class="ib d" onclick="delEv('${e.id}')" aria-label="Elimina impegno" title="Elimina">${IC.bin}</button>
  </div>`;
};

function togEv(id, iso) {
  mut(() => {
    const x = S.ev.find(y => y.id === id);
    if (!x) return;
    if (isMultiGiorno(x) && iso) {
      x.conclusiGiorni = x.conclusiGiorni || {};
      if (x.conclusiGiorni[iso]) delete x.conclusiGiorni[iso];
      else x.conclusiGiorni[iso] = true;
    } else {
      x.concluso = !x.concluso;
    }
  });
}

function renderAgendaGiorno(iso) {
  const l = S.ev.filter(e => evCopreGiorno(e, iso)).sort((a, b) => {
    const oa = (a.data === iso ? (a.ora || '00:00') : '00:00');
    const ob = (b.data === iso ? (b.ora || '00:00') : '00:00');
    return oa.localeCompare(ob);
  });
  $('agendaGiorno').innerHTML = l.length ? l.map(e => rowEv(e, iso)).join('') : '<div class="empty">Nessun impegno</div>';
}

function getWritableSelectedGoogleCalendars() {
  const selected = getGoogleSelectedCalendars();
  const cache = (S.gcal && S.gcal.calCache) || [];
  const writable = selected.filter(id => {
    const m = cache.find(c => c.id === id);
    return !m || !m.accessRole || m.accessRole === 'owner' || m.accessRole === 'writer';
  });
  if (writable.length) return writable;
  const email = getGooglePrimaryEmail();
  return email ? [email] : ['primary'];
}

function popolaSelectCalModalEv(preselectedCalId) {
  const row = $('rowEvCalGoogle');
  const sel = $('evCalGoogle');
  if (!row || !sel) return;
  if (!isGoogleConfigured()) {
    row.style.display = 'none';
    return;
  }
  const writableIds = getWritableSelectedGoogleCalendars();
  const cache = (S.gcal && S.gcal.calCache) || [];
  sel.innerHTML = writableIds.map(id => {
    const m = cache.find(c => c.id === id);
    const label = m ? (m.summary || id) : (id === 'primary' ? 'Calendario principale' : id);
    return `<option value="${escHtml(id)}">${escHtml(label)}</option>`;
  }).join('');
  if (preselectedCalId && writableIds.includes(preselectedCalId)) {
    sel.value = preselectedCalId;
  } else if (writableIds.length) {
    sel.value = writableIds[0];
  }
  row.style.display = writableIds.length > 1 ? 'block' : 'none';
}

function apriEv() {
  editEvId = null;
  const d = iso0(currentDate);
  if ($('titModalEv')) $('titModalEv').textContent = 'Nuovo impegno / appuntamento';
  $('evData').value = d;
  if ($('evDataFine')) $('evDataFine').value = d;
  $('evOra').value = '';
  if ($('evOraFine')) $('evOraFine').value = '';
  $('evTitolo').value = '';
  $('evLuogo').value = '';
  $('evTipo').value = 'Lavoro';
  $('evFuori').checked = false;
  if ($('evReminder')) $('evReminder').value = '30';
  if ($('evSyncOutlook')) $('evSyncOutlook').checked = true;
  popolaSelectCalModalEv(null);
  $('modalEv').classList.add('active');
}

function modificaEv(id) {
  const ev = S.ev.find(e => e.id === id);
  if (!ev) return;
  editEvId = ev.id;
  if ($('titModalEv')) $('titModalEv').textContent = 'Modifica impegno / appuntamento';
  $('evData').value = ev.data || iso0(currentDate);
  if ($('evDataFine')) $('evDataFine').value = evFine(ev);
  $('evOra').value = ev.ora || '';
  if ($('evOraFine')) $('evOraFine').value = ev.oraFine || '';
  $('evTitolo').value = ev.titolo || '';
  $('evLuogo').value = ev.luogo || '';
  $('evTipo').value = ev.tipo || 'Lavoro';
  $('evFuori').checked = !!ev.fuori;
  if ($('evReminder')) $('evReminder').value = String(ev.reminder !== undefined ? ev.reminder : 30);
  if ($('evSyncOutlook')) $('evSyncOutlook').checked = (ev.syncGoogle !== false);
  popolaSelectCalModalEv(ev.googleCalId || null);
  $('modalEv').classList.add('active');
}

async function salvaEv() {
  const t = $('evTitolo').value.trim();
  const dStart = $('evData').value;
  let dFine = ($('evDataFine') && $('evDataFine').value) ? $('evDataFine').value : dStart;
  if (!t || !dStart) return alert('Inserisci data e titolo.');
  if (dFine < dStart) dFine = dStart;

  const oraInizio = $('evOra').value || '';
  const oraFine = ($('evOraFine') && $('evOraFine').value) ? $('evOraFine').value : '';
  if (dStart === dFine && oraInizio && oraFine && oraFine <= oraInizio) {
    return alert('L\'ora di fine deve essere successiva all\'ora di inizio (oppure imposta una data di fine successiva).');
  }

  const rem = $('evReminder') ? parseInt($('evReminder').value, 10) : 30;
  const syncEsterno = $('evSyncOutlook') ? $('evSyncOutlook').checked : true;
  const chosenCal = ($('evCalGoogle') && $('evCalGoogle').value) ? $('evCalGoogle').value : (getWritableSelectedGoogleCalendars()[0] || 'primary');
  const cache = (S.gcal && S.gcal.calCache) || [];
  const calMeta = cache.find(c => c.id === chosenCal) || {};

  if (editEvId) {
    const existing = S.ev.find(x => x.id === editEvId);
    editEvId = null;
    if (!existing) { chiudiModal('modalEv'); return; }

    const prevCalId = existing.googleCalId || null;
    mut(() => {
      existing.data = dStart;
      existing.dataFine = dFine;
      existing.ora = oraInizio;
      existing.oraFine = oraFine;
      existing.titolo = t;
      existing.luogo = $('evLuogo').value.trim();
      existing.tipo = $('evTipo').value;
      existing.fuori = $('evFuori').checked;
      existing.reminder = rem;
      existing.syncGoogle = syncEsterno;
      if (existing.repId) {
        const rpLink = S.rep.find(r => r.id === existing.repId || r.evId === existing.id);
        if (rpLink) { rpLink.da = dStart; rpLink.a = dFine; }
      }
      if (syncEsterno && isGoogleConfigured()) {
        existing.googleCalId = existing.googleCalId || chosenCal;
        if (!existing.googleCalName && calMeta.summary) existing.googleCalName = calMeta.summary;
        if (!existing.googleCalColor && calMeta.backgroundColor) existing.googleCalColor = calMeta.backgroundColor;
        existing.pendingSync = existing.googleId ? 'update' : 'create';
      }
    });
    chiudiModal('modalEv');

    if (syncEsterno && isGoogleConfigured()) {
      if (existing.googleId) {
        await aggiornaEventoGoogle(existing, prevCalId && chosenCal && prevCalId !== chosenCal ? chosenCal : null);
      } else {
        await inviaEventoGoogle(existing);
      }
    }
    toast('Impegno aggiornato! ✓');
    return;
  }

  const newEv = {
    id: uid(),
    data: dStart,
    dataFine: dFine,
    ora: oraInizio,
    oraFine: oraFine,
    titolo: t,
    luogo: $('evLuogo').value.trim(),
    tipo: $('evTipo').value,
    fuori: $('evFuori').checked,
    reminder: rem,
    concluso: false,
    syncGoogle: syncEsterno
  };
  if (syncEsterno && isGoogleConfigured()) {
    newEv.googleCalId = chosenCal;
    newEv.googleCalName = calMeta.summary || '';
    newEv.googleCalColor = calMeta.backgroundColor || '#4285F4';
    newEv.pendingSync = 'create';
  }

  mut(() => S.ev.push(newEv));
  chiudiModal('modalEv');

  if (syncEsterno) {
    if (isGoogleConfigured()) await inviaEventoGoogle(newEv);
    inviaEventoM365(newEv);
  }
  toast('Impegno salvato! ✓');
}

async function delEv(id) {
  const target = S.ev.find(e => e.id === id);
  if (!target) return;
  const syncNote = (target.googleId && isGoogleConfigured()) ? '\n(Verrà eliminato anche dal calendario Google collegato)' : '';
  if (!confirm(`Eliminare l'impegno "${target.titolo}"?${syncNote}`)) return;

  const gId = target.googleId || null;
  const gCal = target.googleCalId || getWritableSelectedGoogleCalendars()[0] || 'primary';

  mut(() => {
    if (gId && isGoogleConfigured()) {
      S.gcal = S.gcal || { connected: true, email: getGooglePrimaryEmail(), selectedCals: getGoogleSelectedCalendars(), calCache: [], dismissedIds: [], pendingDeletes: [] };
      S.gcal.pendingDeletes = S.gcal.pendingDeletes || [];
      if (!S.gcal.pendingDeletes.some(d => d.googleId === gId)) {
        S.gcal.pendingDeletes.push({ googleId: gId, calId: gCal });
      }
    }
    if (target.repId) {
      S.rep = S.rep.filter(r => r.id !== target.repId && r.evId !== id);
    } else {
      S.rep = S.rep.filter(r => r.evId !== id);
    }
    S.ev = S.ev.filter(e => e.id !== id);
  });

  if (gId && isGoogleConfigured()) {
    const okDel = await eseguiPendingDeletesGoogle();
    if (okDel) {
      toast('Impegno eliminato anche da Google Calendar ✓');
    } else if (!isGoogleTokenValid()) {
      toast('Impegno rimosso in app: rinnova Google per completare la cancellazione sul calendario.');
    }
  }
}
function renderAttivita(iso) { const l = S.att[iso] || []; $('attList').innerHTML = l.length ? l.map((a, i) => `<div class="tl"><span class="nm"><b>${a.cat}</b>${a.note ? `<br><small>${a.note}</small>` : ''}</span><button class="ib d" onclick="delAtt(${i})" aria-label="Elimina">${IC.bin}</button></div>`).join('') : '<div class="empty">Nessuna attività registrata</div>'; }
function addAtt() { const iso = iso0(currentDate); if (bloccato(iso)) return; const n = $('attNote').value.trim(); mut(() => (S.att[iso] = S.att[iso] || []).push({ cat: $('attCat').value, note: n })); $('attNote').value = ''; }
const delAtt = i => { const iso = iso0(currentDate); if (!bloccato(iso)) mut(() => S.att[iso].splice(i, 1)); };
function isGiornoLavorativoEffettivo(iso) {
  return lavorativo(iso) && !(S.chiusure || []).some(c => c.data === iso);
}
function prossimoGiornoLavorativo(iso, includiSeLavorativo = false) {
  if (includiSeLavorativo && isGiornoLavorativoEffettivo(iso)) return iso;
  const d = D(iso);
  for (let i = 0; i < 30; i++) {
    d.setDate(d.getDate() + 1);
    const cand = iso0(d);
    if (isGiornoLavorativoEffettivo(cand)) return cand;
  }
  return iso;
}
function riportaTodoNonChiusi(salva = true) {
  const oggi = todayISO();
  const targetIso = prossimoGiornoLavorativo(oggi, true);
  let spostati = 0;
  (S.todo || []).forEach(x => {
    if (!x.fatto && x.data && x.data < oggi) {
      if (!x.spostatoDa) x.spostatoDa = x.data;
      x.data = targetIso;
      spostati++;
    }
  });
  if (spostati > 0) {
    invalidaCacheStato();
    if (salva && typeof triggerAutoSyncCloud === 'function') triggerAutoSyncCloud();
  }
  return spostati;
}
function renderTodo(iso) { const l = S.todo.filter(x => x.data === iso); $('todoList').innerHTML = l.length ? l.map(x => `<div class="tl"><label class="nm chk"><input type="checkbox" ${x.fatto ? 'checked' : ''} onchange="togTodo('${x.id}')"><span style="${x.fatto ? 'text-decoration:line-through;color:var(--muted)' : ''}">${x.testo}${x.spostatoDa && x.spostatoDa !== x.data ? `<small style="color:var(--muted);margin-left:4px">(da ${fmtShortDM(x.spostatoDa)})</small>` : ''}</span></label><button class="ib d" onclick="delTodo('${x.id}')" aria-label="Elimina">${IC.bin}</button></div>`).join('') : '<div class="empty">Niente da fare</div>'; }
function addTodo() { const t = $('todoIn').value.trim(); if (!t) return; mut(() => S.todo.push({ id: uid(), data: iso0(currentDate), testo: t, fatto: false })); $('todoIn').value = ''; if (fired()[todayISO() + '_eodtodo']) aggiornaNotificaTodoFineGiornata(false); }
const togTodo = id => { mut(() => { const x = S.todo.find(y => y.id === id); if (x) x.fatto = !x.fatto; }); if (fired()[todayISO() + '_eodtodo']) aggiornaNotificaTodoFineGiornata(false); };
const delTodo = id => { mut(() => S.todo = S.todo.filter(x => x.id !== id)); if (fired()[todayISO() + '_eodtodo']) aggiornaNotificaTodoFineGiornata(false); };

// ---------- Pagine, menu e navigazione Indietro ----------
let navStack = (() => {
  try { return JSON.parse(sessionStorage.getItem('cf_nav_stack') || '[]'); } catch (e) { return []; }
})();

function salvaNavStack() {
  try { sessionStorage.setItem('cf_nav_stack', JSON.stringify(navStack.slice(-30))); } catch (e) {}
}

function aggiornaBtnBackUI() {
  const b = $('btnBackNav');
  if (!b) return;
  const canBack = navStack.length > 0 || (pagina.cur && pagina.cur !== 'oggi') || (pagina.cur === 'oggi' && iso0(currentDate) !== todayISO());
  b.style.opacity = canBack ? '1' : '0.4';
}

function indietroNav() {
  // Se il menu laterale è aperto, chiudilo
  if ($('drawer') && $('drawer').classList.contains('open')) {
    $('drawer').classList.remove('open');
    return;
  }
  // Se c'è un modal aperto, chiudi l'ultimo modal attivo
  const openModals = [...document.querySelectorAll('.modal.active')];
  if (openModals.length > 0) {
    openModals[openModals.length - 1].classList.remove('active');
    return;
  }
  // Torna allo stato precedente nello stack di navigazione
  while (navStack.length > 0) {
    const prev = navStack.pop();
    salvaNavStack();
    if (prev && prev.page && (prev.page !== pagina.cur || (prev.date && prev.date !== iso0(currentDate)))) {
      if (prev.date) currentDate = D(prev.date);
      pagina(prev.page, true);
      return;
    }
  }
  // Fallback: se non siamo su Oggi torna a Oggi; se siamo su un'altra data torna a oggi
  if (pagina.cur && pagina.cur !== 'oggi') {
    pagina('oggi', true);
  } else if (iso0(currentDate) !== todayISO()) {
    currentDate = new Date();
    aggiornaSchermataOggi();
    pagina.lastDate = iso0(currentDate);
    aggiornaBtnBackUI();
  } else {
    toast('Sei già alla schermata iniziale');
  }
}

function tornaAOggi() {
  currentDate = new Date();
  pagina('oggi');
}

function pagina(id, fromBack = false) {
  if (id === 'storico') {
    vistaAgendaCur = 'elenco';
    id = 'agenda';
  }
  const prevPage = pagina.cur;
  const prevDate = pagina.lastDate || iso0(currentDate);
  if (!fromBack && prevPage && (prevPage !== id || prevDate !== iso0(currentDate))) {
    navStack.push({ page: prevPage, date: prevDate });
    if (navStack.length > 30) navStack.shift();
    salvaNavStack();
  }
  document.querySelectorAll('.pg').forEach(p => p.classList.toggle('on', p.id === 'p-' + id)); $('drawer').classList.remove('open'); window.scrollTo(0, 0);
  $('titPag').textContent = { oggi: 'Oggi', agenda: 'Agenda & Storico', storico: 'Agenda & Storico', riepilogo: 'Riepilogo', strumenti: 'Strumenti', opzioni: 'Opzioni dell\'app', busta: 'Verifica busta paga', rep: 'Reperibilità', chiusure: 'Chiusure aziendali', parametri: 'Parametri orario' }[id] || 'Cronoflex';
  pagina.cur = id;
  pagina.lastDate = iso0(currentDate);
  if (id === 'agenda' && typeof setVistaAgenda === 'function') {
    setVistaAgenda(vistaAgendaCur);
  }
  try {
    sessionStorage.setItem('cf_cur_page', id);
    sessionStorage.setItem('cf_session_active', '1');
    localStorage.setItem('cf_last_page', id);
    localStorage.setItem('cf_last_active_ts', String(Date.now()));
  } catch (e) {}
  refresh();
  aggiornaBtnBackUI();
}
function refresh() {
  const p = pagina.cur || 'oggi';
  if (p === 'oggi') aggiornaSchermataOggi(); if (p === 'storico') caricaStorico(); if (p === 'riepilogo') caricaRiepilogo(); if (p === 'agenda') caricaAgenda(); if (p === 'busta') caricaBusta(); if (p === 'rep') caricaRep(); if (p === 'chiusure' || p === 'opzioni') caricaOpzioni(); if (p === 'parametri') caricaParametriOrario();
  const rd = reportDovuto(); $('repBanner').innerHTML = rd ? `<div class="alert">📄 Report di ${nomeMese(rd)} pronto: <a href="#" onclick="apriReport('${rd}');return false">aprilo</a></div>` : '';
}
const apriMenu = () => $('drawer').classList.toggle('open');

// ---------- Timbrature ----------
function quickTimbra(tipo) {
  const iso = iso0(currentDate);
  if (bloccato(iso)) return;
  const n = new Date();
  mut(() => S.t.push({ data: iso, ora: `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`, tipo, mancata: false, fittizia: false, autorizzata: false }));
  if (tipo === 'E') allineaSmartPomeridianoAEntrata(iso);
}
function apriTimb(tipo, ora, idx) {
  editIdx = idx === undefined ? null : idx; const n = new Date(), t = editIdx === null ? {} : S.t[editIdx];
  $('selTipoTimb').value = isTipoUscita(tipo) ? 'U' : 'E'; $('oraTimbManuale').value = ora || `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
  $('chkMancata').checked = !!t.mancata; $('chkRep').checked = !!t.rep; $('rowRep').style.display = inRep(editIdx === null ? iso0(currentDate) : t.data) ? 'flex' : 'none';
  $('titTimb').textContent = editIdx === null ? 'Aggiungi timbratura' : 'Modifica timbratura'; $('modalTimb').classList.add('active');
}
const modificaTimb = i => apriTimb(S.t[i].tipo, S.t[i].ora, i);
function salvaTimbraturaManuale() {
  const ora = $('oraTimbManuale').value, tipo = $('selTipoTimb').value, iso = editIdx === null ? iso0(currentDate) : S.t[editIdx].data; if (!ora || bloccato(iso)) return;
  const f = { ora: ora.replace(/^0/, ''), tipo, mancata: $('chkMancata').checked, rep: $('chkRep').checked, fittizia: false };
  mut(() => editIdx === null ? S.t.push({ data: iso, autorizzata: false, ...f }) : Object.assign(S.t[editIdx], f)); chiudiModal('modalTimb');
  if (tipo === 'E') allineaSmartPomeridianoAEntrata(iso);
  const mi = f.mancata && mancataInfo(iso); if (mi) toast(`Mancata timbratura n° ${mi.n} del mese${mi.oltre ? ` — oltre il limite di 1: +${mi.n - 1}` : ' (tollerata)'}`);
  else avvisaSeTettoBancaOre(iso);
}
const apriModal = id => $(id).classList.add('active'); const chiudiModal = id => $(id).classList.remove('active');

// ---------- Giustificativi (Tutta la giornata / Fascia oraria inizio-fine + Proposta automatica scoperto) ----------
let editGiustIdx = null;
const oreGiornata = () => currentDate.getDay() === 5 ? '6:00' : '8:00';
const oreGiornataMin = () => currentDate.getDay() === 5 ? (PARAMETRI.oreTeoricheVenerdi || 360) : (PARAMETRI.oreTeoricheLunGio || 480);

function calcolaPropostaScopertoDefault(iso) {
  const tG = tDay(iso), gG = gDay(iso);
  if (!tG.length && !gG.length) {
    return { tuttaGiornata: true, inizio: '', fine: '', hint: 'Nessuna timbratura presente: selezionata intera giornata.' };
  }
  const r = calcDay(iso);
  if (Array.isArray(r.scopertiOrari) && r.scopertiOrari.length > 0) {
    const sc = r.scopertiOrari[0];
    return {
      tuttaGiornata: false,
      inizio: sc.inizio,
      fine: sc.fine,
      hint: `Fascia scoperta rilevata dalle timbrature: <b>${sc.inizio} – ${sc.fine}</b> (${F(sc.durataMin)})`
    };
  }
  // Se la giornata è aperta con ritardo d'ingresso non ancora coperto (es. oggi mattina)
  const ent = tG.filter(t => t.tipo === 'E').sort((a, b) => P(a.ora) - P(b.ora))[0];
  if (ent && P(ent.ora) > PARAMETRI.fasciaIngressoFine && !gG.length) {
    const fineNorm = PARAMETRI.fasciaIngressoFine + Math.ceil((P(ent.ora) - PARAMETRI.fasciaIngressoFine) / 15) * 15;
    const sIni = T(PARAMETRI.fasciaIngressoFine), sFin = T(fineNorm);
    return {
      tuttaGiornata: false,
      inizio: sIni,
      fine: sFin,
      hint: `Ingresso alle ${ent.ora}: proposto scoperto <b>${sIni} – ${sFin}</b> (${F(fineNorm - PARAMETRI.fasciaIngressoFine)})`
    };
  }
  return { tuttaGiornata: !tG.length, inizio: '09:00', fine: '10:30', hint: '' };
}

function apriDialogGiustificativo(opts = null, idx = null) {
  editGiustIdx = (idx !== null && idx !== undefined) ? idx : null;
  const iso = iso0(currentDate);
  if ($('lblOreTuttaGiornata')) $('lblOreTuttaGiornata').textContent = T(oreGiornataMin());
  if ($('titModalGiust')) $('titModalGiust').textContent = editGiustIdx === null ? 'Nuovo giustificativo' : 'Modifica giustificativo';
  const hintEl = $('giustScopertoHint');

  if (editGiustIdx !== null && S.g[editGiustIdx]) {
    const g = S.g[editGiustIdx];
    $('selTipoGiust').value = isRecupero(g.tipo) ? 'ORE RECUPERO' : g.tipo;
    if (g.tipo === 'VISITA MEDICA') {
      $('visitaInizio').value = g.oraInizio || '12:00';
      $('visitaFine').value = g.oraFine || '12:30';
      $('chkTragittoPrima').checked = P(g.tragittoPrima) > 0;
      $('chkTragittoDopo').checked = P(g.tragittoDopo) > 0;
    } else {
      const isFull = !!g.tuttaGiornata || (!g.oraInizio && !g.oraFine && P(g.durata) >= oreGiornataMin());
      $('chkTuttaGiornata').checked = isFull;
      $('giustInizio').value = g.oraInizio || '09:00';
      $('giustFine').value = g.oraFine || '10:30';
      $('durataManuale').value = g.durata || oreGiornata();
      if ($('chkEccezioneSwInaz')) $('chkEccezioneSwInaz').checked = !!g.eccezioneSwInaz;
    }
    if (hintEl) { hintEl.style.display = 'none'; hintEl.innerHTML = ''; }
  } else {
    if ($('chkEccezioneSwInaz')) $('chkEccezioneSwInaz').checked = false;
    const prop = opts || calcolaPropostaScopertoDefault(iso);
    if (prop.tipoForce) {
      $('selTipoGiust').value = prop.tipoForce;
    } else if (['SCIOPERO', 'PAUSA NON TIMBRATA', 'STRAORDINARIO PAUSA'].includes($('selTipoGiust').value)) {
      $('selTipoGiust').value = 'FERIE';
    }
    $('chkTuttaGiornata').checked = !!prop.tuttaGiornata;
    const ini = prop.inizio || '09:00';
    const fin = prop.fine || '10:30';
    $('giustInizio').value = ini;
    $('giustFine').value = fin;
    $('visitaInizio').value = ini;
    $('visitaFine').value = fin;
    $('chkTragittoPrima').checked = false;
    $('chkTragittoDopo').checked = false;

    // Se lo scoperto è di soli 15 minuti e il tipo predefinito è FERIE (che richiede minimo 30m), preseleziona ORE RECUPERO o EX-FESTIVITÀ
    if (!prop.tuttaGiornata && !prop.tipoForce && P(fin) !== null && P(ini) !== null && (P(fin) - P(ini)) === 15 && $('selTipoGiust').value === 'FERIE') {
      $('selTipoGiust').value = residuo('EX-FESTIVITÀ', iso) >= 15 ? 'EX-FESTIVITÀ' : 'ORE RECUPERO';
    }

    if (hintEl) {
      if (prop.hint) {
        hintEl.innerHTML = `💡 ${prop.hint}`;
        hintEl.style.display = 'block';
      } else {
        hintEl.style.display = 'none';
        hintEl.innerHTML = '';
      }
    }
  }

  aggiornaFormGiust();
  aggiornaCampiOrarioGiust();
  if (!$('chkTuttaGiornata').checked && editGiustIdx === null) {
    ricalcolaDurataDaOrariGiust();
  }
  $('modalGiust').classList.add('active');
}

const modificaGiust = i => apriDialogGiustificativo(null, i);

function aggiornaCampiOrarioGiust() {
  const full = $('chkTuttaGiornata') && $('chkTuttaGiornata').checked;
  if ($('boxOrariGiust')) $('boxOrariGiust').style.display = full ? 'none' : 'block';
  const tipo = $('selTipoGiust') ? $('selTipoGiust').value : '';
  if ($('boxEccezioneSwInaz')) {
    $('boxEccezioneSwInaz').style.display = (tipo === 'SMART WORKING' && !full && !isVen(iso0(currentDate))) ? 'block' : 'none';
  }
  if (full) {
    if ($('durataManuale')) $('durataManuale').value = T(oreGiornataMin()).replace(/^0/, '');
    if ($('infoCalcoloOrariGiust')) $('infoCalcoloOrariGiust').textContent = '';
  } else {
    ricalcolaDurataDaOrariGiust();
  }
}

function ricalcolaDurataDaOrariGiust() {
  if ($('chkTuttaGiornata') && $('chkTuttaGiornata').checked) return;
  const iniStr = $('giustInizio') ? $('giustInizio').value : '';
  const finStr = $('giustFine') ? $('giustFine').value : '';
  const infoEl = $('infoCalcoloOrariGiust');
  if (!iniStr || !finStr) {
    if (infoEl) infoEl.textContent = '';
    return;
  }
  const ini = P(iniStr), fin = P(finStr);
  if (ini === null || fin === null || fin <= ini) {
    if (infoEl) infoEl.textContent = fin !== null && ini !== null && fin <= ini ? "L'ora di fine deve essere successiva all'ora di inizio." : '';
    return;
  }
  const iso = iso0(currentDate);
  let rawMin = fin - ini;
  let dedottaPausa = false;
  const pIni = PARAMETRI.pausaInizioFinestra || 735;
  if (!isVen(iso) && dow(iso) !== 0 && dow(iso) !== 6 && ini < pIni && fin > PARAMETRI.pausaFineFinestra && estraiPassaggi(tDay(iso)).uscite.length < 2 && !tDay(iso).some(t => t.tipo === 'U PAUSA')) {
    rawMin = Math.max(0, rawMin - PARAMETRI.pausaMinimaMinuti);
    dedottaPausa = true;
  }
  const tipo = $('selTipoGiust') ? $('selTipoGiust').value : 'FERIE';
  let calcMin = rawMin;
  if (tipo !== 'SMART WORKING' && calcMin > 0 && calcMin % 15 !== 0) {
    calcMin = Math.ceil(calcMin / 15) * 15;
  }
  const h = Math.floor(calcMin / 60), m = calcMin % 60;
  if ($('durataManuale')) $('durataManuale').value = `${h}:${String(m).padStart(2, '0')}`;
  if (infoEl) {
    const parts = [];
    if (dedottaPausa) parts.push(`dedotti ${PARAMETRI.pausaMinimaMinuti} min di pausa minima`);
    if (calcMin !== rawMin) parts.push(`arrotondato allo scatto di 15 min (${F(calcMin)})`);
    else parts.push(`fascia ${iniStr}–${finStr} = ${F(calcMin)}`);
    infoEl.textContent = parts.join(' · ');
  }
}

function aggiornaFormGiust() {
  const t = $('selTipoGiust').value, iso = iso0(currentDate), y = iso.slice(0, 4);
  if ($('lblOreTuttaGiornata')) $('lblOreTuttaGiornata').textContent = T(oreGiornataMin());
  // Sincronizza orari tra campi standard e visita medica se l'utente cambia tipo al volo
  if (t === 'VISITA MEDICA' && $('giustInizio').value && $('giustFine').value) {
    $('visitaInizio').value = $('giustInizio').value;
    $('visitaFine').value = $('giustFine').value;
  }
  $('visitaFields').style.display = t === 'VISITA MEDICA' ? 'block' : 'none';
  $('durataFields').style.display = TIPI_DURATA.includes(t) ? 'block' : 'none';
  const chkFull = $('chkTuttaGiornata');
  if (chkFull) {
    if (t === 'SMART WORKING' && isVen(iso)) {
      chkFull.checked = true;
      chkFull.disabled = true;
      aggiornaCampiOrarioGiust();
    } else {
      chkFull.disabled = false;
      if ($('boxEccezioneSwInaz')) {
        $('boxEccezioneSwInaz').style.display = (t === 'SMART WORKING' && !chkFull.checked) ? 'block' : 'none';
      }
    }
  }
  let r = residuo(t, iso);
  if (editGiustIdx !== null && S.g[editGiustIdx] && S.g[editGiustIdx].tipo === t && r !== null) {
    r += uso(S.g[editGiustIdx]);
  }
  const venSwNote = (t === 'SMART WORKING' && isVen(iso)) ? " · Di venerdì lo Smart Working è solo per l'intera giornata (6h)" : '';
  $('limiteInfo').textContent = t === 'SCIOPERO'
    ? `Intera giornata: ${T(oreGiornataMin()).slice(0, -3).replace(/^0/, '')} ore non retribuite`
    : t === 'CONGEDO PARENTALE'
      ? 'Retribuito al 30% · senza monte ore annuale'
      : r === null
        ? ''
        : t === 'ORE 4 NOVEMBRE' && !extra4Nov(y)
          ? 'Non maturate: serve aver lavorato il 4 novembre'
          : r <= 0
            ? 'Soglia raggiunta: inserimento bloccato' + venSwNote
            : `Residuo disponibile${t === 'SMART WORKING' ? ' questa settimana' : t === 'FERIE' && iso > y + '-06-30' && carryFerie(y) > carryUsato(y) ? ' (riporto scaduto il 30 giugno)' : ''}: ${F(r)}${venSwNote}`;
  if (TIPI_DURATA.includes(t) && !($('chkTuttaGiornata') && $('chkTuttaGiornata').checked)) {
    ricalcolaDurataDaOrariGiust();
  }
}

function completaInSmartDaPausa(iso, ini, fin) {
  currentDate = D(iso);
  apriDialogGiustificativo({
    tipoForce: 'SMART WORKING',
    tuttaGiornata: false,
    inizio: ini,
    fine: fin,
    hint: 'La timbratura di inizio pausa verrà convertita automaticamente in Uscita per chiudere la mezza giornata in sede.'
  });
}

async function allineaSmartPomeridianoAEntrata(iso) {
  if (!iso || isVen(iso)) return;
  const tG = tDay(iso);
  if (!tG.some(t => t.tipo === 'E') || tG.some(t => t.tipo === 'U')) return;
  const gSw = S.g.find(g => g.data === iso && g.tipo === 'SMART WORKING' && !g.tuttaGiornata && (!g.oraInizio || P(g.oraInizio) >= 720));
  if (!gSw) return;
  const c = calcolaGiornata(iso, tG, gDay(iso), null);
  if (!c.isSwPomeriggio || c.swPomeriggioInizioPrevisto === '--:--' || c.swPomeriggioFinePrevista === '--:--') return;
  if (gSw.oraInizio === c.swPomeriggioInizioPrevisto && gSw.oraFine === c.swPomeriggioFinePrevista) return;
  let evToSync = null;
  mut(() => {
    gSw.oraInizio = c.swPomeriggioInizioPrevisto;
    gSw.oraFine = c.swPomeriggioFinePrevista;
    const ev = gSw.id ? S.ev.find(e => e.giustId === gSw.id) : null;
    if (ev) {
      ev.ora = gSw.oraInizio;
      ev.oraFine = gSw.oraFine;
      if (isGoogleConfigured() && ev.syncGoogle !== false) {
        ev.pendingSync = ev.googleId ? 'update' : 'create';
      }
      evToSync = ev;
    }
  });
  if (evToSync && isGoogleConfigured()) {
    if (evToSync.googleId) await aggiornaEventoGoogle(evToSync);
    else await inviaEventoGoogle(evToSync);
  }
  toast(`Smart pomeridiano allineato a ${gSw.oraInizio}–${gSw.oraFine} (uscita sede ${c.uscitaTeorica}) ✓`);
}

function smartWorkingOrarioEv(g) {
  if (!g.tuttaGiornata && g.oraInizio && g.oraFine) {
    return { ora: g.oraInizio, oraFine: g.oraFine };
  }
  return { ora: '09:00', oraFine: isVen(g.data) ? '15:00' : '17:30' };
}

async function salvaGiustificativo() {
  const tipo = $('selTipoGiust').value, iso = iso0(currentDate), n = { data: iso, tipo };
  if (bloccato(iso)) return;
  const prevGiust = (editGiustIdx !== null && S.g[editGiustIdx]) ? S.g[editGiustIdx] : null;
  const chkExc = $('chkEccezioneSwInaz');
  const keepEccezioneSw = tipo === 'SMART WORKING' && (chkExc ? chkExc.checked : !!(prevGiust && prevGiust.tipo === 'SMART WORKING' && prevGiust.eccezioneSwInaz));

  if (tipo === 'VISITA MEDICA') {
    n.oraInizio = $('visitaInizio').value;
    n.oraFine = $('visitaFine').value;
    if (!n.oraInizio || !n.oraFine || P(n.oraFine) <= P(n.oraInizio)) return alert("Orario non valido: la fine deve essere successiva all'inizio.");
    n.tragittoPrima = $('chkTragittoPrima').checked ? '0:30' : '0:00';
    n.tragittoDopo = $('chkTragittoDopo').checked ? '0:30' : '0:00';
    n.tuttaGiornata = false;
  } else if (tipo === 'SCIOPERO') {
    if (S.g.some((g, idx) => idx !== editGiustIdx && g.data === iso && g.tipo === 'SCIOPERO')) return alert('Sciopero già registrato per questo giorno.');
    n.tuttaGiornata = true;
    n.oraInizio = '';
    n.oraFine = '';
    n.durata = T(oreGiornataMin()).replace(/^0/, '');
  } else if (TIPI_DURATA.includes(tipo)) {
    const isFull = (tipo === 'SMART WORKING' && isVen(iso)) || ($('chkTuttaGiornata') && $('chkTuttaGiornata').checked);
    if (isFull) {
      n.tuttaGiornata = true;
      n.oraInizio = '';
      n.oraFine = '';
      n.durata = T(oreGiornataMin()).replace(/^0/, '');
    } else {
      const ini = $('giustInizio').value;
      const fin = $('giustFine').value;
      if (!ini || !fin || P(fin) <= P(ini)) {
        return alert("Indica un orario di inizio e fine valido (oppure spunta 'Tutta la giornata').");
      }
      const d = ($('durataManuale').value || '').trim();
      const m = /^\d{1,2}:[0-5]\d$/.test(d) ? P(d) : 0;
      if (!m) return alert('Durata non valida: verifica gli orari di inizio e fine (es. 09:00 – 10:30).');
      if (tipo === 'SMART WORKING' && m > 240 && !keepEccezioneSw) return alert('Lo Smart Working di mezza giornata ha un limite massimo di 4 ore (4:00).');
      if (tipo !== 'SMART WORKING' && m % 15) return alert("Questo giustificativo si prende a scatti di 15 minuti.");
      if (tipo === 'FERIE' && m < 30) return alert("Per le Ferie il primo scatto minimo è di 30 minuti (per coprire 15 minuti scegli Ex-festività o Ore recupero, oppure estendi l'orario a 30 min).");
      n.tuttaGiornata = false;
      n.oraInizio = ini;
      n.oraFine = fin;
      n.durata = `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
      if (keepEccezioneSw) n.eccezioneSwInaz = true;
    }
  } else {
    n.tuttaGiornata = false;
    n.oraInizio = '';
    n.oraFine = '';
    n.durata = '0:30';
  }

  const req = uso(n);
  let r = residuo(tipo, iso);
  if (editGiustIdx !== null && S.g[editGiustIdx] && S.g[editGiustIdx].tipo === tipo && r !== null) {
    r += uso(S.g[editGiustIdx]);
  }
  if (r !== null && req > r && tipo !== 'SMART WORKING') {
    return alert(
      tipo === 'ORE RECUPERO' ? `Ore recupero insufficienti: disponibili ${F(Math.max(0, r))}, richieste ${F(req)}.\nSi sblocca accantonando altro straordinario.`
      : tipo === 'ORE 4 NOVEMBRE' ? `Ore 4 novembre disponibili: ${F(Math.max(0, r))}, richieste ${F(req)}.`
      : tipo === 'FERIE' ? `Ferie disponibili: ${F(Math.max(0, r))}, richieste ${F(req)}.\nIl riporto dell'anno scorso scade il 30 giugno.`
      : `Soglia annuale superata per ${tipo}: residuo ${F(Math.max(0, r))}, richieste ${F(req)}.\nBloccato fino al nuovo caricamento annuale.`
    );
  }

  const prevG = (editGiustIdx !== null && S.g[editGiustIdx]) ? { ...S.g[editGiustIdx] } : null;
  let swEvToSync = null;
  let swNeedsDelete = false;
  let pausaConvertitaInUscita = false;
  const chosenCal = getWritableSelectedGoogleCalendars()[0] || 'primary';
  const cache = (S.gcal && S.gcal.calCache) || [];
  const calMeta = cache.find(c => c.id === chosenCal) || {};

  mut(() => {
    if (n.tipo === 'SMART WORKING') {
      n.id = (prevG && prevG.id) || uid();
      if (!n.tuttaGiornata && (!n.oraInizio || P(n.oraInizio) >= 720)) {
        const tPausa = S.t.find(t => t.data === iso && !t.rep && t.tipo === 'U PAUSA');
        if (tPausa && !S.t.some(t => t.data === iso && !t.rep && (t.tipo === 'E PAUSA' || t.tipo === 'U'))) {
          tPausa.tipo = 'U';
          pausaConvertitaInUscita = true;
        }
      }
    }
    if (editGiustIdx !== null && S.g[editGiustIdx]) {
      S.g[editGiustIdx] = n;
    } else {
      S.g.push(n);
    }

    if (n.tipo === 'SMART WORKING') {
      const { ora, oraFine } = smartWorkingOrarioEv(n);
      let ev = S.ev.find(e => e.giustId === n.id || (prevG && prevG.id && e.giustId === prevG.id));
      if (ev) {
        ev.giustId = n.id;
        ev.data = n.data;
        ev.dataFine = n.data;
        ev.ora = ora;
        ev.oraFine = oraFine;
        ev.titolo = '💻 Smart Working';
        if (isGoogleConfigured() && ev.syncGoogle !== false) {
          ev.googleCalId = ev.googleCalId || chosenCal;
          ev.pendingSync = ev.googleId ? 'update' : 'create';
        }
      } else {
        ev = {
          id: uid(),
          giustId: n.id,
          data: n.data,
          dataFine: n.data,
          ora,
          oraFine,
          titolo: '💻 Smart Working',
          luogo: '',
          tipo: 'Lavoro',
          fuori: false,
          reminder: -1,
          concluso: false,
          syncGoogle: true
        };
        if (isGoogleConfigured()) {
          ev.googleCalId = chosenCal;
          ev.googleCalName = calMeta.summary || '';
          ev.googleCalColor = calMeta.backgroundColor || '#4285F4';
          ev.pendingSync = 'create';
        }
        S.ev.push(ev);
      }
      swEvToSync = ev;
    } else if (prevG && prevG.tipo === 'SMART WORKING') {
      const linked = S.ev.filter(e => (prevG.id && e.giustId === prevG.id) || (!prevG.id && e.data === prevG.data && e.titolo === '💻 Smart Working'));
      if (linked.length) {
        linked.forEach(ev => {
          if (ev.googleId && isGoogleConfigured()) {
            S.gcal = S.gcal || { connected: true, email: getGooglePrimaryEmail(), selectedCals: getGoogleSelectedCalendars(), calCache: [], dismissedIds: [], pendingDeletes: [] };
            S.gcal.pendingDeletes = S.gcal.pendingDeletes || [];
            if (!S.gcal.pendingDeletes.some(d => d.googleId === ev.googleId)) {
              S.gcal.pendingDeletes.push({ googleId: ev.googleId, calId: ev.googleCalId || chosenCal });
              swNeedsDelete = true;
            }
          }
        });
        const linkedIds = new Set(linked.map(e => e.id));
        S.ev = S.ev.filter(e => !linkedIds.has(e.id));
      }
    }
  });
  editGiustIdx = null;
  chiudiModal('modalGiust');

  if (pausaConvertitaInUscita) {
    toast('Smart Working salvato · Inizio pausa convertito in Uscita ✓');
  }
  if (n.tipo === 'SMART WORKING' && !n.tuttaGiornata && (!n.oraInizio || P(n.oraInizio) >= 720)) {
    await allineaSmartPomeridianoAEntrata(iso);
  }
  if (swEvToSync && isGoogleConfigured()) {
    if (swEvToSync.googleId) await aggiornaEventoGoogle(swEvToSync);
    else await inviaEventoGoogle(swEvToSync);
  } else if (swNeedsDelete && isGoogleConfigured()) {
    await eseguiPendingDeletesGoogle();
  }
}

// ---------- Storico ----------
let dataSceltaVuoto = null;
function apriSceltaVuoto(iso) {
  dataSceltaVuoto = iso;
  currentDate = D(iso);
  const elData = document.getElementById('sceltaVuotoData');
  if (elData) {
    const ds = D(iso).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    elData.textContent = cap(ds);
  }
  apriModal('modalSceltaVuoto');
}
function sceltaInserisciTimb() {
  chiudiModal('modalSceltaVuoto');
  apriTimb();
}
function sceltaInserisciGiust() {
  chiudiModal('modalSceltaVuoto');
  apriDialogGiustificativo({ tuttaGiornata: true, hint: 'Giornata senza timbrature: preimpostato giustificativo per tutta la giornata.' });
}
function fix(iso, f) {
  currentDate = D(iso);
  if (f === 'd' || f === 'att') {
    pagina('oggi');
    setTimeout(() => {
      const el = document.getElementById('attList');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
    return;
  }
  if (f === 'todo') {
    pagina('agenda');
    setTimeout(() => {
      const el = document.getElementById('agendaTodoList');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
    return;
  }
  if (f === 'ev') {
    pagina('agenda');
    setTimeout(() => {
      const el = document.getElementById('agList');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
    return;
  }
  if (f === 'nr') return apriSceltaVuoto(iso);
  if (f.startsWith('t:')) return apriTimb(f.slice(2), '');
  if (f === 't') return apriTimb();
  if (f === 'g:PAUSA') {
    return apriDialogGiustificativo({
      tuttaGiornata: false,
      tipoForce: 'PAUSA NON TIMBRATA',
      hint: 'Seleziona "Pausa non timbrata" (oppure "Straordinario pausa" se autorizzato).'
    });
  }
  if (f.startsWith('g:FULL')) {
    const parts = f.split(':');
    const tipoSuggested = parts[2] || 'FERIE';
    return apriDialogGiustificativo({
      tuttaGiornata: true,
      tipoForce: tipoSuggested,
      hint: 'Chiusura / assenza intera giornata preimpostata.'
    });
  }
  if (f.startsWith('g:') && f.includes('-')) {
    const range = f.slice(2);
    const [ini, fin] = range.split('-');
    const durMin = (P(fin) !== null && P(ini) !== null) ? Math.max(0, P(fin) - P(ini)) : 0;
    return apriDialogGiustificativo({
      tuttaGiornata: false,
      inizio: ini,
      fine: fin,
      hint: `Orari precompilati sullo scoperto rilevato: <b>${ini} – ${fin}</b>${durMin ? ` (${F(durMin)})` : ''}. Scegli il tipo e salva.`
    });
  }
  apriDialogGiustificativo();
}
function renderGiornoStorico(d) {
  const dd = D(d), td = tipoGiorno(d), tG = tDay(d), gG = gDay(d), has = tG.length || gG.length, el = document.createElement('div'); el.className = 'day';
  const ds = cap(dd.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'short' }));
  if (!has && (td.rip || td.fest)) {
    el.classList.add('quiet');
    el.innerHTML = `<div class="dh"><b>${ds}</b><span class="bd n">${td.fest ? 'FESTIVO' : 'RIPOSO'}${td.fest && td.rip ? ' (di riposo)' : ''}</span></div>`;
    return el;
  }
  const chiusa = giornataChiusa(d, tG);
  const r = calcDay(d), pr = pausaRaw(tG), al = chiusa ? alertGiorno(d) : [], mi = mancataInfo(d), nd = r.straordinarioNettoMin > 0, g = getDest(d) || (pienoBanca(d) ? 'PAGAMENTO' : null);
  const attInfo = infoOreAttivitaGiorno(d);
  const atts = S.att[d] || [];
  let totOreAtt = 0;
  atts.forEach(a => { totOreAtt += (typeof a.ore === 'number' ? a.ore : parseOreInput(a.ore)); });
  const targetOre = attInfo.targetOre;
  const attQuadrate = targetOre > 0 && atts.length > 0 && Math.abs(totOreAtt - targetOre) < 0.05;
  const attMancanti = chiusa && targetOre > 0 && !atts.length;
  const attSquadrate = chiusa && targetOre > 0 && atts.length > 0 && !attQuadrate;
  const todoAperti = (S.todo || []).filter(x => x.data === d && !x.fatto).length;
  const tuttoCompleto = chiusa && has && al.length === 0;
  const giustBadges = badgesGiustStoricoHTML(gG, r);

  // Riga dettagli: distingue nettamente assenza totale, giustificativo parziale e lavoro ordinario
  let dmHTML = '';
  if (has) {
    const uscTxt = (r.uscitaConteggiata && r.uscitaConteggiata !== r.ultimaUscita && r.uscitaConteggiata !== '--:--')
      ? `${r.ultimaUscita} (→${r.uscitaConteggiata})`
      : r.ultimaUscita;
    if (attInfo.assenteTuttoGiorno) {
      const tipiAss = [...new Set(gG.map(x => x.tipo))].join(', ');
      dmHTML = `<div class="dm"><span style="color:#5b21b6;font-weight:700">Assenza intera giornata: ${F(attInfo.assenzaMin)} (${tipiAss})</span><span>Lavorate: 0h 00m</span></div>`;
    } else if (!tG.length && attInfo.smartMin > 0) {
      dmHTML = `<div class="dm"><span style="color:#0b5cad;font-weight:700">Smart Working: ${F(attInfo.smartMin)}</span>${targetOre > 0 ? `<span>Attività: ${totOreAtt.toFixed(2)}h/${targetOre.toFixed(2)}h</span>` : ''}</div>`;
    } else if (r.oreGiustificateMin > 0) {
      const tipiG = [...new Set(gG.filter(x => x.tipo !== 'PAUSA NON TIMBRATA' && x.tipo !== 'STRAORDINARIO PAUSA').map(x => x.tipo))].join(', ');
      dmHTML = `<div class="dm"><span>E ${r.entrataNorm}</span><span>U ${uscTxt}</span><span>Lavorate <b>${F(r.oreLavorateMin)}</b></span><span style="color:#5b21b6;font-weight:700">+ Giustif. ${F(r.oreGiustificateMin)}${tipiG ? ` (${tipiG})` : ''}</span><span>Tot. ${F(r.oreTotaliSvolteMin)}</span>${pr !== null ? `<span>Pausa ${pr} min</span>` : ''}${nd ? `<span class="am">Str. +${r.straordinarioNettoMin}m</span>` : ''}${targetOre > 0 ? `<span>Attività: ${totOreAtt.toFixed(2)}h/${targetOre.toFixed(2)}h</span>` : ''}</div>`;
    } else {
      dmHTML = `<div class="dm"><span>E ${r.entrataNorm}</span><span>U ${uscTxt}</span><span>Lavorate ${F(r.oreLavorateMin)}</span><span>Pausa ${pr === null ? '—' : pr + ' min'}</span><span class="${nd ? 'am' : ''}">Str. ${nd ? '+' + r.straordinarioNettoMin + 'm' : '0'}</span>${targetOre > 0 ? `<span>Attività: ${totOreAtt.toFixed(2)}h/${targetOre.toFixed(2)}h</span>` : ''}</div>`;
    }
  }

  el.innerHTML = `<div class="dh"><b>${ds}</b><span style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;justify-content:flex-end">`
    + giustBadges
    + (tuttoCompleto
        ? '<span class="bd g" style="font-weight:700">✓ GIORNATA COMPLETATA</span> '
        : `${!chiusa && has ? '<span class="bd t">IN CORSO</span> ' : ''}`
          + `${chiusa && has && al.length > 0 ? `<span class="bd am" style="font-weight:700">⚠ DA SISTEMARE (${al.length})</span> ` : ''}`
          + `${has && ticketGiorno(d) ? '<span class="bd g">TICKET ✓</span> ' : ''}`
          + `${attMancanti ? '<span class="bd x">NO ATTIVITÀ</span> ' : attSquadrate ? '<span class="bd am">ATTIVITÀ ≠ ORE</span> ' : ''}`
          + `${todoAperti > 0 ? `<span class="bd am">TO-DO (${todoAperti})</span> ` : ''}`
          + `${mi ? `<span class="bd x">MANCATA${mi.oltre ? ` +${mi.n - 1}` : ''}</span> ` : ''}`
          + `${repTipoGiorno(d) === '1SQ' ? '<span class="bd r">REP 1° SQ</span> ' : repTipoGiorno(d) === '2SQ' ? '<span class="bd t">RINCALZO 2° SQ</span> ' : ''}`
          + `${S.ver[d.slice(0, 7)] ? '<span class="bd g">VERIFICATO</span>' : ''}`
      )
    + `<button class="ib" onclick="currentDate=D('${d}');pagina('oggi')" aria-label="Apri giornata">${IC.pen}</button></span></div>`
    + dmHTML
    + `${al.length ? `<div class="chips">${al.map(a => `<button class="chip" onclick="fix('${d}','${a.f || 'd'}')">${a.t}</button>`).join('')}</div>` : ''}`
    + `${nd && !S.ver[d.slice(0, 7)] ? (pienoBanca(d) ? `<div class="alert" style="margin-top:8px;margin-bottom:0">⚠ Monte ore raggiunto (${F(PARAMETRI.tettoBancaOre)}): straordinario automaticamente in Pagamento</div>` : `<div class="${g ? '' : 'warn'}" style="margin-top:8px">${g ? '' : '⚠ Scegli: '}${segHTML(d, g, false)}</div>`) : ''}`;
  return el;
}

const storicoOpenMesi = new Set();
let storicoOpenInit = false;

function caricaStorico() {
  const box = $('storicoList');
  const prevDetails = box.querySelectorAll('details.storico-mese[data-ym]');
  if (prevDetails.length > 0) {
    storicoOpenInit = true;
    storicoOpenMesi.clear();
    prevDetails.forEach(d => { if (d.open) storicoOpenMesi.add(d.dataset.ym); });
  }
  box.innerHTML = '';
  const datePresenti = giorniConDati();
  const tISO = todayISO();
  const ymSet = new Set(datePresenti.map(d => d.slice(0, 7)));
  ymSet.add(tISO.slice(0, 7)); // include sempre il mese corrente

  // Mesi ordinati dal più recente al più vecchio
  const mesiSorted = Array.from(ymSet).sort().reverse();

  if (!mesiSorted.length) {
    box.innerHTML = '<div style="color:var(--muted);text-align:center;padding:20px">Nessuna data registrata</div>';
    return;
  }

  mesiSorted.forEach((ym, idx) => {
    const y = +ym.slice(0, 4), m = +ym.slice(5, 7);
    const nomeMese = cap(MESI[m - 1]) + ' ' + y;
    const numGiorni = ultimoMese(y, m);
    
    // Trova tutti i giorni del mese che hanno dati o rientrano nel mese fino a oggi se mese corrente
    const giorniMese = [];
    for (let day = numGiorni; day >= 1; day--) {
      const d = ym + '-' + String(day).padStart(2, '0');
      // se è il mese corrente, mostra fino a oggi; se è un mese passato, mostra se ci sono dati o tutti i giorni
      if (d <= tISO || datePresenti.includes(d)) {
        giorniMese.push(d);
      }
    }

    // Statistiche rapide del mese per l'intestazione dell'accordion
    let countDati = 0;
    giorniMese.forEach(d => { if (tDay(d).length || gDay(d).length) countDati++; });

    const details = document.createElement('details');
    details.className = 'card storico-mese';
    details.dataset.ym = ym;
    // Aperto di default il primo mese con dati oppure il primo dell'elenco se ha dati
    const primoConDati = mesiSorted.find(m => datePresenti.some(d => d.startsWith(m)));
    if (storicoOpenInit) {
      details.open = storicoOpenMesi.has(ym);
    } else if (ym === primoConDati || (idx === 0 && countDati > 0)) {
      details.open = true;
      storicoOpenMesi.add(ym);
    }
    details.addEventListener('toggle', () => {
      storicoOpenInit = true;
      if (details.open) storicoOpenMesi.add(ym);
      else storicoOpenMesi.delete(ym);
    });

    const summary = document.createElement('summary');
    summary.style.cssText = 'cursor:pointer;font-weight:700;display:flex;justify-content:space-between;align-items:center;padding:6px 0;user-select:none;color:var(--navy);font-size:1.05rem;';
    summary.innerHTML = `<span>📅 ${nomeMese}</span><span style="font-size:.78rem;font-weight:600;color:var(--muted);background:var(--line);padding:2px 8px;border-radius:10px;">${countDati} gg con dati</span>`;
    details.appendChild(summary);

    const contentDiv = document.createElement('div');
    contentDiv.style.marginTop = '12px';

    giorniMese.forEach(d => {
      contentDiv.appendChild(renderGiornoStorico(d));
    });

    details.appendChild(contentDiv);
    box.appendChild(details);
  });
}

// ---------- Riepilogo, report, navigazione mesi ----------
function navMese(d) { rie.m += d; if (rie.m < 1) { rie.m = 12; rie.y--; } if (rie.m > 12) { rie.m = 1; rie.y++; } refresh(); }
function setNav(y, m) { rie.y = +y; rie.m = +m; refresh(); }
function navHTML() { const ys = []; for (let y = primoAnno(); y <= new Date().getFullYear() + 1; y++) ys.push(y);
  return `<div class="nav2"><button class="ib" onclick="navMese(-1)" aria-label="Mese precedente">‹</button><select onchange="setNav(rie.y,this.value)">${MESI.map((m, i) => `<option value="${i + 1}" ${i + 1 === rie.m ? 'selected' : ''}>${cap(m)}</option>`).join('')}</select><select onchange="setNav(this.value,rie.m)">${ys.map(y => `<option ${y === rie.y ? 'selected' : ''}>${y}</option>`).join('')}</select><button class="ib" onclick="navMese(1)" aria-label="Mese successivo">›</button></div>`; }
function datiMese(ym) {
  const y = ym.slice(0, 4), rp = ripartoAnno(y), p = pzAttivo(y), m = { lav: 0, ord: 0, giu: 0, ban: 0, pag: 0, nd: 0, tk: 0, gt: {}, festInf: 0, festRip: [], att: {} };
  giorniConDati().filter(d => d.startsWith(ym) && (!p || d > p.data)).forEach(d => {
    const r = calcDay(d), x = rp[d] || { ban: 0, pag: 0, nd: 0 };
    m.lav += r.oreLavorateMin;
    m.ord += r.oreOrdinarieMin;
    m.giu += r.oreGiustificateMin;
    m.ban += x.ban;
    m.pag += x.pag;
    m.nd += x.nd;
    if (ticketGiorno(d)) m.tk++;
    if (r.giustPerTipo) {
      Object.entries(r.giustPerTipo).forEach(([tp, minVal]) => {
        const k = isRecupero(tp) ? 'ORE RECUPERO' : tp;
        m.gt[k] = (m.gt[k] || 0) + minVal;
      });
    }
  });
  const rg = repGiorniMese(ym);
  m.sw = m.gt['SMART WORKING'] || 0; m.sc = m.gt['SCIOPERO'] || 0; m.mancate = mancateMese(ym);
  m.repGg1 = rg.gg1; m.repGg2 = rg.gg2; m.repMin = repMin(ym);
  for (let d = 1; d <= ultimoMese(+y, +ym.slice(5)); d++) {
    const i = `${ym}-${String(d).padStart(2, '0')}`, t = tipoGiorno(i);
    if (t.fest && t.rip) m.festRip.push(i);
    if (t.fest && !t.rip) m.festInf += (isVen(i) ? 360 : 480);
    (S.att[i] || []).forEach(a => m.att[a.cat] = (m.att[a.cat] || 0) + 1);
  }
  const lastD = String(ultimoMese(+y, +ym.slice(5))).padStart(2, '0');
  const ymStart = `${ym}-01`, ymEnd = `${ym}-${lastD}`;
  m.ev = S.ev.filter(e => e.data <= ymEnd && evFine(e) >= ymStart).sort((a, b) => (a.data + (a.ora || '')).localeCompare(b.data + (b.ora || ''))); return m;
}
const R = (a, b, w) => `<div class="row"><span>${a}</span><b${w ? ' style="color:var(--danger)"' : ''}>${b}</b></div>`;
function righeMese(m) {
  const ob = Math.max(0, m.mancate.length - 1);
  return R('Ore ordinarie (INAZ ORD)', F(m.ord)) + R('Ore lavorate in sede (effettive)', F(m.lav)) + R('Smart working', F(m.sw)) + R('Ore giustificate', F(m.giu - m.sw - m.sc)) + (m.festInf ? R('Festività infrasettimanali (incluse in GIUS INAZ)', F(m.festInf)) : '') + R('Sciopero (non retribuito)', F(m.sc)) + R('Straordinario in monte ore', F(m.ban)) + R('Straordinario in pagamento', F(m.pag)) + (m.nd ? R('Straordinario da assegnare', F(m.nd), 1) : '') + R('Ticket maturati', m.tk)
    + R('Mancate timbrature', `${m.mancate.length}${ob ? ` (${ob} oltre il limite)` : ''}`, ob)
    + R('Giorni reperibilità 1° squadra', `${m.repGg1} gg`)
    + R('Giorni rincalzo 2° squadra', `${m.repGg2} gg`)
    + R('Ore di reperibilità (1° + 2° sq.)', F(m.repMin))
    + (m.festRip.length ? R('Festivi caduti di riposo (da verificare in busta)', m.festRip.map(d => d.slice(8) + '/' + d.slice(5, 7)).join(', ')) : '');
}
function caricaRiepilogo() {
  const ym = ymStr(rie.y, rie.m), y = String(rie.y), m = datiMese(ym), ver = !!S.ver[ym], rga = repGiorniAnno(y); $('rieNav').innerHTML = navHTML();
  $('rieMese').innerHTML = `<div class="h">${cap(nomeMese(ym))}${ver ? ' · verificato ✓' : ''}</div>` + righeMese(m) + `<div class="foot"><button class="btn" onclick="apriReport('${ym}')">Report del mese</button><button class="btn ${ver ? '' : 'main'}" onclick="toggleVer('${ym}')">${ver ? 'Sblocca mese' : 'Segna come verificato'}</button></div>`;
  const acc = accantonatoAnno(y), usate = usatoAnno('ORE RECUPERO', y), e4 = extra4Nov(y), cf = carryFerie(y), fr = residuoFerie(y + '-12-31');
  const recRip = bancaRip(y), recLim = recRip + acc, recRes = Math.max(0, recLim - usate);
  const bar = (l, u, maxH, note) => `<div class="f"><div class="row" style="border:0;padding:0"><span>${l}</span><b>${F(u)} / ${F(maxH * 60)}</b></div><div class="bar"><i style="width:${maxH ? Math.min(100, u / (maxH * 60) * 100) : 0}%${u > maxH * 60 ? ';background:var(--danger)' : ''}"></i></div>${note ? `<small class="note">${note}</small>` : ''}</div>`;
  $('rieAnno').innerHTML = `<div class="h">Saldi ${y}</div>` + bar('Ferie usate (anno + riporto)', usatoAnno('FERIE', y), (FERIE_ANNO + cf) / 60, `Riporto dall'anno scorso ${F(cf)} (da usare entro il 30/06) · residuo a fine anno ${F(Math.max(0, fr))}`)
    + bar('Monte ore accantonato nell\'anno', acc, 40, bancaAbilitata(y) ? `Puoi ancora accantonare ${F(accantonabile(y))}` : 'Accantonamento non attivo: a fine anno scorso restavano più di 50h di ferie')
    + bar('Ore recupero (usate / disponibili)', usate, recLim / 60, `Riporto ${F(recRip)} + accantonato ${F(acc)} · residuo ${F(recRes)} (non scade)${usate > recLim ? ' · ⚠ superato di ' + F(usate - recLim) : ''}`)
    + bar('Ex-festività (si azzerano a fine anno)', usatoAnno('EX-FESTIVITÀ', y), 30) + (e4 ? bar('Ore 4 novembre (si azzerano)', usatoAnno('ORE 4 NOVEMBRE', y), 8) : R('Ore 4 novembre (extra)', 'non maturate'))
    + bar('Visite mediche (si azzerano)', usatoAnno('VISITA MEDICA', y), 30) + R('Malattia annua usata', F(usatoAnno('MALATTIA', y))) + R('Congedo parentale annuo (30%)', F(usatoAnno('CONGEDO PARENTALE', y))) + R('Smart working annuo', F(usatoAnno('SMART WORKING', y))) + R('Sciopero annuo', F(usatoAnno('SCIOPERO', y)))
    + R('Giorni reperibilità 1° squadra (anno)', `${rga.gg1} gg`)
    + R('Giorni rincalzo 2° squadra (anno)', `${rga.gg2} gg`);
  $('pzInfo').textContent = S.pz ? `Punto zero attivo dal ${S.pz.data.split('-').reverse().join('/')}.` : 'Nessun punto zero impostato.';
}
function toggleVer(ym) { if (S.ver[ym]) { if (!confirm('Sbloccare il mese per poterlo modificare?')) return; mut(() => delete S.ver[ym]); } else { if (!confirm(`Confermi che ${nomeMese(ym)} è stato verificato con la busta paga? Verrà bloccato in modifica.`)) return; mut(() => S.ver[ym] = true); } }
function apriReport(ym) {
  const m = datiMese(ym), g = Object.keys(m.gt).map(k => R(k, F(m.gt[k]))).join('') || '<div class="empty">Nessuno</div>', at = Object.keys(m.att).map(k => R(k, m.att[k] + ' giornate')).join('') || '<div class="empty">Nessuna attività registrata</div>';
  const ev = m.ev.map(e => { const t = tDay(e.data).length, sw = gDay(e.data).some(x => x.tipo === 'SMART WORKING'); const dLbl = isMultiGiorno(e) ? `${fmtShortDM(e.data)}→${fmtShortDM(evFine(e))}` : fmtShortDM(e.data); return R(`${dLbl} ${e.ora || ''} ${e.titolo}${e.luogo ? ' · ' + e.luogo : ''}`, `${t ? 'in sede' : sw ? 'smart' : 'assente'}${e.fuori ? ' · fuori sede' : ''}`); }).join('') || '<div class="empty">Nessun impegno</div>';
  $('reportBody').innerHTML = `<h3>Report ${cap(nomeMese(ym))}</h3><div class="h">Ore e straordinari</div>${righeMese(m)}<div class="h" style="margin-top:12px">Giustificativi</div>${g}<div class="h" style="margin-top:12px">Attività svolte</div>${at}<div class="h" style="margin-top:12px">Agenda e presenza</div>${ev}<div class="h" style="margin-top:12px">Mancate timbrature</div>${m.mancate.map(t => R(t.data.split('-').reverse().join('/'), t.tipo + ' ' + t.ora)).join('') || '<div class="empty">Nessuna</div>'}`;
  $('modalReport').classList.add('active');
}
const reportTrigger = () => { const n = new Date(); return Math.min(30, ultimoMese(n.getFullYear(), n.getMonth() + 1)); };
function reportDovuto() { const n = new Date(); if (n.getDate() < reportTrigger()) return null; const p = new Date(n.getFullYear(), n.getMonth() - 1, 1), ym = ymStr(p.getFullYear(), p.getMonth() + 1); return S.ver[ym] ? null : ym; }

// ---------- Busta paga (confronto) ----------
const BF = [
  ['bStr', 'Straordinario pagato', 'pag'],
  ['bBan', 'Straordinario in monte ore', 'ban'],
  ['bTk', 'Ticket', 'tk'],
  ['bRepGg1', 'Giorni reperibilità 1° squadra', 'repGg1'],
  ['bRepGg2', 'Giorni rincalzo 2° squadra', 'repGg2'],
  ['bRep', 'Ore reperibilità (1° + 2° sq.)', 'rep']
];
const isNumBustaKey = k => k === 'tk' || k === 'repGg1' || k === 'repGg2';
function caricaBusta() {
  const ym = ymStr(rie.y, rie.m), m = datiMese(ym), b = S.busta[ym] || {}, mine = { pag: m.pag, ban: m.ban, tk: m.tk, repGg1: m.repGg1, repGg2: m.repGg2, rep: m.repMin }; $('bNav').innerHTML = navHTML();
  $('bForm').innerHTML = BF.map(([id, l, k]) => `<div class="f"><label>${l} (da busta, ${isNumBustaKey(k) ? 'numero' : 'h:mm'})</label><input type="text" id="${id}" value="${b[k] || ''}"><small class="note">App: ${isNumBustaKey(k) ? mine[k] : F(mine[k])}</small></div>`).join('');
  const val = (k, s) => isNumBustaKey(k) ? +s : P(s); $('bEsito').innerHTML = BF.map(([id, l, k]) => { if (b[k] === undefined || b[k] === '') return ''; const d = val(k, b[k]) - mine[k]; return `<div class="row"><span>${l}</span><b style="color:var(--${d ? 'danger' : 'green'})">${d ? 'differenza ' + (isNumBustaKey(k) ? (d > 0 ? '+' + d : d) : (d > 0 ? '+' : '−') + F(Math.abs(d))) : '✓ coincide'}</b></div>`; }).join('');
  $('bVer').textContent = S.ver[ym] ? 'Sblocca mese' : 'Segna mese come verificato';
}
function salvaBusta() { const ym = ymStr(rie.y, rie.m); mut(() => S.busta[ym] = Object.fromEntries(BF.map(([id, l, k]) => [k, $(id).value.trim()]))); }
const toggleVerBusta = () => toggleVer(ymStr(rie.y, rie.m));

// ---------- Agenda, reperibilità ----------
function caricaAgenda() {
  const ym = ymStr(rie.y, rie.m);
  $('agNav').innerHTML = navHTML();
  const numG = ultimoMese(rie.y, rie.m);
  const ymStart = `${ym}-01`, ymEnd = `${ym}-${String(numG).padStart(2, '0')}`;

  // 1. Raggruppa Appuntamenti del mese per giorno (espandendo gli eventi multi-giorno)
  const evPerGiorno = {};
  S.ev.forEach(e => {
    const fine = evFine(e);
    if (fine < ymStart || e.data > ymEnd) return;
    const dCur = D(e.data < ymStart ? ymStart : e.data);
    const dLim = D(fine > ymEnd ? ymEnd : fine);
    while (dCur <= dLim) {
      const dIso = iso0(dCur);
      (evPerGiorno[dIso] = evPerGiorno[dIso] || []).push(e);
      dCur.setDate(dCur.getDate() + 1);
    }
  });
  Object.keys(evPerGiorno).forEach(k => {
    evPerGiorno[k].sort((a, b) => ((k === a.data ? (a.ora || '00:00') : '00:00')).localeCompare(k === b.data ? (b.ora || '00:00') : '00:00'));
  });

  // 2. Render Elenco & Storico del mese: giornate (dal più recente al più vecchio) + appuntamenti del giorno
  const agBox = $('agList');
  agBox.innerHTML = '';
  const tISO = todayISO();
  const datePresenti = new Set(giorniConDati());
  let countRender = 0;
  for (let day = numG; day >= 1; day--) {
    const d = ym + '-' + String(day).padStart(2, '0');
    const evs = evPerGiorno[d] || [];
    if (d <= tISO || datePresenti.has(d) || evs.length) {
      const card = giornoEl(d);
      if (evs.length) {
        card.classList.remove('quiet');
        const evWrap = document.createElement('div');
        evWrap.style.cssText = 'margin-top:8px;padding-top:6px;border-top:1px dashed var(--line)';
        evWrap.innerHTML = `<div style="font-size:0.75rem;font-weight:700;color:var(--blue);margin-bottom:4px">📌 Appuntamenti</div>${evs.map(e => rowEv(e, d)).join('')}`;
        card.appendChild(evWrap);
      }
      agBox.appendChild(card);
      countRender++;
    }
  }
  if (!countRender) {
    agBox.innerHTML = '<div class="empty">Nessuna giornata o appuntamento in questo mese</div>';
  }

  // 2. Render To-Do (Da fare) con scadenze nel mese
  renderAgendaTodos(ym);
  if (vistaAgendaCur === 'mese') renderVistaMeseGriglia(ym);
}

function renderAgendaTodos(ym) {
  const box = $('agendaTodoList');
  if (!box) return;
  const tList = (S.todo || []).filter(x => !x.data || x.data.startsWith(ym)).sort((a, b) => (a.data || '').localeCompare(b.data || ''));
  const completati = tList.filter(x => x.fatto).length;
  
  const badge = $('todoBadgeMese');
  if (badge) badge.textContent = tList.length ? `${completati}/${tList.length} completati` : '';

  if ($('agTodoData') && !$('agTodoData').value) {
    $('agTodoData').value = todayISO();
  }

  box.innerHTML = tList.length ? tList.map(x => {
    const dStr = x.data ? D(x.data).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }) : 'Senza data';
    const isOggi = x.data === todayISO();
    const scaduto = x.data && x.data < todayISO() && !x.fatto;
    return `<div class="tl" style="align-items:center;${x.fatto ? 'opacity:0.6;' : ''}">
      <label class="nm chk" style="margin:0;flex:1;display:flex;align-items:center;gap:8px">
        <input type="checkbox" ${x.fatto ? 'checked' : ''} onchange="togTodo('${x.id}')">
        <span style="${x.fatto ? 'text-decoration:line-through;color:var(--muted)' : 'font-weight:500'}">${x.testo}</span>
      </label>
      <span class="bd ${isOggi ? 't' : scaduto ? 'x' : 'n'}" style="font-size:0.7rem;margin-right:8px" title="Scadenza">
        ${isOggi ? 'Oggi' : scaduto ? 'Scaduto (' + dStr + ')' : dStr}
      </span>
      <button class="ib d" onclick="delTodo('${x.id}')" aria-label="Elimina">${IC.bin}</button>
    </div>`;
  }).join('') : '<div class="empty">Nessuna attività in To-Do per questo mese</div>';
}

function addTodoAgenda() {
  const inp = $('agTodoIn');
  const t = inp ? inp.value.trim() : '';
  if (!t) return;
  const dInp = $('agTodoData');
  const dVal = (dInp && dInp.value) ? dInp.value : iso0(currentDate);
  mut(() => {
    S.todo = S.todo || [];
    S.todo.push({ id: uid(), data: dVal, testo: t, fatto: false });
  });
  if (inp) inp.value = '';
  caricaAgenda();
  if (fired()[todayISO() + '_eodtodo']) aggiornaNotificaTodoFineGiornata(false);
  toast('Attività aggiunta al To-Do! ✓');
}

let editRepId = null;

function allineaImpegniReperibilita() {
  if (!Array.isArray(S.rep)) { S.rep = []; return false; }
  S.ev = S.ev || [];
  let changed = false;
  S.rep.forEach(r => {
    if (!r.id) { r.id = uid(); changed = true; }
    if (!r.cat) { r.cat = '1SQ'; changed = true; }
    const titoloAtteso = repTitoloAgenda(repCat(r));
    let ev = S.ev.find(e => (r.evId && e.id === r.evId) || e.repId === r.id);
    if (!ev && !r.evLinked) {
      ev = S.ev.find(e => e.data === r.da && evFine(e) === r.a && /Reperibilit|Rincalzo/i.test(e.titolo || ''));
    }
    if (ev) {
      if (r.evId !== ev.id || ev.repId !== r.id || !r.evLinked) {
        r.evId = ev.id;
        ev.repId = r.id;
        r.evLinked = true;
        changed = true;
      }
      if (ev.data !== r.da || evFine(ev) !== r.a || ev.ora !== '08:00' || ev.oraFine !== '08:00' || ev.titolo !== titoloAtteso) {
        ev.data = r.da;
        ev.dataFine = r.a;
        ev.ora = '08:00';
        ev.oraFine = '08:00';
        ev.titolo = titoloAtteso;
        if (ev.googleId && ev.syncGoogle !== false) ev.pendingSync = 'update';
        changed = true;
      }
    } else if (!r.evLinked) {
      const newEvId = uid();
      S.ev.push({
        id: newEvId,
        repId: r.id,
        data: r.da,
        dataFine: r.a,
        ora: '08:00',
        oraFine: '08:00',
        titolo: titoloAtteso,
        luogo: '',
        tipo: 'Lavoro',
        fuori: false,
        reminder: -1,
        concluso: false,
        syncGoogle: true
      });
      r.evId = newEvId;
      r.evLinked = true;
      changed = true;
    }
  });
  return changed;
}

function contaGiorniRange(da, a) {
  if (!da || !a || a < da) return 0;
  return Math.round((D(a) - D(da)) / 86400000) + 1;
}

function caricaRep() {
  const ym = ymStr(rie.y, rie.m), y = String(rie.y);
  $('rpNav').innerHTML = navHTML();
  const rgMese = repGiorniMese(ym);
  const rgAnno = repGiorniAnno(y);
  const oreMese = repMin(ym);

  if ($('rpRiepilogoBox')) {
    $('rpRiepilogoBox').innerHTML =
      R(`Giorni reperibilità 1° squadra (${cap(nomeMese(ym))})`, `${rgMese.gg1} gg (anno ${y}: ${rgAnno.gg1} gg)`) +
      R(`Giorni rincalzo 2° squadra (${cap(nomeMese(ym))})`, `${rgMese.gg2} gg (anno ${y}: ${rgAnno.gg2} gg)`) +
      R(`Ore uscita reperibilità 1° + 2° sq. (${cap(nomeMese(ym))})`, F(oreMese));
  }

  $('rpList').innerHTML = [...S.rep].sort((a, b) => a.da.localeCompare(b.da)).map(r => {
    const c = repCat(r);
    const badgeCls = c === '2SQ' ? 't' : 'r';
    const badgeTxt = c === '2SQ' ? 'RINCALZO 2° SQ' : '1° SQUADRA';
    const nGg = contaGiorniRange(r.da, r.a);
    const key = r.id || r.da;
    return `<div class="tl" style="align-items:center">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span class="bd ${badgeCls}" style="font-size:0.68rem">${badgeTxt}</span>
          <b>${r.da.split('-').reverse().join('/')} → ${r.a.split('-').reverse().join('/')}</b>
          <span class="bd n" style="font-size:0.66rem">${nGg} gg</span>
        </div>
        <small style="color:var(--muted)">promemoria il ${repReminderDay(r.da).split('-').reverse().join('/')} · presente in Agenda ✓</small>
      </div>
      <button class="ib" onclick="modificaRep('${key}')" aria-label="Modifica" title="Modifica">${IC.pen}</button>
      <button class="ib d" onclick="delRep('${key}')" aria-label="Elimina" title="Elimina">${IC.bin}</button>
    </div>`;
  }).join('') || '<div class="empty">Nessun periodo di reperibilità o rincalzo registrato</div>';

  if ($('rpOre')) {
    $('rpOre').textContent = `Le ore lavorate con flag "In reperibilità" vengono sommate in un unico contatore sia per la 1° squadra sia per il rincalzo 2° squadra (${F(oreMese)} a ${nomeMese(ym)}).`;
  }
}

function setRepCatUI(cat) {
  if ($('rpCat')) $('rpCat').value = cat;
  if ($('btnRep1Sq')) $('btnRep1Sq').classList.toggle('on', cat === '1SQ');
  if ($('btnRep2Sq')) $('btnRep2Sq').classList.toggle('on', cat === '2SQ');
}

function modificaRep(key) {
  const r = S.rep.find(x => x.id === key || x.da === key);
  if (!r) return;
  editRepId = r.id || r.da;
  setRepCatUI(repCat(r));
  $('rpDa').value = r.da;
  $('rpA').value = r.a;
  if ($('btnSalvaRep')) $('btnSalvaRep').textContent = '💾 Aggiorna periodo reperibilità';
  if ($('btnAnnullaEditRep')) $('btnAnnullaEditRep').style.display = 'inline-block';
}

function annullaEditRep() {
  editRepId = null;
  setRepCatUI('1SQ');
  $('rpDa').value = '';
  $('rpA').value = '';
  if ($('btnSalvaRep')) $('btnSalvaRep').textContent = '+ Aggiungi reperibilità e inserisci in Agenda';
  if ($('btnAnnullaEditRep')) $('btnAnnullaEditRep').style.display = 'none';
}

async function addRep() {
  const da = $('rpDa').value, a = $('rpA').value;
  const cat = ($('rpCat') && $('rpCat').value === '2SQ') ? '2SQ' : '1SQ';
  if (!da || !a || a < da) return alert('Indica un periodo valido (Dal ≤ Al).');

  const titoloEv = repTitoloAgenda(cat);
  const chosenCal = getWritableSelectedGoogleCalendars()[0] || 'primary';
  const cache = (S.gcal && S.gcal.calCache) || [];
  const calMeta = cache.find(c => c.id === chosenCal) || {};

  if (editRepId) {
    const existingRep = S.rep.find(x => x.id === editRepId || x.da === editRepId);
    editRepId = null;
    if (existingRep) {
      let linkedEv = S.ev.find(e => (existingRep.evId && e.id === existingRep.evId) || (existingRep.id && e.repId === existingRep.id));
      mut(() => {
        existingRep.id = existingRep.id || uid();
        existingRep.da = da;
        existingRep.a = a;
        existingRep.cat = cat;
        existingRep.evLinked = true;
        if (linkedEv) {
          linkedEv.data = da;
          linkedEv.dataFine = a;
          linkedEv.ora = '08:00';
          linkedEv.oraFine = '08:00';
          linkedEv.titolo = titoloEv;
          if (isGoogleConfigured()) {
            linkedEv.googleCalId = linkedEv.googleCalId || chosenCal;
            linkedEv.pendingSync = linkedEv.googleId ? 'update' : 'create';
          }
        } else {
          const newEvId = uid();
          linkedEv = {
            id: newEvId,
            repId: existingRep.id,
            data: da,
            dataFine: a,
            ora: '08:00',
            oraFine: '08:00',
            titolo: titoloEv,
            luogo: '',
            tipo: 'Lavoro',
            fuori: false,
            reminder: -1,
            concluso: false,
            syncGoogle: true
          };
          if (isGoogleConfigured()) {
            linkedEv.googleCalId = chosenCal;
            linkedEv.googleCalName = calMeta.summary || '';
            linkedEv.googleCalColor = calMeta.backgroundColor || '#4285F4';
            linkedEv.pendingSync = 'create';
          }
          existingRep.evId = newEvId;
          S.ev.push(linkedEv);
        }
      });
      annullaEditRep();
      if (linkedEv && isGoogleConfigured()) {
        if (linkedEv.googleId) await aggiornaEventoGoogle(linkedEv);
        else await inviaEventoGoogle(linkedEv);
      }
      toast(`${repCatLabel(cat)} aggiornata anche in Agenda! ✓`);
      return;
    }
  }

  const repId = uid();
  const evId = uid();
  const newEv = {
    id: evId,
    repId: repId,
    data: da,
    dataFine: a,
    ora: '08:00',
    oraFine: '08:00',
    titolo: titoloEv,
    luogo: '',
    tipo: 'Lavoro',
    fuori: false,
    reminder: -1,
    concluso: false,
    syncGoogle: true
  };
  if (isGoogleConfigured()) {
    newEv.googleCalId = chosenCal;
    newEv.googleCalName = calMeta.summary || '';
    newEv.googleCalColor = calMeta.backgroundColor || '#4285F4';
    newEv.pendingSync = 'create';
  }

  mut(() => {
    S.rep.push({ id: repId, da, a, cat, evId, evLinked: true });
    S.ev.push(newEv);
  });

  $('rpDa').value = '';
  $('rpA').value = '';

  if (isGoogleConfigured()) {
    await inviaEventoGoogle(newEv);
  }
  inviaEventoM365(newEv);
  toast(`${repCatLabel(cat)} salvata e aggiunta in Agenda! ✓`);
}

async function delRep(key) {
  const target = S.rep.find(r => r.id === key || r.da === key);
  if (!target) return;
  if (!confirm(`Eliminare ${repCatLabel(repCat(target))} dal ${target.da.split('-').reverse().join('/')} al ${target.a.split('-').reverse().join('/')}?\n(Verrà rimosso anche l'impegno corrispondente dall'Agenda)`)) return;

  const linkedEv = S.ev.find(e => (target.evId && e.id === target.evId) || (target.id && e.repId === target.id));
  const gId = linkedEv && linkedEv.googleId ? linkedEv.googleId : null;
  const gCal = (linkedEv && linkedEv.googleCalId) || getWritableSelectedGoogleCalendars()[0] || 'primary';

  mut(() => {
    if (gId && isGoogleConfigured()) {
      S.gcal = S.gcal || { connected: true, email: getGooglePrimaryEmail(), selectedCals: getGoogleSelectedCalendars(), calCache: [], dismissedIds: [], pendingDeletes: [] };
      S.gcal.pendingDeletes = S.gcal.pendingDeletes || [];
      if (!S.gcal.pendingDeletes.some(d => d.googleId === gId)) {
        S.gcal.pendingDeletes.push({ googleId: gId, calId: gCal });
      }
    }
    if (linkedEv) {
      S.ev = S.ev.filter(e => e.id !== linkedEv.id);
    }
    S.rep = S.rep.filter(r => r !== target);
  });

  if (editRepId === key) annullaEditRep();
  if (gId && isGoogleConfigured()) {
    await eseguiPendingDeletesGoogle();
  }
  toast('Periodo di reperibilità rimosso.');
}
function repReminderDay(da) { const d = D(da); do d.setDate(d.getDate() - 1); while (!lavorativo(iso0(d))); return iso0(d); }

// ---------- Notifiche intelligenti (attive con app aperta / in background) ----------
const fired = () => { try { return JSON.parse(localStorage.getItem('cf_fired') || '{}'); } catch (e) { return {}; } };
function puliziaFired() {
  try {
    const f = fired(), lim = new Date(); lim.setDate(lim.getDate() - 7);
    const limIso = iso0(lim); let ch = false;
    Object.keys(f).forEach(k => { const m = /^(\d{4}-\d{2}-\d{2})/.exec(k); if (m && m[1] < limIso) { delete f[k]; ch = true; } });
    if (ch) localStorage.setItem('cf_fired', JSON.stringify(f));
  } catch (e) {}
}
const NOTIF_DEF = { ingresso: true, pausa: true, uscitaTodo: true, impegni: true, reperibilita: true };
const getNotifCfg = () => Object.assign({}, NOTIF_DEF, S.notif || {});
function aggiornaUINotifiche() {
  const b = $('notifStatusBadge');
  if (b) {
    if (!('Notification' in window)) { b.textContent = 'Non supportate'; b.className = 'bd'; }
    else if (Notification.permission === 'granted') { b.textContent = 'Attive ✓'; b.className = 'bd g'; }
    else if (Notification.permission === 'denied') { b.textContent = 'Bloccate dal browser'; b.className = 'bd r'; }
    else { b.textContent = 'Da attivare'; b.className = 'bd am'; }
  }
  const c = getNotifCfg();
  const map = { nCfgIngresso: 'ingresso', nCfgPausa: 'pausa', nCfgUscitaTodo: 'uscitaTodo', nCfgImpegni: 'impegni', nCfgReperibilita: 'reperibilita' };
  Object.keys(map).forEach(id => { const el = $(id); if (el) el.checked = !!c[map[id]]; });
}
function salvaNotifCfg() {
  mut(() => {
    S.notif = {
      ingresso: $('nCfgIngresso') ? $('nCfgIngresso').checked : true,
      pausa: $('nCfgPausa') ? $('nCfgPausa').checked : true,
      uscitaTodo: $('nCfgUscitaTodo') ? $('nCfgUscitaTodo').checked : true,
      impegni: $('nCfgImpegni') ? $('nCfgImpegni').checked : true,
      reperibilita: $('nCfgReperibilita') ? $('nCfgReperibilita').checked : true
    };
  });
  toast('Preferenze notifiche salvate ✓');
}
function mostraNotificaSW(tit, corpo, tag, dati, renotify = false) {
  if (!('Notification' in window) || Notification.permission !== 'granted' || !navigator.serviceWorker) return;
  navigator.serviceWorker.ready.then(r => r.showNotification(tit, {
    body: corpo, icon: 'icon-192.png', badge: 'icon-192.png',
    tag: tag || tit, renotify: !!renotify, data: dati || ''
  })).catch(() => {});
}
function chiudiNotificaTag(tag) {
  if (!navigator.serviceWorker || !tag) return;
  navigator.serviceWorker.ready.then(r => r.getNotifications({ tag }).then(list => list.forEach(n => n.close()))).catch(() => {});
}
function notifica(tit, corpo, k, dati) {
  if (k) { const f = fired(); if (f[k]) return; f[k] = 1; localStorage.setItem('cf_fired', JSON.stringify(f)); }
  toast(`${tit} — ${corpo}`);
  mostraNotificaSW(tit, corpo, k || tit, dati || '', true);
}
function abilitaNotifiche() {
  if (!('Notification' in window)) return alert('Notifiche non supportate da questo browser.');
  Notification.requestPermission().then(p => {
    aggiornaUINotifiche();
    toast(p === 'granted' ? 'Notifiche attivate ✓' : 'Notifiche non consentite');
    if (p === 'granted') controlli();
  });
  $('drawer').classList.remove('open');
}
function testaNotifica() {
  if (!('Notification' in window)) return alert('Notifiche non supportate da questo browser.');
  if (Notification.permission !== 'granted') return abilitaNotifiche();
  mostraNotificaSW('Cronoflex — Test notifiche', 'Le notifiche di promemoria sono attive e funzionanti ✓', 'cf-test-' + Date.now(), '#oggi', true);
  toast('Notifica di prova inviata ✓');
}
function aggiornaNotificaTodoFineGiornata(forzaToast = false) {
  const cfg = getNotifCfg();
  if (!cfg.uscitaTodo) return;
  const iso = todayISO();
  const todosOggi = (S.todo || []).filter(x => x.data === iso);
  const tag = 'cf-todo-' + iso;
  if (!todosOggi.length) { chiudiNotificaTag(tag); return; }
  const aperti = todosOggi.filter(x => !x.fatto);
  const fatti = todosOggi.length - aperti.length;
  let tit, corpo;
  if (aperti.length > 0) {
    tit = `Fine giornata · ${aperti.length} da fare (${fatti}/${todosOggi.length})`;
    const preview = aperti.slice(0, 3).map(x => x.testo).join(' · ');
    corpo = aperti.length > 3 ? `${preview} (+${aperti.length - 3} altri)` : preview;
  } else {
    tit = 'Fine giornata · Tutto completato ✓';
    corpo = `Hai chiuso tutte le ${todosOggi.length} attività di oggi!`;
  }
  if (forzaToast) toast(`${tit} — ${corpo}`);
  mostraNotificaSW(tit, corpo, tag, '#oggi', !!forzaToast);
}
function controlli() {
  const n = new Date(), nm = n.getHours() * 60 + n.getMinutes(), iso = todayISO();
  const tG = tDay(iso), gG = gDay(iso), c = calcolaGiornata(iso, tG, gG, nm), f = fase(tG, isVen(iso));
  const cfg = getNotifCfg();
  const at = (m, k, tit, msg, dati) => { if (nm >= m && nm - m < 30) notifica(tit, msg, iso + k, dati || '#oggi'); };

  // M5.1a — Inizio giornata (timbratura ingresso)
  if (cfg.ingresso && lavorativo(iso) && f === 'prima' && !gG.some(g => g.tuttaGiornata)) {
    if (nm >= 525 && nm < 555) notifica('Buongiorno · Ingresso', 'Ricorda di timbrare l’ingresso in sede', iso + '_ing', '#oggi');
  } else if (f !== 'prima') {
    chiudiNotificaTag(iso + '_ing');
  }

  // M5.1b — Metà giornata (inizio e fine pausa)
  if (cfg.pausa) {
    if (!isVen(iso) && f === 'mat') {
      const pIni = (typeof PARAM !== 'undefined' && PARAM.pausaInizio) ? P(PARAM.pausaInizio) : 765;
      if (nm >= pIni && nm < pIni + 30) notifica('Pausa pranzo', 'Fascia pausa aperta: ricorda di timbrare l’uscita pausa', iso + '_pstart', '#oggi');
    }
    if (f === 'pausa') {
      const { mn, mx } = rientri(c);
      at(mn, 'rmin', 'Rientro minimo', 'Puoi rientrare dalla pausa', '#oggi');
      at(mx, 'rmax', 'Rientro massimo', 'Rientra ora per uscire alle 17:15', '#oggi');
    }
  }

  // M5.1c — Fine giornata: uscita minima, straordinario e riepilogo To-Do live
  if (f === 'pom') {
    at(P(c.uscitaTeorica), 'umin', 'Uscita minima', `Puoi uscire (${c.uscitaTeorica})`, '#oggi');
    const s0 = P(c.oraScatto30m);
    for (let k = 0; k < 12; k++) at(s0 + 15 * k, 's' + k, 'Straordinario', `Uscendo ora maturi +${30 + 15 * k} min`, '#oggi');
  }
  if (cfg.uscitaTodo && lavorativo(iso) && f !== 'prima') {
    const sogliaFine = (f === 'pom' && c.uscitaTeorica) ? Math.max(480, P(c.uscitaTeorica) - 30) : (isVen(iso) ? 870 : 1005);
    if (nm >= sogliaFine && !fired()[iso + '_eodtodo']) {
      const ff = fired(); ff[iso + '_eodtodo'] = 1; localStorage.setItem('cf_fired', JSON.stringify(ff));
      aggiornaNotificaTodoFineGiornata(true);
    }
  }

  // M5.2 — Impegni con orario (30' prima) e agenda del giorno
  const ev = S.ev.filter(e => evCopreGiorno(e, iso)).sort((a, b) => (a.ora || '').localeCompare(b.ora || ''));
  if (cfg.impegni && nm >= 480 && ev.length) notifica('Agenda di oggi', ev.map(e => `${e.ora || ''} ${e.titolo}`).join(' · '), iso + 'ag', '#agenda');
  if (cfg.impegni) {
    ev.forEach(e => {
      if (!e.ora) return;
      const oraMin = P(e.ora);
      const remMin = e.reminder !== undefined ? parseInt(e.reminder, 10) : 30;
      if (remMin >= 0) {
        const targetMin = oraMin - remMin;
        if (nm >= targetMin && nm - targetMin < 30) {
          const remMsg = remMin === 0 ? `Inizia adesso (${e.ora})` : `Tra ${remMin} min (${e.ora})`;
          notifica(`Promemoria: ${e.titolo}`, `${remMsg}${e.luogo ? ' · ' + e.luogo : ''}`, `${iso}_evrem_${e.id}`, '#agenda');
        }
      }
    });
  }

  // M5.2 — Reperibilità (1° giorno lavorativo precedente all'inizio)
  if (cfg.reperibilita) {
    S.rep.forEach(r => {
      if (repReminderDay(r.da) === iso && nm >= 480) {
        notifica(repCatLabel(repCat(r)), `Dal ${r.da.split('-').reverse().join('/')} inizia il turno (${repCatLabel(repCat(r))})`, iso + 'rp' + r.da, '#rep');
      }
    });
  }

  const rd = reportDovuto(); if (rd) notifica('Report mensile pronto', `Verifica ${nomeMese(rd)} con la busta paga`, 'rep' + rd + iso.slice(0, 7), '#report=' + rd);
}

// ---------- Punto zero, backup ----------
function apriPZ() { const p = S.pz || {}, h = k => p[k] ? F(p[k]).replace('h ', ':').replace('m', '') : ''; $('pzData').value = p.data || todayISO(); [['pzFerie', 'ferie'], ['pzFerieRip', 'ferieRip'], ['pzEx', 'ex'], ['pzVisite', 'visite'], ['pzNov4', 'nov4'], ['pzRec', 'rec'], ['pzBanca', 'banca'], ['pzBancaRip', 'bancaRip']].forEach(([id, k]) => $(id).value = h(k)); $('pzLav').checked = !!p.lavNov4; $('drawer').classList.remove('open'); $('modalPZ').classList.add('active'); }
function salvaPZ() { const v = id => P($(id).value.trim()) || 0; if (!$('pzData').value) return alert('Indica la data del punto zero.'); if (!confirm('Da questa data i contatori ripartono dai valori indicati; le registrazioni precedenti non verranno più conteggiate nei saldi. Confermi?')) return;
  mut(() => S.pz = { data: $('pzData').value, ferie: v('pzFerie'), ferieRip: v('pzFerieRip'), ex: v('pzEx'), visite: v('pzVisite'), nov4: v('pzNov4'), rec: v('pzRec'), banca: v('pzBanca'), bancaRip: v('pzBancaRip'), lavNov4: $('pzLav').checked }); chiudiModal('modalPZ'); }
const rimuoviPZ = () => { mut(() => S.pz = null); chiudiModal('modalPZ'); };
const apriSync = () => { $('drawer').classList.remove('open'); if ($('chkMergeImport')) $('chkMergeImport').checked = false; $('modalSync').classList.add('active'); };
function esportaDati() { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify({ versione: 4, S }, null, 2)], { type: 'application/json' })); a.download = `backup_cronoflex_${todayISO()}.json`; a.click(); }
function importaDati() {
  const f = $('fileImport').files[0]; if (!f) return alert('Seleziona un file di backup.');
  const merge = !!($('chkMergeImport') && $('chkMergeImport').checked);
  const rd = new FileReader();
  rd.onload = e => {
    try {
      const d = JSON.parse(e.target.result);
      const n = d.S || { t: d.timbrature, g: d.giustificativi, d: d.destinazioni || {}, pz: d.puntoZero || null };
      if (!n.t || !n.g) return alert('File di backup non valido.');
      let aggT = 0, aggG = 0;
      if (!merge) window.__cfAllowShrinkWrite = true;
      mut(() => {
        if (merge) {
          S.t = S.t || []; S.g = S.g || []; S.d = S.d || {};
          const exT = new Set(S.t.map(t => `${t.data}_${t.tipo}_${t.ora}`));
          n.t.forEach(t => {
            const ft = { ...t, data: formatExcelDate(t.data) };
            const k = `${ft.data}_${ft.tipo}_${ft.ora}`;
            if (ft.data && !exT.has(k)) { S.t.push(ft); exT.add(k); aggT++; }
          });
          const exG = new Set(S.g.map(g => `${g.data}_${g.tipo}_${g.oraInizio || ''}_${g.oraFine || ''}`));
          n.g.forEach(g => {
            const fg = { ...g, data: formatExcelDate(g.data) };
            const k = `${fg.data}_${fg.tipo}_${fg.oraInizio || ''}_${fg.oraFine || ''}`;
            if (fg.data && !exG.has(k)) { S.g.push(fg); exG.add(k); aggG++; }
          });
          Object.keys(n.d || {}).forEach(k => { if (!S.d[k]) S.d[k] = n.d[k]; });
        } else {
          S = Object.assign(VUOTO(), n);
        }
        normalizzaGiustificativiStorici();
        applicaParametri();
        allineaImpegniReperibilita();
      });
      $('fileImport').value = '';
      if ($('chkMergeImport')) $('chkMergeImport').checked = false;
      chiudiModal('modalSync');
      toast(merge ? `Unite ${aggT} timbrature e ${aggG} giustificativi ai dati attuali ✓` : 'Backup ripristinato ✓');
    } catch (err) { alert('Errore: ' + err.message); }
  };
  rd.readAsText(f);
}
async function forzaAggiornamento() { try { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); } catch (e) {} location.replace('index.html?v=' + Date.now()); }

if ('serviceWorker' in navigator) {
  const aveva = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (aveva && !window._ric) { window._ric = 1; location.reload(); } });
  navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.open) location.hash = e.data.open, apriDaHash(); });
}
function apriDaHash() {
  const h = location.hash || '';
  const m = /report=(\d{4}-\d{2})/.exec(h);
  if (m) { rie.y = +m[1].slice(0, 4); rie.m = +m[1].slice(5); apriReport(m[1]); return; }
  if (h === '#oggi' || h === '#agenda' || h === '#rep') pagina(h.slice(1));
}
window.addEventListener('beforeunload', () => {
  try {
    if (pagina.cur) localStorage.setItem('cf_last_page', pagina.cur);
    localStorage.setItem('cf_reload_ts', String(Date.now()));
  } catch (e) {}
});
window.onload = () => {
  load();
  riportaTodoNonChiusi(true);
  puliziaFired();
  const mAttivi = giorniConDati().map(d => d.slice(0, 7));
  if (mAttivi.length && !mAttivi.includes(ymStr(rie.y, rie.m))) {
    const ultimo = mAttivi.sort().reverse()[0];
    rie.y = +ultimo.slice(0, 4);
    rie.m = +ultimo.slice(5);
  }
  const validPag = ['oggi', 'storico', 'agenda', 'riepilogo', 'strumenti', 'opzioni', 'busta', 'rep', 'chiusure', 'parametri'];
  let targetPag = 'oggi';
  try {
    const navEntries = performance.getEntriesByType && performance.getEntriesByType('navigation');
    const navType = (navEntries && navEntries[0] && navEntries[0].type) || (performance.navigation && performance.navigation.type === 1 ? 'reload' : '');
    const sessPag = sessionStorage.getItem('cf_cur_page');
    const lastPag = localStorage.getItem('cf_last_page');
    const reloadTs = +(localStorage.getItem('cf_reload_ts') || 0);
    const isRecentUnload = (Date.now() - reloadTs) < 15000;
    const isReload = navType === 'reload' || !!sessPag || isRecentUnload || location.search.includes('v=');
    const candidate = sessPag || (isReload ? lastPag : null);
    if (isReload && candidate && validPag.includes(candidate)) {
      targetPag = candidate;
    }
  } catch (e) {}
  pagina(targetPag);
  if (window.AndroidBridge && $('btnRefreshApp')) $('btnRefreshApp').style.display = 'none';
  initSwipeOggi();
  initSwipeAgenda();
  apriDaHash(); const hv = document.documentElement.dataset.ver, ok = hv === APP_VERSION;
  $('ver').textContent = ok ? `Cronoflex v${APP_VERSION} · by arch. Lonardo Massimo` : `File non allineati (pagina ${hv}, logica ${APP_VERSION}): usa "Forza aggiornamento" dal menu`; $('ver').style.color = ok ? 'var(--muted)' : 'var(--danger)';
  controlli(); setInterval(() => { if (riportaTodoNonChiusi(true) > 0) refresh(); controlli(); if (pagina.cur === 'oggi') aggiornaSchermataOggi(); }, 30000);
};


// ---------- Gestione Opzioni & Chiusure Aziendali ----------
function apriModalChiusura() {
  $('chiusuraData').value = todayISO();
  $('chiusuraDesc').value = '';
  $('chiusuraGiust').value = 'FERIE';
  $('modalChiusura').classList.add('active');
}

function salvaChiusura() {
  const data = $('chiusuraData').value, desc = $('chiusuraDesc').value.trim(), giust = $('chiusuraGiust').value;
  if (!data) return alert('Seleziona una data valida.');
  if (!S.chiusure) S.chiusure = [];
  // Evita duplicati per la stessa data
  S.chiusure = S.chiusure.filter(c => c.data !== data);
  mut(() => S.chiusure.push({ data, desc, giust }));
  chiudiModal('modalChiusura');
  caricaOpzioni();
}

function eliminaChiusura(data) {
  if (confirm(`Rimuovere la chiusura aziendale del ${data}?`)) {
    mut(() => { S.chiusure = (S.chiusure || []).filter(c => c.data !== data); });
    caricaOpzioni();
  }
}

function caricaOpzioni() {
  aggiornaUINotifiche();
  const box = $('listaChiusure');
  if (!box) return;
  const list = (S.chiusure || []).sort((a, b) => a.data.localeCompare(b.data));
  if (!list.length) {
    box.innerHTML = '<div style="color:var(--muted);font-size:.85rem;padding:8px 0">Nessuna giornata di chiusura aziendale programmata.</div>';
    return;
  }
  box.innerHTML = list.map(c => {
    const dObj = D(c.data);
    const dStr = cap(dObj.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' }));
    const hasGiust = gDay(c.data).length > 0;
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--line)">
      <div>
        <div style="font-weight:700;font-size:.9rem">${dStr}</div>
        <div style="font-size:.8rem;color:var(--muted)">${c.desc || 'Chiusura programmata'} — Richiede: <b>${c.giust || 'Ferie'}</b> ${hasGiust ? '<span class="bd g" style="margin-left:6px">GIUSTIFICATO ✓</span>' : '<span class="bd am" style="margin-left:6px">DA GIUSTIFICARE</span>'}</div>
      </div>
      <div style="display:flex;gap:6px">
        <button class="ib" onclick="currentDate=D('${c.data}');pagina('oggi')" title="Vai al giorno">📅</button>
        <button class="ib" style="color:var(--danger)" onclick="eliminaChiusura('${c.data}')" title="Elimina chiusura">🗑️</button>
      </div>
    </div>`;
  }).join('');
}

// Inizializzazione sequenziale Cloud -> Calendario + sincronizzazione continua in background
window.addEventListener('load', () => {
  avviaSincronizzazioniIniziali();
  setInterval(eseguiAutoSyncCalendari, 2 * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') eseguiAutoSyncCalendari();
  });
  window.addEventListener('focus', () => {
    eseguiAutoSyncCalendari();
  });
});


// ==========================================
// ELENCO COMPLETO COMMESSE E GESTIONE PREFERITE (⭐)
// ==========================================
const DEFAULT_CATEGORIE_DIRIGENTE = [
  // 1. GESTIONE ORDINARIA - ORDINARIA AGESP SPA [Righe Excel 8..13]
  { excelRow: 8, macro: "GESTIONE ORDINARIA", sub: "ORD.(strutture di proprietà/affitto)", nome: "FABBRICATI" },
  { excelRow: 9, macro: "GESTIONE ORDINARIA", sub: "ORD.(strutture di proprietà/affitto)", nome: "VERDE" },
  { excelRow: 10, macro: "GESTIONE ORDINARIA", sub: "ORD.(strutture di proprietà/affitto)", nome: "IMPIANTI ELETTROMECCANICI" },
  { excelRow: 11, macro: "GESTIONE ORDINARIA", sub: "ORD.(strutture di proprietà/affitto)", nome: "PARCHEGGI" },
  { excelRow: 12, macro: "GESTIONE ORDINARIA", sub: "ORD.(strutture di proprietà/affitto)", nome: "FARMACIE" },
  { excelRow: 13, macro: "GESTIONE ORDINARIA", sub: "ORD.(strutture di proprietà/affitto)", nome: "ALTRO (SPECIFICARE)", isAltro: true, baseLabel: "ALTRO (SPECIFICARE)" },

  // 2. GESTIONE ORDINARIA - ORDINARIA COMUNE DI BUSTO ARSIZIO [Righe Excel 15..23]
  { excelRow: 15, macro: "GESTIONE ORDINARIA", sub: "ORDINARIA COMUNE DI BUSTO ARSIZIO", nome: "FABBRICATI" },
  { excelRow: 16, macro: "GESTIONE ORDINARIA", sub: "ORDINARIA COMUNE DI BUSTO ARSIZIO", nome: "VERDE PUBBLICO E ARREDO URBANO" },
  { excelRow: 17, macro: "GESTIONE ORDINARIA", sub: "ORDINARIA COMUNE DI BUSTO ARSIZIO", nome: "CIMITERI E CREMATORIO" },
  { excelRow: 18, macro: "GESTIONE ORDINARIA", sub: "ORDINARIA COMUNE DI BUSTO ARSIZIO", nome: "INFRASTRUTTURE STRADALI" },
  { excelRow: 19, macro: "GESTIONE ORDINARIA", sub: "ORDINARIA COMUNE DI BUSTO ARSIZIO", nome: "IMPIANTI ELETTROMECCANICI" },
  { excelRow: 20, macro: "GESTIONE ORDINARIA", sub: "ORDINARIA COMUNE DI BUSTO ARSIZIO", nome: "SEGNALETICA STRADALE" },
  { excelRow: 21, macro: "GESTIONE ORDINARIA", sub: "ORDINARIA COMUNE DI BUSTO ARSIZIO", nome: "GESTIONE CALORE" },
  { excelRow: 22, macro: "GESTIONE ORDINARIA", sub: "ORDINARIA COMUNE DI BUSTO ARSIZIO", nome: "SALA CONFERENZE" },
  { excelRow: 23, macro: "GESTIONE ORDINARIA", sub: "ORDINARIA COMUNE DI BUSTO ARSIZIO", nome: "ALTRO SPECIFICARE:", isAltro: true, baseLabel: "ALTRO SPECIFICARE:" },

  // 3. GESTIONE ORDINARIA - ORDINARIA AGESP AMBIENTE [Righe Excel 25..36]
  { excelRow: 25, macro: "GESTIONE ORDINARIA", sub: "ORDINARIA AGESP AMBIENTE", nome: "57-IGIENE AMBIENTALE" },
  { excelRow: 26, macro: "GESTIONE ORDINARIA", sub: "ORDINARIA AGESP AMBIENTE", nome: "58- IGIENE URBANA" },
  { excelRow: 27, macro: "GESTIONE ORDINARIA", sub: "ORDINARIA AGESP AMBIENTE", nome: "59- CMR BUSTO ARSIZIO" },
  { excelRow: 28, macro: "GESTIONE ORDINARIA", sub: "ORDINARIA AGESP AMBIENTE", nome: "60-CMR FAGNANO OLONA" },
  { excelRow: 29, macro: "GESTIONE ORDINARIA", sub: "ORDINARIA AGESP AMBIENTE", nome: "162-ECOPIAZZOLA VIA FAVANA" },
  { excelRow: 30, macro: "GESTIONE ORDINARIA", sub: "ORDINARIA AGESP AMBIENTE", nome: "164- ECOPIAZZOLA PIAZZA BERSAGLIERI" },
  { excelRow: 31, macro: "GESTIONE ORDINARIA", sub: "ORDINARIA AGESP AMBIENTE", nome: "165- ECOPIAZZOLA VIA A.DA BRESCIA" },
  { excelRow: 32, macro: "GESTIONE ORDINARIA", sub: "ORDINARIA AGESP AMBIENTE", nome: "166-ECOPIAZZOLA VIA FERRE'" },
  { excelRow: 33, macro: "GESTIONE ORDINARIA", sub: "ORDINARIA AGESP AMBIENTE", nome: "167- ECOPIAZZOLA VIA FERRER" },
  { excelRow: 34, macro: "GESTIONE ORDINARIA", sub: "ORDINARIA AGESP AMBIENTE", nome: "168-CMR VIA TIBET" },
  { excelRow: 35, macro: "GESTIONE ORDINARIA", sub: "ORDINARIA AGESP AMBIENTE", nome: "196- ECOPIAZZOLA VIA AZZIMONTI" },
  { excelRow: 36, macro: "GESTIONE ORDINARIA", sub: "ORDINARIA AGESP AMBIENTE", nome: "216-CMR VENEGONO SUPERIORE" },

  // 4. GESTIONE ORDINARIA - ORDINARIA ALTRE GRUPPO AGESP [Righe Excel 37..38]
  { excelRow: 37, macro: "GESTIONE ORDINARIA", sub: null, nome: "ORDINARIA AGESP ENERGIA" },
  { excelRow: 38, macro: "GESTIONE ORDINARIA", sub: null, nome: "ORDINARIA PREALPI GAS " },

  // 5. GESTIONE STRAORDINARIA - STRAORDINARIA COMUNE E GRUPPO AGESP [Righe Excel 41, 42, 56, 57, 58]
  { excelRow: 41, macro: "GESTIONE STRAORDINARIA", sub: null, nome: "AGESP S.p.A.                                                                Manutenzione straordinaria/nuove opere" },
  { excelRow: 42, macro: "GESTIONE STRAORDINARIA", sub: null, nome: "Comune Busto Arsizio                                                                Manutenzione straordinaria/nuove opere" },
  { excelRow: 56, macro: "GESTIONE STRAORDINARIA", sub: null, nome: "AGESP ENERGIA" },
  { excelRow: 57, macro: "GESTIONE STRAORDINARIA", sub: null, nome: "PREALPI GAS" },
  { excelRow: 58, macro: "GESTIONE STRAORDINARIA", sub: null, nome: "ALTRO (SPECIFICARE):", isAltro: true, baseLabel: "ALTRO (SPECIFICARE):" },

  // 6. GESTIONE STRAORDINARIA - AGESP AMBIENTE PER IL TER. [Righe Excel 44..55]
  { excelRow: 44, macro: "GESTIONE STRAORDINARIA", sub: "AGESP AMBIENTE PER IL TER.", nome: "57-IGIENE AMBIENTALE" },
  { excelRow: 45, macro: "GESTIONE STRAORDINARIA", sub: "AGESP AMBIENTE PER IL TER.", nome: "58- IGIENE URBANA" },
  { excelRow: 46, macro: "GESTIONE STRAORDINARIA", sub: "AGESP AMBIENTE PER IL TER.", nome: "59- CMR BUSTO ARSIZIO" },
  { excelRow: 47, macro: "GESTIONE STRAORDINARIA", sub: "AGESP AMBIENTE PER IL TER.", nome: "60-CMR FAGNANO OLONA" },
  { excelRow: 48, macro: "GESTIONE STRAORDINARIA", sub: "AGESP AMBIENTE PER IL TER.", nome: "162-ECOPIAZZOLA VIA FAVANA" },
  { excelRow: 49, macro: "GESTIONE STRAORDINARIA", sub: "AGESP AMBIENTE PER IL TER.", nome: "164- ECOPIAZZOLA PIAZZA BERSAGLIERI" },
  { excelRow: 50, macro: "GESTIONE STRAORDINARIA", sub: "AGESP AMBIENTE PER IL TER.", nome: "165- ECOPIAZZOLA VIA A.DA BRESCIA" },
  { excelRow: 51, macro: "GESTIONE STRAORDINARIA", sub: "AGESP AMBIENTE PER IL TER.", nome: "166-ECOPIAZZOLA VIA FERRE'" },
  { excelRow: 52, macro: "GESTIONE STRAORDINARIA", sub: "AGESP AMBIENTE PER IL TER.", nome: "167- ECOPIAZZOLA VIA FERRER" },
  { excelRow: 53, macro: "GESTIONE STRAORDINARIA", sub: "AGESP AMBIENTE PER IL TER.", nome: "168-CMR VIA TIBET" },
  { excelRow: 54, macro: "GESTIONE STRAORDINARIA", sub: "AGESP AMBIENTE PER IL TER.", nome: "196- ECOPIAZZOLA VIA AZZIMONTI" },
  { excelRow: 55, macro: "GESTIONE STRAORDINARIA", sub: "AGESP AMBIENTE PER IL TER.", nome: "216-CMR VENEGONO SUPERIORE" }
];

function getCategorieDirigente() {
  const base = (Array.isArray(S.customCatDir) && S.customCatDir.length > 0) ? S.customCatDir : DEFAULT_CATEGORIE_DIRIGENTE;
  // Esclude sempre eventuali "Voce generale" di intestazione dal selettore commesse
  return base.filter(c => !/Voce generale$/i.test((c.nome || '').trim()) && ![7, 14, 24, 43].includes(c.excelRow));
}

function getCatKey(c) {
  return `${c.macro}|||${c.sub || ''}|||${c.nome}`;
}

function getCatGroupLabel(c) {
  const sub = (c.sub || '').trim();
  if (c.macro === 'GESTIONE ORDINARIA') {
    if (!sub) return 'GESTIONE ORDINARIA - ORDINARIA ALTRE GRUPPO AGESP';
    if (sub.includes('proprietà') || /^ORD\./i.test(sub)) return 'GESTIONE ORDINARIA - ORDINARIA AGESP SPA';
    if (sub.includes('COMUNE DI BUSTO')) return 'GESTIONE ORDINARIA - ORDINARIA COMUNE DI BUSTO ARSIZIO';
    if (sub.includes('ORDINARIA AGESP AMBIENTE')) return 'GESTIONE ORDINARIA - ORDINARIA AGESP AMBIENTE';
    return `GESTIONE ORDINARIA - ${sub}`;
  }
  if (c.macro === 'GESTIONE STRAORDINARIA') {
    if (!sub) return 'GESTIONE STRAORDINARIA - STRAORDINARIA COMUNE E GRUPPO AGESP';
    if (sub.includes('AGESP AMBIENTE PER IL TER')) return 'GESTIONE STRAORDINARIA - AGESP AMBIENTE PER IL TER.';
    return `GESTIONE STRAORDINARIA - ${sub}`;
  }
  return sub ? `${c.macro} - ${sub}` : c.macro;
}

function getCatSubBreve(c) {
  const sub = (c.sub || '').trim();
  if (c.macro === 'GESTIONE ORDINARIA') {
    if (!sub) return 'Ord. Altre Gruppo AGESP';
    if (sub.includes('proprietà') || /^ORD\./i.test(sub)) return 'Ord. AGESP SpA';
    if (sub.includes('COMUNE DI BUSTO')) return 'Ord. Comune';
    if (sub.includes('ORDINARIA AGESP AMBIENTE')) return 'Ord. Ambiente';
    return sub;
  }
  if (!sub) return 'Straord. Comune e Gruppo AGESP';
  if (sub.includes('AGESP AMBIENTE PER IL TER')) return 'Straord. Ambiente';
  return sub;
}

function getCatDisplayLabel(c, conContesto = false) {
  const clean = (c.nome || '').replace(/\s+/g, ' ').trim();
  return conContesto ? `[${getCatSubBreve(c)}] ${clean}` : clean;
}

function getFavAttList() {
  return Array.isArray(S.favAtt) ? S.favAtt : [];
}

function popolaSelectAttivita(forzaRebuild = false) {
  const sel = $('attCat');
  if (!sel) return;
  const prevVal = sel.value;
  const cats = getCategorieDirigente();
  const favs = getFavAttList();
  const sig = `v2_${cats.length}_${favs.join('|')}`;
  if (!forzaRebuild && sel.dataset.sig === sig && sel.options.length > 5) {
    aggiornaStellaFavAttUI();
    renderFavAttChips();
    return;
  }
  sel.dataset.sig = sig;
  sel.innerHTML = '';

  // 1. Gruppo in cima: ⭐ ATTIVITÀ PREFERITE
  if (favs.length > 0) {
    const favGrp = document.createElement('optgroup');
    favGrp.label = '⭐ LE TUE ATTIVITÀ PREFERITE';
    favs.forEach(fKey => {
      const c = cats.find(x => getCatKey(x) === fKey);
      if (!c) return;
      const opt = document.createElement('option');
      opt.value = fKey;
      opt.textContent = `⭐ ${getCatDisplayLabel(c, true)}`;
      favGrp.appendChild(opt);
    });
    if (favGrp.children.length > 0) sel.appendChild(favGrp);
  }

  // 2. Elenco completo ordinato per i 6 gruppi strutturali (senza voci generali selezionabili)
  const gruppi = {};
  cats.forEach(c => {
    const gKey = getCatGroupLabel(c);
    if (!gruppi[gKey]) gruppi[gKey] = [];
    gruppi[gKey].push(c);
  });

  Object.keys(gruppi).forEach(g => {
    const grp = document.createElement('optgroup');
    grp.label = g;
    gruppi[g].forEach(c => {
      const key = getCatKey(c);
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = (favs.includes(key) ? '★ ' : '') + getCatDisplayLabel(c, false);
      grp.appendChild(opt);
    });
    sel.appendChild(grp);
  });

  if (prevVal && [...sel.options].some(o => o.value === prevVal)) {
    sel.value = prevVal;
  } else if (favs.length > 0 && [...sel.options].some(o => o.value === favs[0])) {
    sel.value = favs[0];
  }

  aggiornaStellaFavAttUI();
  renderFavAttChips();
}

function aggiornaStellaFavAttUI() {
  const sel = $('attCat');
  const btn = $('btnToggleFavAtt');
  if (!sel || !btn) return;
  const isFav = getFavAttList().includes(sel.value);
  btn.textContent = isFav ? '⭐' : '☆';
  btn.title = isFav ? 'Rimuovi dalle attività preferite' : 'Aggiungi alle attività preferite';
  btn.style.borderColor = isFav ? '#f5a524' : 'var(--line)';
  btn.style.background = isFav ? '#fff8eb' : '#fff';
  btn.style.color = isFav ? '#d48806' : 'var(--muted)';
}

function renderFavAttChips() {
  const box = $('favAttChips');
  if (!box) return;
  // Le preferite sono visibili solo nel menù a discesa (gruppo in cima): nessun pulsante rapido
  box.innerHTML = '';
  return;
  const favs = getFavAttList();
  const cats = getCategorieDirigente();
  const selVal = $('attCat') ? $('attCat').value : '';

  if (!favs.length) {
    box.innerHTML = `<div style="font-size:0.74rem;color:var(--muted);margin-bottom:4px">💡 Tocca <b>☆</b> accanto a una commessa o <a href="#" onclick="apriModalFavAtt();return false" style="color:var(--blue);font-weight:600">scegli le preferite</a> per averle sempre qui a portata di clic.</div>`;
    return;
  }

  box.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px">` + favs.map(fKey => {
    const c = cats.find(x => getCatKey(x) === fKey);
    if (!c) return '';
    const active = selVal === fKey;
    const shortName = getCatDisplayLabel(c, false).replace('Manutenzione straordinaria/nuove opere', 'Manut. straord.');
    return `<button type="button" onclick="selezionaFavAttChip(this.dataset.key)" data-key="${escHtml(fKey)}" style="border:1px solid ${active ? 'var(--blue)' : '#f0c978'};background:${active ? 'var(--blue)' : '#fffaf0'};color:${active ? '#fff' : 'var(--navy)'};border-radius:16px;padding:4px 9px;font-size:0.74rem;font-weight:600;cursor:pointer;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(getCatDisplayLabel(c, true))}">⭐ ${escHtml(shortName)} <span style="opacity:0.75;font-weight:500">(${escHtml(getCatSubBreve(c))})</span></button>`;
  }).join('') + `</div>`;
}

function selezionaFavAttChip(key) {
  const sel = $('attCat');
  if (!sel) return;
  sel.value = key;
  aggiornaStellaFavAttUI();
  renderFavAttChips();
  if ($('attOre')) $('attOre').focus();
}

function toggleFavAttCorrente() {
  const sel = $('attCat');
  if (!sel || !sel.value) return;
  const key = sel.value;
  let favs = [...getFavAttList()];
  const aggiunta = !favs.includes(key);
  if (aggiunta) favs.push(key);
  else favs = favs.filter(x => x !== key);

  mut(() => { S.favAtt = favs; });
  popolaSelectAttivita(true);
  sel.value = key;
  aggiornaStellaFavAttUI();
  renderFavAttChips();
  toast(aggiunta ? '⭐ Aggiunta alle attività preferite!' : 'Rimossa dalle attività preferite.');
}

function apriModalFavAtt() {
  if ($('searchFavAtt')) $('searchFavAtt').value = '';
  renderListaModalFavAtt();
  apriModal('modalFavAtt');
}

function renderListaModalFavAtt() {
  const box = $('listaModalFavAtt');
  if (!box) return;
  const q = ($('searchFavAtt') ? $('searchFavAtt').value.trim().toLowerCase() : '');
  const cats = getCategorieDirigente();
  const favs = getFavAttList();

  const filtered = cats.filter(c => {
    if (!q) return true;
    return (`${getCatGroupLabel(c)} ${c.nome}`).toLowerCase().includes(q);
  });

  if (!filtered.length) {
    box.innerHTML = '<div class="empty">Nessuna attività trovata per questo filtro.</div>';
    return;
  }

  const gruppi = {};
  filtered.forEach(c => {
    const grp = getCatGroupLabel(c);
    if (!gruppi[grp]) gruppi[grp] = [];
    gruppi[grp].push(c);
  });

  box.innerHTML = Object.keys(gruppi).map(grp => {
    const hdr = `<div style="font-size:0.73rem;font-weight:700;color:var(--blue);margin-top:10px;padding-bottom:3px;border-bottom:1px solid var(--line)">${escHtml(grp)}</div>`;
    const rows = gruppi[grp].map(c => {
      const key = getCatKey(c);
      const checked = favs.includes(key);
      return `<label style="display:flex;align-items:center;gap:8px;padding:6px 2px;font-size:0.83rem;cursor:pointer;border-bottom:1px dashed rgba(0,0,0,0.05)">
        <input type="checkbox" data-key="${escHtml(key)}" ${checked ? 'checked' : ''} onchange="toggleFavAttDaModal(this.dataset.key, this.checked)">
        <span style="flex:1;font-weight:${checked ? '700' : '400'}">${checked ? '⭐ ' : ''}${escHtml(getCatDisplayLabel(c, false))}</span>
      </label>`;
    }).join('');
    return hdr + rows;
  }).join('');
}

function toggleFavAttDaModal(key, checked) {
  let favs = [...getFavAttList()];
  if (checked) {
    if (!favs.includes(key)) favs.push(key);
  } else {
    favs = favs.filter(x => x !== key);
  }
  mut(() => { S.favAtt = favs; });
  popolaSelectAttivita(true);
  renderListaModalFavAtt();
}

function parseOreInput(str) {
  if (!str) return 0;
  str = String(str).trim().replace(',', '.');
  if (str.includes(':')) {
    const [h, m] = str.split(':').map(Number);
    return (h || 0) + (m || 0) / 60;
  }
  return parseFloat(str) || 0;
}

function renderAttivita(iso) {
  popolaSelectAttivita();
  const l = S.att[iso] || [];
  const attInfo = infoOreAttivitaGiorno(iso);
  const cats = getCategorieDirigente();
  const formBox = $('attFormBox');

  let sommaAttOre = 0;
  l.forEach(a => { sommaAttOre += (typeof a.ore === 'number' ? a.ore : parseOreInput(a.ore)); });

  const bBox = $('attQuadraturaBadge');

  // Caso 1: Assente tutto il giorno (nessuna ora lavorata e giustificativo di assenza copre la giornata)
  if (attInfo.assenteTuttoGiorno && l.length === 0) {
    if (bBox) bBox.innerHTML = `<span class="bd g" style="font-weight:700">✓ Assente tutto il giorno</span>`;
    if (formBox) formBox.style.display = 'none';
    $('attList').innerHTML = '<div class="empty" style="color:var(--green);font-weight:600">Giornata di assenza intera — nessuna attività lavorativa da inserire.</div>';
    return;
  }

  if (formBox) formBox.style.display = 'block';

  // Badge quadratura: confronta SEMPRE con le sole ore effettivamente lavorate (targetOre)
  if (bBox) {
    if (attInfo.inCorso) {
      const prev = attInfo.previsteInCorsoOre;
      if (sommaAttOre === 0) {
        bBox.innerHTML = `<span style="font-size:0.75rem;color:var(--muted)">In corso (lavoro previsto ${prev.toFixed(2)}h)</span>`;
      } else if (Math.abs(sommaAttOre - prev) < 0.02) {
        bBox.innerHTML = `<span class="bd g" style="font-weight:700">✓ ${sommaAttOre.toFixed(2)}h / ${prev.toFixed(2)}h previste</span>`;
      } else {
        bBox.innerHTML = `<span class="bd t" style="font-weight:600">Inserite ${sommaAttOre.toFixed(2)}h / Previste ${prev.toFixed(2)}h</span>`;
      }
    } else {
      const targetOre = attInfo.targetOre;
      const diff = Math.abs(sommaAttOre - targetOre);
      if (targetOre === 0 && sommaAttOre === 0) {
        bBox.innerHTML = `<span style="font-size:0.75rem;color:var(--muted)">0h lavorate</span>`;
      } else if (diff < 0.02) {
        bBox.innerHTML = `<span class="bd g" style="font-weight:700">✓ QUADRATO (${sommaAttOre.toFixed(2)}h lavorate)</span>`;
      } else {
        const mancano = targetOre - sommaAttOre;
        bBox.innerHTML = `<span class="bd x" style="font-weight:700">⚠ ATTIVITÀ: ${sommaAttOre.toFixed(2)}h / LAVORATE: ${targetOre.toFixed(2)}h (${mancano > 0 ? 'mancano ' + mancano.toFixed(2) + 'h' : 'in eccesso ' + (-mancano).toFixed(2) + 'h'})</span>`;
      }
    }
  }

  $('attList').innerHTML = l.length ? l.map((a, i) => {
    const oreVal = typeof a.ore === 'number' ? a.ore : parseOreInput(a.ore);
    const catObj = cats.find(c => getCatKey(c) === a.cat);
    const catNome = catObj ? getCatDisplayLabel(catObj, false) : (a.cat ? a.cat.split('|||').pop().replace(/\s+/g, ' ').trim() : 'Attività');
    const subNome = catObj ? getCatGroupLabel(catObj) : (a.cat && a.cat.includes('|||') ? a.cat.split('|||')[1] || a.cat.split('|||')[0] : '');
    return `<div class="tl" style="align-items:flex-start">
      <div style="flex:1">
        <div style="display:flex;align-items:center;gap:6px">
          <span class="bd t" style="font-weight:700">${oreVal.toFixed(2)} h</span>
          <b>${escHtml(catNome)}</b>
        </div>
        ${subNome ? `<div style="font-size:0.73rem;color:var(--muted)">${escHtml(subNome)}</div>` : ''}
        ${a.note ? `<div style="font-size:0.8rem;color:var(--text);margin-top:2px">${escHtml(a.note)}</div>` : ''}
      </div>
      <button class="ib d" onclick="delAtt(${i})" aria-label="Elimina">${IC.bin}</button>
    </div>`;
  }).join('') : '<div class="empty">Nessuna attività registrata per questa giornata</div>';
}

function addAtt() {
  const iso = iso0(currentDate);
  if (bloccato(iso)) return alert('Giornata verificata e bloccata.');
  const attInfo = infoOreAttivitaGiorno(iso);
  if (attInfo.assenteTuttoGiorno) {
    return alert('In una giornata di assenza intera non ci sono ore lavorate da attribuire alle attività.');
  }
  const oreStr = $('attOre').value.trim();
  const ore = parseOreInput(oreStr);
  if (ore <= 0) return alert('Inserisci un numero di ore valido per l\'attività (es. 4.5 o 4:30).');
  const cat = $('attCat').value;
  const n = $('attNote').value.trim();
  
  mut(() => {
    S.att[iso] = S.att[iso] || [];
    S.att[iso].push({ cat, ore, note: n });
    S.exportedAttDays = S.exportedAttDays || {};
    S.exportedAttDays[iso] = true;
  });
  $('attOre').value = '';
  $('attNote').value = '';
  renderAttivita(iso);
}

// ==========================================
// SINCRONIZZAZIONE CALENDARI (GOOGLE, ICS, OUTLOOK)
// ==========================================
const GOOGLE_CLIENT_ID = '736047809787-3t0djo7gsvaeevk6p4tudu30aopljl1a.apps.googleusercontent.com';
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events';
let lastCalAutoSyncTs = 0;
let isSyncingGoogle = false;

const escHtml = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function apriModalOutlook() {
  aggiornaStatoFeedCalUI();
  aggiornaStatoOutlookUI();
  aggiornaStatoGoogleUI();
  if (isGoogleTokenValid()) caricaListaGoogleCalendari();
  apriModal('modalOutlook');
}

function aggiornaStatoOutlookUI() {
  const token = localStorage.getItem('cf_m365_token');
  const badge = $('badgeStatusM365');
  const btnAccedi = $('btnAccediM365');
  const btnSync = $('btnSyncM365');
  const btnDisc = $('btnDisconnettiM365');
  const txt = $('outlookStatusText');

  if (token) {
    if (badge) { badge.textContent = 'Connesso ✓'; badge.className = 'bd g'; }
    if (btnAccedi) btnAccedi.style.display = 'none';
    if (btnSync) btnSync.style.display = 'inline-block';
    if (btnDisc) btnDisc.style.display = 'inline-block';
    if (txt && !isGoogleConfigured()) txt.textContent = 'Account Microsoft 365 Connesso ✓';
  } else {
    if (badge) { badge.textContent = 'Non collegato'; badge.className = 'bd n'; }
    if (btnAccedi) btnAccedi.style.display = 'inline-block';
    if (btnSync) btnSync.style.display = 'none';
    if (btnDisc) btnDisc.style.display = 'none';
    if (txt && !isGoogleConfigured() && !localStorage.getItem('cf_cal_feed_url')) {
      txt.textContent = 'Nessun calendario collegato';
    }
  }
}

function getCanonicalRedirectUri() {
  let p = window.location.origin + window.location.pathname;
  if (p.endsWith('index.html')) p = p.slice(0, -10);
  if (!p.endsWith('/')) p += '/';
  return p;
}

function isGoogleConfigured() {
  if (localStorage.getItem('cf_google_connected') === '1') return true;
  if (S.gcal && S.gcal.connected === true) return true;
  if (localStorage.getItem('cf_google_token')) return true;
  return false;
}

function isGoogleTokenValid() {
  const token = localStorage.getItem('cf_google_token');
  if (!token) return false;
  const exp = +(localStorage.getItem('cf_google_token_exp') || 0);
  if (exp > 0 && Date.now() >= exp - 90000) return false;
  return true;
}

function invalidaTokenGoogle() {
  localStorage.removeItem('cf_google_token');
  localStorage.removeItem('cf_google_token_exp');
}

function getGooglePrimaryEmail() {
  return (S.gcal && S.gcal.email) || localStorage.getItem('cf_google_email') || '';
}

function riallineaConfigGoogleDaCloud() {
  if (S.gcal) {
    if (S.gcal.connected) {
      localStorage.setItem('cf_google_connected', '1');
      if (S.gcal.email) localStorage.setItem('cf_google_email', S.gcal.email);
      if (Array.isArray(S.gcal.selectedCals)) {
        localStorage.setItem('cf_google_selected_cals', JSON.stringify(S.gcal.selectedCals));
      }
    } else if (S.gcal.connected === false && !localStorage.getItem('cf_google_token')) {
      localStorage.removeItem('cf_google_connected');
    }
  } else if (localStorage.getItem('cf_google_token')) {
    localStorage.setItem('cf_google_connected', '1');
  }
}

function salvaConfigGoogleSuStato(patch = {}, syncCloud = true) {
  const cur = S.gcal || {
    connected: isGoogleConfigured(),
    email: getGooglePrimaryEmail(),
    selectedCals: getGoogleSelectedCalendars(),
    calCache: [],
    dismissedIds: [],
    userConfigured: false
  };
  S.gcal = Object.assign({}, cur, patch);
  if (S.gcal.connected) localStorage.setItem('cf_google_connected', '1');
  if (S.gcal.email) localStorage.setItem('cf_google_email', S.gcal.email);
  if (Array.isArray(S.gcal.selectedCals)) {
    localStorage.setItem('cf_google_selected_cals', JSON.stringify(S.gcal.selectedCals));
  }
  save();
  if (syncCloud && typeof triggerAutoSyncCloud === 'function') triggerAutoSyncCloud();
}

function puoUsareOAuthRedirect() {
  const proto = window.location.protocol;
  const host = window.location.hostname;
  return proto === 'https:' || host === 'localhost' || host === '127.0.0.1';
}

function loginGoogle(forzaSceltaAccount = true) {
  const redirectUri = getCanonicalRedirectUri();
  const scopes = encodeURIComponent(GOOGLE_SCOPES);
  const email = getGooglePrimaryEmail();
  sessionStorage.removeItem('cf_gcal_silent_err');
  try {
    if (pagina.cur) sessionStorage.setItem('cf_cur_page', pagina.cur);
  } catch (e) {}
  let authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&include_granted_scopes=true&state=${forzaSceltaAccount ? 'provider_google' : 'google_reconnect'}`;
  if (forzaSceltaAccount) {
    authUrl += '&prompt=select_account';
  } else if (email) {
    authUrl += `&login_hint=${encodeURIComponent(email)}`;
  }
  window.location.href = authUrl;
}

function riconnettiGoogle() {
  // Se non abbiamo ancora provato il rinnovo silenzioso in questa sessione, proviamolo subito (0 clic extra!)
  if (!sessionStorage.getItem('cf_gcal_silent_err') && puoUsareOAuthRedirect()) {
    sessionStorage.removeItem('cf_gcal_silent_ts');
    if (tentaRinnovoSilenziosoGoogle(true)) return;
  }
  // Altrimenti riconnessione rapida con login_hint senza azzerare i calendari scelti
  loginGoogle(false);
}

function tentaRinnovoSilenziosoGoogle(forza = false) {
  if (typeof window.AndroidBridge !== 'undefined' && window.AndroidBridge) {
    if (typeof window.AndroidBridge.refreshGoogleCalendarTokenSilent === 'function') {
      window.AndroidBridge.refreshGoogleCalendarTokenSilent();
    }
    return false;
  }
  if (!isGoogleConfigured() || isGoogleTokenValid()) return false;
  if (navigator.onLine === false || !puoUsareOAuthRedirect()) return false;
  if (!forza && sessionStorage.getItem('cf_gcal_silent_err')) return false;

  const lastTs = +(sessionStorage.getItem('cf_gcal_silent_ts') || 0);
  if (!forza && (Date.now() - lastTs < 5 * 60 * 1000)) return false;

  sessionStorage.setItem('cf_gcal_silent_ts', String(Date.now()));
  try {
    if (pagina.cur) sessionStorage.setItem('cf_cur_page', pagina.cur);
  } catch (e) {}

  const redirectUri = getCanonicalRedirectUri();
  const scopes = encodeURIComponent(GOOGLE_SCOPES);
  const email = getGooglePrimaryEmail();
  let authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&include_granted_scopes=true&prompt=none&state=google_silent`;
  if (email) authUrl += `&login_hint=${encodeURIComponent(email)}`;

  window.location.replace(authUrl);
  return true;
}

function logoutGoogle() {
  const haEventiGoogle = S.ev.some(e => e.googleId);
  const rimuoviAncheEventi = haEventiGoogle
    ? confirm('Vuoi rimuovere dall\'agenda anche gli appuntamenti importati da Google Calendar?\n\n(Gli impegni inseriti a mano resteranno intatti)')
    : false;

  invalidaTokenGoogle();
  localStorage.removeItem('cf_google_connected');
  localStorage.removeItem('cf_google_selected_cals');
  localStorage.removeItem('cf_google_email');
  localStorage.removeItem('cf_last_gcal_sync');
  sessionStorage.removeItem('cf_gcal_silent_err');
  sessionStorage.removeItem('cf_gcal_silent_ts');

  if (rimuoviAncheEventi) {
    S.ev = S.ev.filter(e => !e.googleId);
  }
  S.gcal = { connected: false, email: '', selectedCals: [], calCache: [], dismissedIds: [], userConfigured: false };
  save();
  refresh();
  triggerAutoSyncCloud();
  aggiornaStatoGoogleUI();
  aggiornaStatoOutlookUI();
  toast(rimuoviAncheEventi ? 'Disconnesso da Google Calendar ed eventi importati rimossi.' : 'Disconnesso da Google Calendar.');
}

function pulisciEventiImportati() {
  const count = S.ev.filter(e => e.googleId || e.feedUid || e.isFeedIcs).length;
  if (!count) return toast('Nessun evento importato da calendari esterni presente in agenda.');
  if (!confirm(`Vuoi rimuovere dall'agenda tutti i ${count} eventi scaricati da calendari esterni?\n\nGli impegni creati manualmente non verranno toccati. Se un calendario è attivo, al prossimo sync verranno riscaricati solo gli eventi dei calendari selezionati.`)) return;

  S.ev = S.ev.filter(e => !e.googleId && !e.feedUid && !e.isFeedIcs);
  save();
  refresh();
  triggerAutoSyncCloud();
  aggiornaStatoGoogleUI();
  toast(`Rimossi ${count} eventi importati dall'agenda! ✓`);
}

function checkOAuthRedirect() {
  if (!window.location.hash || window.location.hash.length < 2) return null;
  const rawHash = window.location.hash.slice(1);
  if (!rawHash.includes('access_token=') && !rawHash.includes('error=')) return null;

  const params = new URLSearchParams(rawHash);
  const state = params.get('state') || '';
  if (!state.startsWith('provider_google') && !state.startsWith('google_')) return null;

  const token = params.get('access_token');
  const err = params.get('error');

  // Pulisce l'URL senza lasciare '#' né ricaricare la pagina
  try {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  } catch (e) {
    window.location.hash = '';
  }

  if (token) {
    const expiresIn = parseInt(params.get('expires_in') || '3599', 10);
    localStorage.setItem('cf_google_token', token);
    localStorage.setItem('cf_google_token_exp', String(Date.now() + expiresIn * 1000));
    localStorage.setItem('cf_google_connected', '1');
    sessionStorage.removeItem('cf_gcal_silent_err');
    if (state === 'provider_google') return 'manual_login';
    if (state === 'google_reconnect') return 'reconnect_login';
    return 'silent_login';
  }

  if (err) {
    invalidaTokenGoogle();
    sessionStorage.setItem('cf_gcal_silent_err', err);
    return 'silent_error';
  }

  return null;
}

async function avviaSincronizzazioniIniziali() {
  popolaSelectAttivita();
  const oauthResult = checkOAuthRedirect();

  // 1. Attende l'eventuale login / prima sincronizzazione Cloud privata (Firebase)
  if (window.CF_CLOUD && window.CF_CLOUD.readyPromise) {
    await window.CF_CLOUD.readyPromise;
  }
  riallineaConfigGoogleDaCloud();

  if (typeof aggiornaUIStatoSync === 'function') aggiornaUIStatoSync();
  aggiornaStatoOutlookUI();
  aggiornaStatoFeedCalUI();
  aggiornaStatoGoogleUI();

  // 2. Gestione login / rinnovo automatico / sincronizzazione Google Calendar
  if (oauthResult === 'manual_login') {
    salvaConfigGoogleSuStato({ connected: true }, false);
    await caricaListaGoogleCalendari();
    aggiornaStatoGoogleUI();
    apriModalOutlook();
    toast('Google Calendar collegato! Scegli i calendari da mantenere sincronizzati.');
    await sincronizzaGoogle(false);
  } else if (oauthResult === 'reconnect_login') {
    salvaConfigGoogleSuStato({ connected: true }, false);
    await caricaListaGoogleCalendari();
    aggiornaStatoGoogleUI();
    await sincronizzaGoogle(false);
  } else if (oauthResult === 'silent_login') {
    await caricaListaGoogleCalendari();
    aggiornaStatoGoogleUI();
    await sincronizzaGoogle(true);
  } else if (isGoogleConfigured()) {
    if (isGoogleTokenValid()) {
      await caricaListaGoogleCalendari();
      aggiornaStatoGoogleUI();
      await sincronizzaGoogle(true);
    } else if (oauthResult !== 'silent_error') {
      if (tentaRinnovoSilenziosoGoogle(false)) return;
    }
  }

  // 3. Sincronizza eventuale feed ICS (Metodo 2)
  await sincronizzaFeedCal(false);
}

async function eseguiAutoSyncCalendari() {
  if (document.visibilityState === 'hidden') return;
  if (navigator.onLine === false) return;
  if (isSyncingGoogle || (window.CF_CLOUD && window.CF_CLOUD.isDebouncePending && window.CF_CLOUD.isDebouncePending())) return;

  const now = Date.now();
  if (now - lastCalAutoSyncTs < 25 * 1000) return;
  lastCalAutoSyncTs = now;

  if (typeof syncScaricaDatiCloud === 'function') await syncScaricaDatiCloud(false);
  riallineaConfigGoogleDaCloud();

  if (isGoogleConfigured()) {
    if (isGoogleTokenValid()) {
      await sincronizzaGoogle(true);
    } else {
      aggiornaStatoGoogleUI();
    }
  }

  if (localStorage.getItem('cf_cal_feed_url')) {
    await sincronizzaFeedCal(false);
  }
}

// ==========================================
// GESTIONE MULTI-CALENDARIO GOOGLE
// ==========================================
function getGoogleSelectedCalendars() {
  if (S.gcal && Array.isArray(S.gcal.selectedCals) && (S.gcal.userConfigured || S.gcal.selectedCals.length > 0)) {
    return [...S.gcal.selectedCals];
  }
  const raw = localStorage.getItem('cf_google_selected_cals');
  if (raw !== null) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {}
  }
  const email = getGooglePrimaryEmail();
  return email ? [email] : ['primary'];
}

function setGoogleSelectedCalendars(cals, userConfigured = true) {
  const clean = [...new Set((cals || []).filter(Boolean))];
  localStorage.setItem('cf_google_selected_cals', JSON.stringify(clean));
  salvaConfigGoogleSuStato({ connected: true, selectedCals: clean, userConfigured }, true);
}

function renderBoxListaGoogleCalendari(items) {
  const box = $('listaGoogleCalendari');
  if (!box) return;
  if (!items || !items.length) {
    box.innerHTML = '<div style="font-size:0.8rem;color:var(--muted)">Clicca "Sincronizza ora" per caricare l\'elenco dei tuoi calendari Google.</div>';
    return;
  }
  const selected = getGoogleSelectedCalendars();
  const primaryCal = items.find(c => c.primary);
  const normSelected = primaryCal ? selected.map(id => id === 'primary' ? primaryCal.id : id) : selected;

  box.innerHTML = items.map(c => {
    const isChecked = normSelected.includes(c.id);
    const bgCol = c.backgroundColor || '#4285F4';
    return `<label style="display:flex;align-items:center;gap:8px;font-size:0.84rem;cursor:pointer;padding:4px 2px">
      <input type="checkbox" value="${escHtml(c.id)}" ${isChecked ? 'checked' : ''} onchange="toggleGoogleCalId(this.value, this.checked)">
      <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${escHtml(bgCol)};flex-shrink:0"></span>
      <span style="font-weight:${c.primary ? '700' : '500'}">${escHtml(c.summary || c.id)}${c.primary ? ' (Principale)' : ''}</span>
    </label>`;
  }).join('');
}

async function caricaListaGoogleCalendari() {
  const token = localStorage.getItem('cf_google_token');
  if (!token || !isGoogleTokenValid()) {
    if (S.gcal && Array.isArray(S.gcal.calCache) && S.gcal.calCache.length) {
      renderBoxListaGoogleCalendari(S.gcal.calCache);
    }
    return;
  }

  try {
    const res = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      if (res.status === 401) {
        invalidaTokenGoogle();
        aggiornaStatoGoogleUI();
        return;
      }
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    const items = data.items || [];
    const primaryCal = items.find(c => c.primary);
    const primaryEmail = primaryCal ? primaryCal.id : getGooglePrimaryEmail();

    // Normalizza 'primary' con il vero ID del calendario principale così la spunta coincide sempre
    let selected = getGoogleSelectedCalendars();
    const userConf = !!(S.gcal && S.gcal.userConfigured);
    if (primaryEmail) {
      if (!userConf && (selected.length === 0 || (selected.length === 1 && selected[0] === 'primary'))) {
        selected = [primaryEmail];
      } else if (selected.includes('primary')) {
        selected = [...new Set(selected.map(id => id === 'primary' ? primaryEmail : id))];
      }
    }

    const calCache = items.map(c => ({
      id: c.id,
      summary: c.summaryOverride || c.summary || c.id,
      primary: !!c.primary,
      backgroundColor: c.backgroundColor || '#4285F4',
      accessRole: c.accessRole || ''
    }));

    salvaConfigGoogleSuStato({
      connected: true,
      email: primaryEmail || '',
      selectedCals: selected,
      calCache: calCache,
      userConfigured: userConf || selected.length > 0
    }, true);

    renderBoxListaGoogleCalendari(calCache);
  } catch (err) {
    console.warn('Errore lettura lista calendari Google:', err);
    if (S.gcal && Array.isArray(S.gcal.calCache) && S.gcal.calCache.length) {
      renderBoxListaGoogleCalendari(S.gcal.calCache);
    }
  }
}

async function toggleGoogleCalId(calId, checked) {
  const primaryEmail = getGooglePrimaryEmail();
  let sel = getGoogleSelectedCalendars().map(id => (id === 'primary' && primaryEmail) ? primaryEmail : id);
  if (checked) {
    if (!sel.includes(calId)) sel.push(calId);
  } else {
    sel = sel.filter(id => id !== calId);
    // Rimuove subito gli eventi del calendario appena deselezionato anche se il token fosse scaduto
    const before = S.ev.length;
    S.ev = S.ev.filter(e => e.googleCalId !== calId);
    if (S.ev.length !== before) {
      save();
      refresh();
    }
  }
  setGoogleSelectedCalendars(sel, true);
  if (isGoogleTokenValid()) {
    await sincronizzaGoogle(false);
  } else {
    aggiornaStatoGoogleUI();
  }
}

function aggiornaStatoGoogleUI() {
  const configured = isGoogleConfigured();
  const tokenOk = isGoogleTokenValid();
  const badge = $('badgeStatusGoogle');
  const btnAccedi = $('btnAccediGoogle');
  const rowLogin = $('rowGoogleLogin');
  const boxCals = $('boxGoogleCalendari');
  const txt = $('outlookStatusText');
  const btnSyncModal = $('btnSyncGoogle');
  const btnSyncBar = $('btnSyncGoogleBar');
  const btnPulisci = $('btnPulisciEventiCal');
  const lastSync = localStorage.getItem('cf_last_gcal_sync');
  const email = getGooglePrimaryEmail();
  const countImportati = S.ev.filter(e => e.googleId || e.feedUid || e.isFeedIcs).length;

  if (btnPulisci) {
    btnPulisci.style.display = countImportati > 0 ? 'inline-block' : 'none';
    btnPulisci.textContent = `🧹 Pulisci eventi importati (${countImportati})`;
  }

  if (configured && tokenOk) {
    if (badge) { badge.textContent = 'Connesso ✓'; badge.className = 'bd g'; }
    if (rowLogin) rowLogin.style.display = 'none';
    if (btnAccedi) btnAccedi.style.display = 'none';
    if (boxCals) boxCals.style.display = 'block';
    if (btnSyncModal) btnSyncModal.textContent = '🔄 Sincronizza ora';
    if (btnSyncBar) btnSyncBar.textContent = '🔄 Sincronizza';
    if (txt) txt.textContent = `Google Calendar attivo ✓${lastSync ? ' · sync ' + lastSync : ''}`;
    if (S.gcal && Array.isArray(S.gcal.calCache) && S.gcal.calCache.length) {
      renderBoxListaGoogleCalendari(S.gcal.calCache);
    }
  } else if (configured && !tokenOk) {
    if (badge) { badge.textContent = 'Collegato (rinnova)'; badge.className = 'bd r'; }
    if (rowLogin) rowLogin.style.display = 'none';
    if (btnAccedi) btnAccedi.style.display = 'none';
    if (boxCals) boxCals.style.display = 'block';
    if (btnSyncModal) btnSyncModal.textContent = '🔄 Rinnova e sincronizza ora';
    if (btnSyncBar) btnSyncBar.textContent = '🔄 Aggiorna sync';
    if (txt) txt.textContent = `Google Calendar collegato${email ? ' (' + email + ')' : ''} · clicca Aggiorna sync`;
    if (S.gcal && Array.isArray(S.gcal.calCache) && S.gcal.calCache.length) {
      renderBoxListaGoogleCalendari(S.gcal.calCache);
    }
  } else {
    if (badge) { badge.textContent = 'Non collegato'; badge.className = 'bd n'; }
    if (rowLogin) rowLogin.style.display = 'flex';
    if (btnAccedi) btnAccedi.style.display = 'inline-block';
    if (boxCals) boxCals.style.display = 'none';
    if (btnSyncBar) btnSyncBar.textContent = '🔑 Collega Google';
    if (txt && !localStorage.getItem('cf_cal_feed_url') && !localStorage.getItem('cf_m365_token')) {
      txt.textContent = 'Nessun calendario collegato';
    }
  }
}

// Costruisce il payload evento compatibile con Google Calendar API v3 (singolo giorno, multi-giorno, con o senza orario)
function buildGoogleEventPayload(evento) {
  const dStart = evento.data;
  const dEnd = evFine(evento);
  const rem = evento.reminder !== undefined ? parseInt(evento.reminder, 10) : 30;
  const reminders = rem >= 0
    ? { useDefault: false, overrides: [{ method: 'popup', minutes: rem }] }
    : { useDefault: false, overrides: [] };

  if (evento.ora) {
    const start = new Date(`${dStart}T${evento.ora}:00`);
    let end;
    if (evento.oraFine) {
      end = new Date(`${dEnd}T${evento.oraFine}:00`);
      if (isNaN(end.getTime()) || end <= start) end = new Date(start.getTime() + 60 * 60 * 1000);
    } else if (dEnd > dStart) {
      end = new Date(`${dEnd}T18:00:00`);
      if (isNaN(end.getTime()) || end <= start) end = new Date(start.getTime() + 60 * 60 * 1000);
    } else {
      end = new Date(start.getTime() + 60 * 60 * 1000);
    }
    return {
      summary: evento.titolo,
      location: evento.luogo || '',
      start: { dateTime: start.toISOString(), timeZone: 'Europe/Rome' },
      end: { dateTime: end.toISOString(), timeZone: 'Europe/Rome' },
      reminders
    };
  }

  // Evento giornata intera (singolo o multi-giorno): in Google Calendar end.date è esclusiva (+1 giorno)
  const endExcl = D(dEnd);
  endExcl.setDate(endExcl.getDate() + 1);
  return {
    summary: evento.titolo,
    location: evento.luogo || '',
    start: { date: dStart },
    end: { date: iso0(endExcl) },
    reminders
  };
}

// Esegue le cancellazioni in coda verso Google Calendar
async function eseguiPendingDeletesGoogle() {
  const token = localStorage.getItem('cf_google_token');
  if (!token || !isGoogleTokenValid()) return false;
  if (!S.gcal || !Array.isArray(S.gcal.pendingDeletes) || !S.gcal.pendingDeletes.length) return true;

  const remaining = [];
  let changed = false;

  for (const item of S.gcal.pendingDeletes) {
    if (!item || !item.googleId) continue;
    const calId = item.calId || getWritableSelectedGoogleCalendars()[0] || 'primary';
    try {
      const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(item.googleId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok || res.status === 204 || res.status === 404 || res.status === 410) {
        changed = true;
      } else if (res.status === 403) {
        // Calendario in sola lettura: nascondi localmente così non riappare
        S.gcal.dismissedIds = S.gcal.dismissedIds || [];
        if (!S.gcal.dismissedIds.includes(item.googleId)) S.gcal.dismissedIds.push(item.googleId);
        changed = true;
        toast('Calendario Google in sola lettura: impegno rimosso dall\'app.');
      } else if (res.status === 401) {
        invalidaTokenGoogle();
        remaining.push(item);
      } else {
        remaining.push(item);
      }
    } catch (e) {
      remaining.push(item);
    }
  }

  if (changed || remaining.length !== S.gcal.pendingDeletes.length) {
    S.gcal.pendingDeletes = remaining;
    save();
    triggerAutoSyncCloud();
  }
  return remaining.length === 0;
}

// Invia nuovo impegno creato in Cronoflex sul calendario Google selezionato
async function inviaEventoGoogle(evento, salvaSubito = true) {
  const token = localStorage.getItem('cf_google_token');
  if (!token || !isGoogleTokenValid()) {
    evento.pendingSync = 'create';
    if (salvaSubito) { save(); refresh(); }
    return false;
  }
  try {
    const writable = getWritableSelectedGoogleCalendars();
    const cache = (S.gcal && S.gcal.calCache) || [];
    const primaryEmail = getGooglePrimaryEmail();
    let targetCal = (evento.googleCalId && writable.includes(evento.googleCalId))
      ? evento.googleCalId
      : (writable[0] || primaryEmail || 'primary');

    const payload = buildGoogleEventPayload(evento);
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(targetCal)}/events`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      const created = await res.json();
      const effectiveCalId = (targetCal === 'primary' && primaryEmail) ? primaryEmail : targetCal;
      const calMeta = cache.find(c => c.id === effectiveCalId || c.id === targetCal) || {};
      evento.googleId = created.id;
      evento.googleCalId = effectiveCalId;
      evento.googleCalName = calMeta.summary || evento.googleCalName || '';
      evento.googleCalColor = calMeta.backgroundColor || evento.googleCalColor || '#4285F4';
      delete evento.pendingSync;
      if (salvaSubito) {
        save();
        refresh();
        triggerAutoSyncCloud();
      }
      return true;
    } else if (res.status === 401) {
      invalidaTokenGoogle();
      evento.pendingSync = 'create';
      if (salvaSubito) { save(); aggiornaStatoGoogleUI(); }
    }
  } catch (e) {
    console.warn('Creazione evento su Google Calendar fallita:', e);
    evento.pendingSync = 'create';
    if (salvaSubito) save();
  }
  return false;
}

// Aggiorna su Google Calendar un impegno modificato nell'app (PATCH o spostamento calendario)
async function aggiornaEventoGoogle(evento, moveToCalId = null, salvaSubito = true) {
  if (!evento.googleId) return inviaEventoGoogle(evento, salvaSubito);
  const token = localStorage.getItem('cf_google_token');
  if (!token || !isGoogleTokenValid()) {
    evento.pendingSync = 'update';
    if (salvaSubito) { save(); refresh(); }
    return false;
  }

  const primaryEmail = getGooglePrimaryEmail();
  const cache = (S.gcal && S.gcal.calCache) || [];
  const currentCal = evento.googleCalId || getWritableSelectedGoogleCalendars()[0] || primaryEmail || 'primary';

  try {
    // Se l'utente ha cambiato il calendario di destinazione nel modale: crea sul nuovo e rimuovi dal vecchio
    if (moveToCalId && moveToCalId !== currentCal) {
      const oldGId = evento.googleId;
      const oldCal = currentCal;
      evento.googleCalId = moveToCalId;
      delete evento.googleId;
      const okNew = await inviaEventoGoogle(evento, false);
      if (okNew) {
        await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(oldCal)}/events/${encodeURIComponent(oldGId)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => {});
        if (salvaSubito) { save(); refresh(); triggerAutoSyncCloud(); }
        return true;
      } else {
        evento.googleId = oldGId;
        evento.googleCalId = oldCal;
        return false;
      }
    }

    const payload = buildGoogleEventPayload(evento);
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(currentCal)}/events/${encodeURIComponent(evento.googleId)}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      const effectiveCalId = (currentCal === 'primary' && primaryEmail) ? primaryEmail : currentCal;
      const calMeta = cache.find(c => c.id === effectiveCalId || c.id === currentCal) || {};
      evento.googleCalId = effectiveCalId;
      if (calMeta.summary) evento.googleCalName = calMeta.summary;
      if (calMeta.backgroundColor) evento.googleCalColor = calMeta.backgroundColor;
      delete evento.pendingSync;
      if (salvaSubito) {
        save();
        refresh();
        triggerAutoSyncCloud();
      }
      return true;
    } else if (res.status === 404 || res.status === 410) {
      delete evento.googleId;
      return await inviaEventoGoogle(evento, salvaSubito);
    } else if (res.status === 403) {
      delete evento.pendingSync;
      if (salvaSubito) { save(); refresh(); }
      toast('Calendario Google in sola lettura: modifica salvata localmente.');
      return false;
    } else if (res.status === 401) {
      invalidaTokenGoogle();
      evento.pendingSync = 'update';
      if (salvaSubito) { save(); aggiornaStatoGoogleUI(); }
    }
  } catch (e) {
    console.warn('Aggiornamento evento su Google Calendar fallito:', e);
    evento.pendingSync = 'update';
    if (salvaSubito) save();
  }
  return false;
}

// Allinea verso Google tutte le operazioni locali in sospeso (creazioni, modifiche, eliminazioni)
async function flushPendingOutboundGoogle() {
  if (!isGoogleTokenValid()) return 0;
  let pushed = 0;

  await eseguiPendingDeletesGoogle();

  const selected = getGoogleSelectedCalendars();
  if (!selected.length) return 0;

  for (const e of S.ev) {
    if (e.feedUid || e.isFeedIcs || e.syncGoogle === false) continue;
    if (!e.googleId || e.pendingSync === 'create') {
      const ok = await inviaEventoGoogle(e, false);
      if (ok) pushed++;
    } else if (e.pendingSync === 'update') {
      const ok = await aggiornaEventoGoogle(e, null, false);
      if (ok) pushed++;
    }
  }

  if (pushed > 0) {
    save();
    refresh();
    triggerAutoSyncCloud();
  }
  return pushed;
}

// Sincronizzazione bidirezionale completa (App <-> Calendari Google selezionati)
async function sincronizzaGoogle(silenzioso = false) {
  if (isSyncingGoogle) return;
  const token = localStorage.getItem('cf_google_token');
  if (!token || !isGoogleTokenValid()) {
    if (!silenzioso) {
      if (isGoogleConfigured()) return riconnettiGoogle();
      return apriModalOutlook();
    }
    aggiornaStatoGoogleUI();
    return;
  }

  isSyncingGoogle = true;
  const btn = $('btnSyncGoogle');
  const btnBar = $('btnSyncGoogleBar');
  if (btn) btn.textContent = '⏳ Sincronizzazione...';
  if (btnBar && !silenzioso) btnBar.textContent = '⏳ Sync...';

  try {
    if (!S.gcal || !Array.isArray(S.gcal.calCache) || !S.gcal.calCache.length) {
      await caricaListaGoogleCalendari();
    }

    const primaryEmail = getGooglePrimaryEmail();
    let selectedCals = getGoogleSelectedCalendars();
    if (primaryEmail && selectedCals.includes('primary')) {
      selectedCals = [...new Set(selectedCals.map(id => id === 'primary' ? primaryEmail : id))];
      setGoogleSelectedCalendars(selectedCals, true);
    }

    // FASE 1 (App -> Google): invia subito eliminazioni, nuovi impegni e modifiche locali in coda
    const inviatiAGoogle = await flushPendingOutboundGoogle();
    if (!isGoogleTokenValid()) {
      aggiornaStatoGoogleUI();
      if (!silenzioso) return riconnettiGoogle();
      return;
    }

    // Se nessun calendario è selezionato, rimuove tutti gli eventi Google dall'agenda
    if (selectedCals.length === 0) {
      const before = S.ev.length;
      S.ev = S.ev.filter(e => !e.googleId);
      const removed = before - S.ev.length;
      if (removed > 0) {
        save();
        refresh();
        triggerAutoSyncCloud();
      }
      const nowHm = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
      localStorage.setItem('cf_last_gcal_sync', nowHm);
      aggiornaStatoGoogleUI();
      if (!silenzioso) toast(removed > 0 ? `Rimossi ${removed} eventi dei calendari deselezionati.` : 'Nessun calendario selezionato.');
      caricaAgenda();
      return;
    }

    // FASE 2 (Google -> App): scarica eventi (inclusi multi-giorno) da -90 a +180 giorni
    const timeMin = new Date();
    timeMin.setHours(0, 0, 0, 0);
    timeMin.setDate(timeMin.getDate() - 90);
    const timeMax = new Date();
    timeMax.setHours(23, 59, 59, 999);
    timeMax.setDate(timeMax.getDate() + 180);

    const minISO = iso0(timeMin);
    const maxISO = iso0(timeMax);

    const calMetaMap = {};
    ((S.gcal && S.gcal.calCache) || []).forEach(c => { calMetaMap[c.id] = c; });
    const dismissedSet = new Set((S.gcal && S.gcal.dismissedIds) || []);
    const pendingDelSet = new Set(((S.gcal && S.gcal.pendingDeletes) || []).map(d => d.googleId));

    const liveEvents = new Map();
    const liveByGoogleId = new Map();
    const failedCals = new Set();

    for (const calId of selectedCals) {
      let pageToken = '';
      let pages = 0;
      let calFailed = false;
      const calItems = [];

      do {
        const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events?timeMin=${encodeURIComponent(timeMin.toISOString())}&timeMax=${encodeURIComponent(timeMax.toISOString())}&singleEvents=true&showDeleted=false&orderBy=startTime&maxResults=2500${pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''}`;
        let res;
        try {
          res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        } catch (netErr) {
          calFailed = true;
          break;
        }

        if (!res.ok) {
          if (res.status === 401) {
            invalidaTokenGoogle();
            aggiornaStatoGoogleUI();
            if (!silenzioso) return riconnettiGoogle();
            return;
          }
          if (res.status === 404 || res.status === 410) {
            pageToken = '';
            break;
          }
          calFailed = true;
          break;
        }

        const data = await res.json();
        (data.items || []).forEach(ev => calItems.push(ev));
        pageToken = data.nextPageToken || '';
        pages++;
      } while (pageToken && pages < 5);

      if (calFailed) {
        failedCals.add(calId);
        continue;
      }

      const effectiveCalId = (calId === 'primary' && primaryEmail) ? primaryEmail : calId;
      const calMeta = calMetaMap[effectiveCalId] || calMetaMap[calId] || {};

      calItems.forEach(ev => {
        if (!ev || ev.status === 'cancelled' || !ev.id) return;
        if (dismissedSet.has(ev.id) || pendingDelSet.has(ev.id)) return;
        const dtStart = (ev.start && (ev.start.dateTime || ev.start.date)) || '';
        if (!dtStart) return;

        let isoStart = dtStart.slice(0, 10);
        let isoEnd = isoStart;
        let oraStart = '';
        let oraFine = '';

        if (dtStart.includes('T')) {
          const dObj = new Date(dtStart);
          if (!isNaN(dObj.getTime())) {
            isoStart = iso0(dObj);
            isoEnd = isoStart;
            oraStart = `${String(dObj.getHours()).padStart(2, '0')}:${String(dObj.getMinutes()).padStart(2, '0')}`;
          }
          const dtEnd = ev.end && ev.end.dateTime;
          if (dtEnd) {
            const eObj = new Date(dtEnd);
            if (!isNaN(eObj.getTime())) {
              if (eObj.getHours() === 0 && eObj.getMinutes() === 0 && iso0(eObj) > isoStart) {
                const prevMin = new Date(eObj.getTime() - 60000);
                isoEnd = iso0(prevMin);
                oraFine = '23:59';
              } else {
                const candEnd = iso0(eObj);
                isoEnd = candEnd >= isoStart ? candEnd : isoStart;
                oraFine = `${String(eObj.getHours()).padStart(2, '0')}:${String(eObj.getMinutes()).padStart(2, '0')}`;
              }
            }
          }
        } else {
          // Evento giornata intera: end.date di Google è esclusiva (es. 24->27 novembre = giorni 24, 25, 26)
          const dtEndDate = ev.end && ev.end.date;
          if (dtEndDate && dtEndDate.length >= 10) {
            const endExcl = D(dtEndDate.slice(0, 10));
            endExcl.setDate(endExcl.getDate() - 1);
            const candEnd = iso0(endExcl);
            if (candEnd >= isoStart) isoEnd = candEnd;
          }
        }

        const parsed = {
          googleId: ev.id,
          googleCalId: effectiveCalId,
          googleCalName: calMeta.summary || '',
          googleCalColor: calMeta.backgroundColor || '#4285F4',
          data: isoStart,
          dataFine: isoEnd,
          ora: oraStart,
          oraFine: oraFine,
          titolo: (ev.summary || 'Senza titolo').trim(),
          luogo: (ev.location || '').trim()
        };

        liveEvents.set(`${effectiveCalId}::${ev.id}`, parsed);
        if (!liveByGoogleId.has(ev.id)) {
          liveByGoogleId.set(ev.id, parsed);
        }
      });
    }

    // Riconciliazione bidirezionale: aggiorna modificati, rimuove cancellati o di vecchi calendari, preserva modifiche in attesa
    const selectedNormSet = new Set(selectedCals.map(id => (id === 'primary' && primaryEmail) ? primaryEmail : id));
    const matchedLiveKeys = new Set();

    let importati = 0;
    let aggiornati = 0;
    let rimossi = 0;
    const nextEv = [];

    for (const e of S.ev) {
      if (!e.googleId) {
        nextEv.push(e);
        continue;
      }

      if (e.googleCalId && failedCals.has(e.googleCalId)) {
        nextEv.push(e);
        continue;
      }

      let live = null;
      let liveKey = null;
      if (e.googleCalId) {
        liveKey = `${e.googleCalId}::${e.googleId}`;
        live = liveEvents.get(liveKey) || null;
      } else {
        live = liveByGoogleId.get(e.googleId) || null;
        if (live) liveKey = `${live.googleCalId}::${live.googleId}`;
      }

      if (live && liveKey && !matchedLiveKeys.has(liveKey)) {
        matchedLiveKeys.add(liveKey);
        if (!e.pendingSync) {
          const changed = (
            e.data !== live.data ||
            evFine(e) !== live.dataFine ||
            (e.ora || '') !== live.ora ||
            (e.oraFine || '') !== live.oraFine ||
            e.titolo !== live.titolo ||
            (e.luogo || '') !== live.luogo ||
            e.googleCalId !== live.googleCalId ||
            (e.googleCalName || '') !== live.googleCalName ||
            (e.googleCalColor || '') !== live.googleCalColor
          );
          if (changed) {
            e.data = live.data;
            e.dataFine = live.dataFine;
            e.ora = live.ora;
            e.oraFine = live.oraFine;
            e.titolo = live.titolo;
            e.luogo = live.luogo;
            e.googleCalId = live.googleCalId;
            e.googleCalName = live.googleCalName;
            e.googleCalColor = live.googleCalColor;
            if (e.repId) {
              const rpLink = S.rep.find(r => r.id === e.repId || r.evId === e.id);
              if (rpLink) { rpLink.da = live.data; rpLink.a = live.dataFine; }
            }
            aggiornati++;
          }
        }
        nextEv.push(e);
      } else if (e.pendingSync) {
        nextEv.push(e);
      } else {
        const isUnselectedCal = e.googleCalId && !selectedNormSet.has(e.googleCalId);
        const isLegacyWithoutCal = !e.googleCalId && failedCals.size === 0;
        const overlapsSyncedWindow = evFine(e) >= minISO && e.data <= maxISO;
        if (isUnselectedCal || isLegacyWithoutCal || overlapsSyncedWindow) {
          if (e.repId) {
            S.rep = S.rep.filter(r => r.id !== e.repId && r.evId !== e.id);
          }
          rimossi++;
        } else {
          nextEv.push(e);
        }
      }
    }

    for (const [key, live] of liveEvents.entries()) {
      if (!matchedLiveKeys.has(key)) {
        nextEv.push({
          id: uid(),
          googleId: live.googleId,
          googleCalId: live.googleCalId,
          googleCalName: live.googleCalName,
          googleCalColor: live.googleCalColor,
          data: live.data,
          dataFine: live.dataFine,
          ora: live.ora,
          oraFine: live.oraFine,
          titolo: live.titolo,
          luogo: live.luogo,
          tipo: 'Lavoro',
          fuori: false,
          reminder: 30,
          concluso: false,
          syncGoogle: true
        });
        importati++;
      }
    }

    const anyChange = importati > 0 || aggiornati > 0 || rimossi > 0 || inviatiAGoogle > 0;
    if (importati > 0 || aggiornati > 0 || rimossi > 0) {
      S.ev = nextEv;
      save();
      refresh();
      triggerAutoSyncCloud();
    }

    const nowHm = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    localStorage.setItem('cf_last_gcal_sync', nowHm);
    lastCalAutoSyncTs = Date.now();
    aggiornaStatoGoogleUI();

    if (!silenzioso) {
      const parts = [];
      if (inviatiAGoogle) parts.push(`${inviatiAGoogle} inviati a Google`);
      if (importati) parts.push(`+${importati} nuovi`);
      if (aggiornati) parts.push(`${aggiornati} aggiornati`);
      if (rimossi) parts.push(`${rimossi} rimossi`);
      toast(parts.length ? `Sincronizzazione bidirezionale completata (${parts.join(', ')}) ✓` : 'Calendario già allineato in entrambe le direzioni ✓');
      caricaAgenda();
    } else if (anyChange) {
      caricaAgenda();
    }
  } catch (err) {
    console.warn('Errore sincronizzazione Google:', err);
    if (!silenzioso) alert('Errore sincronizzazione Google: ' + err.message);
  } finally {
    isSyncingGoogle = false;
    aggiornaStatoGoogleUI();
  }
}

// Invia nuovo evento a Microsoft Graph se collegato
async function inviaEventoM365(evento) {
  const token = localStorage.getItem('cf_m365_token');
  if (!token) return;
  try {
    const dStr = `${evento.data}T${evento.ora || '09:00'}:00`;
    const start = new Date(dStr);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const payload = {
      subject: evento.titolo,
      start: { dateTime: start.toISOString(), timeZone: 'Europe/Rome' },
      end: { dateTime: end.toISOString(), timeZone: 'Europe/Rome' },
      location: { displayName: evento.luogo || '' },
      reminderMinutesBeforeStart: parseInt(evento.reminder || 30, 10)
    };
    const res = await fetch('https://graph.microsoft.com/v1.0/me/events', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      const created = await res.json();
      evento.m365Id = created.id;
    }
  } catch (e) {
    console.warn('Sync singolo evento su M365 fallito:', e);
  }
}

// Esportazione e Importazione formato .ics (con supporto multi-giorno)
function esportaCalendarioICS() {
  if (!S.ev.length) return alert('Nessun appuntamento in agenda da esportare.');
  let ics = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Cronoflex//IT\r\nCALSCALE:GREGORIAN\r\n";
  S.ev.forEach(e => {
    const fine = evFine(e);
    ics += "BEGIN:VEVENT\r\n";
    ics += `UID:${e.id}@cronoflex\r\n`;
    ics += `SUMMARY:${e.titolo}\r\n`;
    if (e.luogo) ics += `LOCATION:${e.luogo}\r\n`;
    if (e.ora) {
      const dStart = (e.data || '').replace(/-/g, '') + 'T' + e.ora.replace(':', '') + '00';
      const dEnd = fine.replace(/-/g, '') + 'T' + (e.oraFine ? e.oraFine.replace(':', '') + '00' : e.ora.replace(':', '') + '00');
      ics += `DTSTART:${dStart}\r\n`;
      ics += `DTEND:${dEnd}\r\n`;
    } else {
      const endExcl = D(fine);
      endExcl.setDate(endExcl.getDate() + 1);
      ics += `DTSTART;VALUE=DATE:${(e.data || '').replace(/-/g, '')}\r\n`;
      ics += `DTEND;VALUE=DATE:${iso0(endExcl).replace(/-/g, '')}\r\n`;
    }
    const rem = e.reminder !== undefined ? parseInt(e.reminder, 10) : 30;
    if (rem >= 0) {
      ics += "BEGIN:VALARM\r\nTRIGGER:-PT" + rem + "M\r\nACTION:DISPLAY\r\nDESCRIPTION:Promemoria Cronoflex\r\nEND:VALARM\r\n";
    }
    ics += "END:VEVENT\r\n";
  });
  ics += "END:VCALENDAR\r\n";
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `agenda_cronoflex_${todayISO()}.ics`;
  a.click();
}

function importaCalendarioICS(event) {
  const f = event.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const events = parseICSText(ev.target.result || '');
    let count = 0;
    mut(() => {
      events.forEach(cur => {
        if (!S.ev.some(x => x.data === cur.data && x.titolo === cur.titolo)) {
          S.ev.push({
            id: uid(),
            data: cur.data,
            dataFine: cur.dataFine || cur.data,
            ora: cur.ora || '',
            oraFine: cur.oraFine || '',
            titolo: cur.titolo,
            luogo: cur.luogo || '',
            tipo: 'Lavoro',
            fuori: false,
            reminder: 30,
            concluso: false
          });
          count++;
        }
      });
    });
    toast(`Importati ${count} impegni da file .ics`);
    chiudiModal('modalOutlook');
    caricaAgenda();
  };
  reader.readAsText(f);
}

// =========================================================================
// ESPORTAZIONE EXCEL UFFICIALE INCREMENTALE (IDENTICA AL MODELLO AGESP .XLSX)
// =========================================================================
const XLSX_MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const EXCEL_IDB_NAME = 'cronoflex_excel_store_v1';
const EXCEL_IDB_STORE = 'workbooks';

function openExcelIDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB non disponibile'));
    const req = indexedDB.open(EXCEL_IDB_NAME, 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(EXCEL_IDB_STORE)) db.createObjectStore(EXCEL_IDB_STORE);
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e.target.error);
  });
}

async function excelIdbGet(key) {
  try {
    const db = await openExcelIDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(EXCEL_IDB_STORE, 'readonly');
      const req = tx.objectStore(EXCEL_IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    return null;
  }
}

async function excelIdbSet(key, val) {
  try {
    const db = await openExcelIDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(EXCEL_IDB_STORE, 'readwrite');
      tx.objectStore(EXCEL_IDB_STORE).put(val, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('Salvataggio IndexedDB Excel non riuscito:', e);
  }
}

async function excelIdbDel(key) {
  try {
    const db = await openExcelIDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(EXCEL_IDB_STORE, 'readwrite');
      tx.objectStore(EXCEL_IDB_STORE).delete(key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {}
}

function colIdxToLetter(idx) {
  let s = '', n = idx;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function colLetterToIdx(col) {
  let n = 0;
  for (let i = 0; i < col.length; i++) n = n * 26 + (col.charCodeAt(i) - 64);
  return n;
}

function parseSharedStringsXml(ssDoc) {
  const list = [];
  const map = new Map();
  const sis = ssDoc.getElementsByTagNameNS(XLSX_MAIN_NS, 'si');
  for (let i = 0; i < sis.length; i++) {
    const si = sis[i];
    const ts = si.getElementsByTagNameNS(XLSX_MAIN_NS, 't');
    let txt = '';
    for (let j = 0; j < ts.length; j++) txt += (ts[j].textContent || '');
    list.push(txt);
    if (!map.has(txt)) map.set(txt, i);
  }
  return { list, map };
}

function getOrAddSharedStringIdx(ssDoc, ssState, text) {
  const str = String(text);
  if (ssState.map.has(str)) return ssState.map.get(str);
  const idx = ssState.list.length;
  const sst = ssDoc.documentElement;
  const si = ssDoc.createElementNS(XLSX_MAIN_NS, 'si');
  const t = ssDoc.createElementNS(XLSX_MAIN_NS, 't');
  if (/^\s|\s$/.test(str)) t.setAttribute('xml:space', 'preserve');
  t.textContent = str;
  si.appendChild(t);
  sst.appendChild(si);
  ssState.list.push(str);
  ssState.map.set(str, idx);
  sst.setAttribute('count', String( (+(sst.getAttribute('count') || idx)) + 1 ));
  sst.setAttribute('uniqueCount', String(ssState.list.length));
  return idx;
}

function buildSheetRowMap(sheetDoc) {
  const map = new Map();
  const rows = sheetDoc.getElementsByTagNameNS(XLSX_MAIN_NS, 'row');
  for (let i = 0; i < rows.length; i++) {
    const rn = parseInt(rows[i].getAttribute('r'), 10);
    if (rn) map.set(rn, rows[i]);
  }
  return map;
}

function getOrCreateCellInRow(sheetDoc, rowEl, colLetter, rowNum) {
  const targetRef = `${colLetter}${rowNum}`;
  const targetIdx = colLetterToIdx(colLetter);
  const cells = rowEl.getElementsByTagNameNS(XLSX_MAIN_NS, 'c');
  let insertBeforeEl = null;
  let sampleStyle = null;

  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    const r = c.getAttribute('r') || '';
    if (r === targetRef) return c;
    const cLet = r.replace(/\d+/g, '');
    const cIdx = colLetterToIdx(cLet);
    if (cIdx >= 4 && cIdx <= 34 && c.getAttribute('s')) sampleStyle = c.getAttribute('s');
    if (cIdx > targetIdx && !insertBeforeEl) insertBeforeEl = c;
  }

  const newC = sheetDoc.createElementNS(XLSX_MAIN_NS, 'c');
  newC.setAttribute('r', targetRef);
  if (sampleStyle) newC.setAttribute('s', sampleStyle);
  if (insertBeforeEl) rowEl.insertBefore(newC, insertBeforeEl);
  else rowEl.appendChild(newC);
  return newC;
}

function clearXmlCellValue(cEl) {
  if (!cEl) return;
  cEl.removeAttribute('t');
  const toRemove = [];
  for (let i = 0; i < cEl.childNodes.length; i++) {
    const ch = cEl.childNodes[i];
    if (ch.localName === 'v' || ch.localName === 'is') toRemove.push(ch);
  }
  toRemove.forEach(ch => cEl.removeChild(ch));
}

function setXmlCellNumeric(sheetDoc, cEl, numVal, clearIfZero = true) {
  if (!cEl) return;
  if (clearIfZero && (!numVal || Math.abs(numVal) < 1e-6)) {
    clearXmlCellValue(cEl);
    return;
  }
  cEl.removeAttribute('t');
  const cleanNum = Math.round(numVal * 10000) / 10000;
  let vEl = null;
  const toRemove = [];
  for (let i = 0; i < cEl.childNodes.length; i++) {
    const ch = cEl.childNodes[i];
    if (ch.localName === 'v') vEl = ch;
    else if (ch.localName === 'is') toRemove.push(ch);
  }
  toRemove.forEach(ch => cEl.removeChild(ch));
  if (!vEl) {
    vEl = sheetDoc.createElementNS(XLSX_MAIN_NS, 'v');
    cEl.appendChild(vEl);
  }
  vEl.textContent = String(cleanNum);
}

function setXmlCellSharedString(sheetDoc, ssDoc, ssState, cEl, strVal) {
  if (!cEl) return;
  if (!strVal) {
    clearXmlCellValue(cEl);
    return;
  }
  const sIdx = getOrAddSharedStringIdx(ssDoc, ssState, strVal);
  cEl.setAttribute('t', 's');
  let vEl = null;
  const toRemove = [];
  for (let i = 0; i < cEl.childNodes.length; i++) {
    const ch = cEl.childNodes[i];
    if (ch.localName === 'v') vEl = ch;
    else if (ch.localName === 'is') toRemove.push(ch);
  }
  toRemove.forEach(ch => cEl.removeChild(ch));
  if (!vEl) {
    vEl = sheetDoc.createElementNS(XLSX_MAIN_NS, 'v');
    cEl.appendChild(vEl);
  }
  vEl.textContent = String(sIdx);
}

function setXmlFormulaCachedVal(sheetDoc, cEl, val, isErrorDiv0 = false) {
  if (!cEl) return;
  let vEl = null;
  for (let i = 0; i < cEl.childNodes.length; i++) {
    if (cEl.childNodes[i].localName === 'v') vEl = cEl.childNodes[i];
  }
  if (!vEl) {
    vEl = sheetDoc.createElementNS(XLSX_MAIN_NS, 'v');
    cEl.appendChild(vEl);
  }
  if (isErrorDiv0) {
    cEl.setAttribute('t', 'e');
    vEl.textContent = '#DIV/0!';
  } else {
    cEl.removeAttribute('t');
    vEl.textContent = String(Math.round(val * 100000000) / 100000000);
  }
}

function readXmlCellNumeric(cEl) {
  if (!cEl || cEl.getAttribute('t') === 's' || cEl.getAttribute('t') === 'e') return 0;
  const vs = cEl.getElementsByTagNameNS(XLSX_MAIN_NS, 'v');
  if (!vs.length) return 0;
  const n = parseFloat(vs[0].textContent);
  return isNaN(n) ? 0 : n;
}

function readXmlCellText(cEl, ssState) {
  if (!cEl) return '';
  const t = cEl.getAttribute('t');
  const vs = cEl.getElementsByTagNameNS(XLSX_MAIN_NS, 'v');
  if (t === 's' && vs.length) {
    const idx = parseInt(vs[0].textContent, 10);
    return ssState.list[idx] || '';
  }
  if (vs.length) return vs[0].textContent || '';
  return '';
}

function serializeXmlClean(doc) {
  let xml = new XMLSerializer().serializeToString(doc);
  if (!xml.startsWith('<?xml')) {
    xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + xml;
  }
  return xml;
}

function trovaRigaExcelPerAttivita(catStr, cats) {
  if (!catStr) return null;
  const exact = cats.find(c => getCatKey(c) === catStr);
  if (exact && exact.excelRow) return exact;

  const parts = catStr.split('|||');
  const mac = (parts[0] || '').trim();
  const sub = (parts[1] || '').trim();
  const nom = (parts[2] || parts[0] || '').replace(/\s+/g, ' ').trim();

  const fuzzy = cats.find(c => {
    const cSub = (c.sub || '').trim();
    const cNom = (c.nome || '').replace(/\s+/g, ' ').trim();
    return c.macro === mac && cSub === sub && (cNom === nom || cNom.includes(nom) || nom.includes(cNom));
  });
  return (fuzzy && fuzzy.excelRow) ? fuzzy : null;
}

// Regola Riga 5 (Excel Dirigenza): si distinguono solo FE (<ore>, sempre col numero) e MA (senza ore).
// Festivi e giorni di riposo: sempre vuota. Smart working, pausa non timbrata e straordinario pausa: esclusi.
// FE = somma esatta delle ore dei giustificativi a cartellino (FERIE, EX-FESTIVITA', ORE RECUPERO, ORE 4 NOVEMBRE,
// VISITA MEDICA, CONGEDO PARENTALE, SCIOPERO e quota non compensata del PERMESSO NON RETRIBUITO).
function formatAssenzaExcelGiorno(iso) {
  const td = tipoGiorno(iso);
  if (td.fest || td.rip) return '';
  const gList = gDay(iso);
  if (!gList.length) return '';
  if (gList.some(g => g.tipo === 'MALATTIA')) return 'MA';
  const oreDov = isVen(iso) ? PARAMETRI.oreTeoricheVenerdi : PARAMETRI.oreTeoricheLunGio;
  let feMin = 0;
  gList.forEach(g => {
    if (g.tipo === 'SMART WORKING' || g.tipo === 'PAUSA NON TIMBRATA' || g.tipo === 'STRAORDINARIO PAUSA' || g.tipo === 'PERMESSO NON RETRIBUITO') return;
    let m = (g.tuttaGiornata && !g.durata) ? oreDov : uso(g);
    if (g.tipo === 'SCIOPERO' && !m) m = oreDov;
    if (g.tipo !== 'VISITA MEDICA' && m > 0 && m % 15 !== 0) m = Math.ceil(m / 15) * 15;
    if (g.tipo === 'FERIE' && m > 0 && m < 30) m = 30;
    feMin += m;
  });
  if (gList.some(g => g.tipo === 'PERMESSO NON RETRIBUITO')) {
    const r = calcDay(iso);
    if (r.permessoNonRetrNettoMin !== undefined) feMin += r.permessoNonRetrNettoMin;
    else gList.filter(g => g.tipo === 'PERMESSO NON RETRIBUITO').forEach(g => { const m = uso(g); feMin += m > 0 ? Math.ceil(m / 15) * 15 : 0; });
  }
  if (feMin <= 0) return '';
  return 'FE ' + String(Math.round((feMin / 60) * 100) / 100).replace('.', ',');
}

// Prepara un workbook completamente pulito e riadattato al calendario di un nuovo anno (es. 2027, 2028...)
async function preparaWorkbookAnnoPulito(zip, baseYear, targetYear, parser, ssDoc, ssState) {
  const giorniLettera = ['D', 'L', 'M', 'M', 'G', 'V', 'S'];
  const oldPrefix = `${baseYear}_`;
  const newPrefix = `${targetYear}_`;

  // 1. Aggiorna nomi fogli e Print_Area in workbook.xml se l'anno cambia
  if (String(baseYear) !== String(targetYear)) {
    const wbFile = zip.file('xl/workbook.xml');
    if (wbFile) {
      let wbTxt = await wbFile.async('string');
      wbTxt = wbTxt.split(oldPrefix).join(newPrefix);
      zip.file('xl/workbook.xml', wbTxt);
    }

    const s13File = zip.file('xl/worksheets/sheet13.xml');
    if (s13File) {
      let s13Txt = await s13File.async('string');
      s13Txt = s13Txt.split(oldPrefix).join(newPrefix);
      const s13Doc = parser.parseFromString(s13Txt, 'application/xml');
      const s13Rows = buildSheetRowMap(s13Doc);
      const r2 = s13Rows.get(2);
      if (r2) {
        const d2 = getOrCreateCellInRow(s13Doc, r2, 'D', 2);
        setXmlCellSharedString(s13Doc, ssDoc, ssState, d2, `QUADRO RIASSUNTIVO ANNUO ${targetYear}`);
      }
      zip.file('xl/worksheets/sheet13.xml', serializeXmlClean(s13Doc));
    }
  }

  // 2. Pulisce tutti i 12 fogli mensili e aggiorna intestazioni giorni / stili feriali-weekend del nuovo anno
  for (let m = 1; m <= 12; m++) {
    const sPath = `xl/worksheets/sheet${m}.xml`;
    const sFile = zip.file(sPath);
    if (!sFile) continue;
    const sDoc = parser.parseFromString(await sFile.async('string'), 'application/xml');
    const rowMap = buildSheetRowMap(sDoc);
    const numGiorni = ultimoMese(targetYear, m);
    const baseNumGiorni = ultimoMese(baseYear, m);

    // Intestazione anno AI3
    const r3 = rowMap.get(3);
    if (r3) {
      const ai3 = getOrCreateCellInRow(sDoc, r3, 'AI', 3);
      setXmlCellNumeric(sDoc, ai3, targetYear, false);
    }

    // Adatta stili giorno feriale vs weekend sulle colonne interne (giorni 2..30) se cambia anno
    if (String(baseYear) !== String(targetYear)) {
      let sampleWdDay = 2, sampleWeDay = 6;
      for (let d = 2; d <= Math.min(27, baseNumGiorni); d++) {
        const dw = new Date(baseYear, m - 1, d).getDay();
        if (dw >= 1 && dw <= 4) sampleWdDay = d;
        if (dw === 0 || dw === 6) sampleWeDay = d;
      }
      const wdCol = colIdxToLetter(3 + sampleWdDay);
      const weCol = colIdxToLetter(3 + sampleWeDay);

      for (let rn = 3; rn <= 60; rn++) {
        const rEl = rowMap.get(rn);
        if (!rEl) continue;
        const cWd = getOrCreateCellInRow(sDoc, rEl, wdCol, rn);
        const cWe = getOrCreateCellInRow(sDoc, rEl, weCol, rn);
        const sWd = cWd.getAttribute('s');
        const sWe = cWe.getAttribute('s');
        if (sWd && sWe && sWd !== sWe) {
          for (let d = 2; d <= 30; d++) {
            const colL = colIdxToLetter(3 + d);
            const cell = getOrCreateCellInRow(sDoc, rEl, colL, rn);
            if (d <= numGiorni) {
              const dwNew = new Date(targetYear, m - 1, d).getDay();
              const isWe = (dwNew === 0 || dwNew === 6);
              cell.setAttribute('s', isWe ? sWe : sWd);
            } else {
              cell.setAttribute('s', sWd);
            }
          }
        }
      }
    }

    // Aggiorna Riga 3 (lettera giorno) e Riga 4 (numero giorno) e pulisce Riga 5 (assenze)
    const r4 = rowMap.get(4);
    const r5 = rowMap.get(5);
    for (let d = 1; d <= 31; d++) {
      const colL = colIdxToLetter(3 + d);
      if (r3) {
        const c3 = getOrCreateCellInRow(sDoc, r3, colL, 3);
        if (d <= numGiorni) {
          const dw = new Date(targetYear, m - 1, d).getDay();
          setXmlCellSharedString(sDoc, ssDoc, ssState, c3, giorniLettera[dw]);
        } else {
          clearXmlCellValue(c3);
        }
      }
      if (r4) {
        const c4 = getOrCreateCellInRow(sDoc, r4, colL, 4);
        if (d <= numGiorni) setXmlCellNumeric(sDoc, c4, d, false);
        else clearXmlCellValue(c4);
      }
      if (r5) {
        clearXmlCellValue(getOrCreateCellInRow(sDoc, r5, colL, 5));
      }
    }

    // Ripristina etichette ALTRO (SPECIFICARE) e pulisce tutte le ore (righe 7..38, 41..58)
    const altroDefaults = { 13: 'ALTRO (SPECIFICARE)', 23: 'ALTRO SPECIFICARE:', 58: 'ALTRO (SPECIFICARE):' };
    Object.keys(altroDefaults).forEach(rnStr => {
      const rn = +rnStr;
      const rEl = rowMap.get(rn);
      if (rEl) setXmlCellSharedString(sDoc, ssDoc, ssState, getOrCreateCellInRow(sDoc, rEl, 'C', rn), altroDefaults[rn]);
    });

    for (let rn = 7; rn <= 58; rn++) {
      if (rn === 39 || rn === 40) continue;
      const rEl = rowMap.get(rn);
      if (!rEl) continue;
      for (let d = 1; d <= 31; d++) {
        clearXmlCellValue(getOrCreateCellInRow(sDoc, rEl, colIdxToLetter(3 + d), rn));
      }
      setXmlFormulaCachedVal(sDoc, getOrCreateCellInRow(sDoc, rEl, 'AI', rn), 0, false);
      setXmlFormulaCachedVal(sDoc, getOrCreateCellInRow(sDoc, rEl, 'AJ', rn), 0, true);
    }

    const r60 = rowMap.get(60);
    if (r60) {
      for (let d = 1; d <= 31; d++) {
        setXmlFormulaCachedVal(sDoc, getOrCreateCellInRow(sDoc, r60, colIdxToLetter(3 + d), 60), 0, false);
      }
      setXmlFormulaCachedVal(sDoc, getOrCreateCellInRow(sDoc, r60, 'AI', 60), 0, false);
      setXmlFormulaCachedVal(sDoc, getOrCreateCellInRow(sDoc, r60, 'AJ', 60), 0, true);
    }

    zip.file(sPath, serializeXmlClean(sDoc));
  }
}

// Ricalcola i valori in cache (<v>) delle formule di un foglio mensile e restituisce i totali riga AI7..AI58
function ricalcolaCacheFormuleMeseXml(sDoc, rowMap) {
  const rowTotals = {};
  const dayTotals = new Array(32).fill(0);
  let grandTotal = 0;

  for (let rn = 7; rn <= 58; rn++) {
    if (rn === 39 || rn === 40) continue;
    const rEl = rowMap.get(rn);
    if (!rEl) { rowTotals[rn] = 0; continue; }
    let rSum = 0;
    for (let d = 1; d <= 31; d++) {
      const val = readXmlCellNumeric(getOrCreateCellInRow(sDoc, rEl, colIdxToLetter(3 + d), rn));
      if (val > 0) {
        rSum += val;
        dayTotals[d] += val;
      }
    }
    rowTotals[rn] = Math.round(rSum * 10000) / 10000;
    grandTotal += rowTotals[rn];
  }
  grandTotal = Math.round(grandTotal * 10000) / 10000;

  for (let rn = 7; rn <= 58; rn++) {
    if (rn === 39 || rn === 40) continue;
    const rEl = rowMap.get(rn);
    if (!rEl) continue;
    const ai = getOrCreateCellInRow(sDoc, rEl, 'AI', rn);
    const aj = getOrCreateCellInRow(sDoc, rEl, 'AJ', rn);
    setXmlFormulaCachedVal(sDoc, ai, rowTotals[rn], false);
    if (grandTotal > 0) setXmlFormulaCachedVal(sDoc, aj, rowTotals[rn] / grandTotal, false);
    else setXmlFormulaCachedVal(sDoc, aj, 0, true);
  }

  const r60 = rowMap.get(60);
  if (r60) {
    for (let d = 1; d <= 31; d++) {
      setXmlFormulaCachedVal(sDoc, getOrCreateCellInRow(sDoc, r60, colIdxToLetter(3 + d), 60), dayTotals[d], false);
    }
    setXmlFormulaCachedVal(sDoc, getOrCreateCellInRow(sDoc, r60, 'AI', 60), grandTotal, false);
    if (grandTotal > 0) setXmlFormulaCachedVal(sDoc, getOrCreateCellInRow(sDoc, r60, 'AJ', 60), 1, false);
    else setXmlFormulaCachedVal(sDoc, getOrCreateCellInRow(sDoc, r60, 'AJ', 60), 0, true);
  }

  return { rowTotals, grandTotal };
}

async function rimuoviGialloStylesXml(zip) {
  const stFile = zip.file('xl/styles.xml');
  if (!stFile) return;
  let stTxt = await stFile.async('string');
  if (!/FFFF00/i.test(stTxt)) return;
  stTxt = stTxt
    .replace(/<fgColor\s+rgb="FFFFFF00"\s*\/>\s*<bgColor\s+rgb="(FF[0-9A-Fa-f]{6})"\s*\/>/gi, '<fgColor rgb="$1" /><bgColor rgb="$1" />')
    .replace(/<fgColor\s+rgb="FFFFFF00"\s*\/>/gi, '<fgColor rgb="FFF0F5FA" />');
  zip.file('xl/styles.xml', stTxt);
}

async function recuperaModelloBaseBuffer() {
  const custom = await excelIdbGet('custom_template');
  if (custom && custom.buffer) {
    return {
      buffer: custom.buffer,
      sig: `custom_${custom.uploadedAt}`,
      keepCompiled: custom.keepCompiled !== false,
      fileName: custom.fileName || 'Modello personalizzato'
    };
  }
  const res = await fetch('./modello_dirigenza.xlsx?v=4.48');
  if (!res.ok) throw new Error('Impossibile caricare modello_dirigenza.xlsx dal server.');
  const buf = await res.arrayBuffer();
  return { buffer: buf, sig: 'builtin_dir_new_clean_v4', keepCompiled: false, fileName: 'DIR-NEW AGENDA (Ufficiale)' };
}

async function esportaExcelDirigente(forzaRipartiPulito = false) {
  if (typeof JSZip === 'undefined') {
    return alert('Libreria di compressione Excel (JSZip) in caricamento. Verifica la connessione e riprova.');
  }

  const anno = rie.y || new Date().getFullYear();
  const meseCorrente = rie.m || (new Date().getMonth() + 1);

  try {
    toast('⏳ Generazione foglio Excel ufficiale in corso...');
    const parser = new DOMParser();
    const baseInfo = await recuperaModelloBaseBuffer();
    const progKey = `progressive_${anno}`;
    let prog = forzaRipartiPulito ? null : await excelIdbGet(progKey);

    let zip;
    let isFreshInit = false;
    if (prog && prog.buffer && prog.templateSig === baseInfo.sig) {
      zip = await JSZip.loadAsync(prog.buffer);
    } else {
      zip = await JSZip.loadAsync(baseInfo.buffer);
      isFreshInit = true;
    }
    await rimuoviGialloStylesXml(zip);

    const ssFile = zip.file('xl/sharedStrings.xml');
    if (!ssFile) throw new Error('Il modello Excel selezionato non contiene sharedStrings.xml valido.');
    const ssDoc = parser.parseFromString(await ssFile.async('string'), 'application/xml');
    const ssState = parseSharedStringsXml(ssDoc);

    // Legge l'anno base del modello da sheet1 AI3
    let baseYear = anno;
    const s1File = zip.file('xl/worksheets/sheet1.xml');
    if (s1File) {
      const s1Doc = parser.parseFromString(await s1File.async('string'), 'application/xml');
      const r3 = buildSheetRowMap(s1Doc).get(3);
      if (r3) {
        const yVal = readXmlCellNumeric(getOrCreateCellInRow(s1Doc, r3, 'AI', 3));
        if (yVal >= 2020 && yVal <= 2100) baseYear = yVal;
      }
    }

    // Se è un nuovo anno rispetto al modello (es. 2027+), oppure l'utente ha chiesto di ripartire pulito,
    // oppure il modello caricato era marcato come vuoto -> inizializza tutti i 12 fogli puliti per l'anno!
    if (isFreshInit && (anno !== baseYear || forzaRipartiPulito || !baseInfo.keepCompiled)) {
      await preparaWorkbookAnnoPulito(zip, baseYear, anno, parser, ssDoc, ssState);
    }

    const cats = getCategorieDirigente();
    const allCommessaRows = [...new Set([7, 14, 24, 43, ...cats.map(c => c.excelRow).filter(Boolean)])];

    // Determina quali mesi aggiornare incrementalmente:
    // - Sempre il mese attualmente selezionato (meseCorrente)
    // - Più eventuali mesi <= meseCorrente dell'anno in cui ci sono attività registrate nell'app (S.att)
    const mesiDaAggiornare = new Set([meseCorrente]);
    Object.keys(S.att || {}).forEach(iso => {
      if (iso.startsWith(`${anno}-`) && Array.isArray(S.att[iso]) && S.att[iso].length > 0) {
        const mNum = parseInt(iso.slice(5, 7), 10);
        if (mNum >= 1 && mNum <= 12) mesiDaAggiornare.add(mNum);
      }
    });

    // Aggiorna anche i mesi con soli giustificativi (es. ferie/malattie senza ore lavorate)
    (S.g || []).forEach(g => {
      if (g && g.data && g.data.startsWith(anno + '-')) {
        const mNum = parseInt(g.data.slice(5, 7), 10);
        if (mNum >= 1 && mNum <= 12) mesiDaAggiornare.add(mNum);
      }
    });

    const monthlyRowTotals = {};

    for (let m = 1; m <= 12; m++) {
      const sPath = `xl/worksheets/sheet${m}.xml`;
      const sFile = zip.file(sPath);
      if (!sFile) continue;
      const sDoc = parser.parseFromString(await sFile.async('string'), 'application/xml');
      const rowMap = buildSheetRowMap(sDoc);

      if (mesiDaAggiornare.has(m)) {
        const numGiorni = ultimoMese(anno, m);
        const ym = `${anno}-${String(m).padStart(2, '0')}`;
        const noteAltroPerRiga = {};

        for (let day = 1; day <= numGiorni; day++) {
          const iso = `${ym}-${String(day).padStart(2, '0')}`;
          const colL = colIdxToLetter(3 + day);
          const atts = S.att[iso] || [];
          const wasTouched = !!(S.exportedAttDays && S.exportedAttDays[iso]);

          // 1. Aggiorna ore commesse del giorno (incrementale: tocca i giorni compilati o modificati nell'app, preservando lo storico pregresso)
          if (atts.length > 0 || wasTouched || forzaRipartiPulito) {
            allCommessaRows.forEach(rn => {
              const rEl = rowMap.get(rn);
              if (rEl) clearXmlCellValue(getOrCreateCellInRow(sDoc, rEl, colL, rn));
            });

            const orePerRiga = {};
            atts.forEach(a => {
              const o = typeof a.ore === 'number' ? a.ore : parseOreInput(a.ore);
              if (o <= 0 || !a.cat) return;
              const catMatch = trovaRigaExcelPerAttivita(a.cat, cats);
              if (!catMatch || !catMatch.excelRow) return;
              const rn = catMatch.excelRow;
              orePerRiga[rn] = (orePerRiga[rn] || 0) + o;
              if (catMatch.isAltro && a.note && a.note.trim()) {
                noteAltroPerRiga[rn] = noteAltroPerRiga[rn] || new Set();
                noteAltroPerRiga[rn].add(a.note.trim());
              }
            });

            Object.keys(orePerRiga).forEach(rnStr => {
              const rn = +rnStr;
              const rEl = rowMap.get(rn);
              if (rEl && orePerRiga[rn] > 0) {
                setXmlCellNumeric(sDoc, getOrCreateCellInRow(sDoc, rEl, colL, rn), orePerRiga[rn], true);
              }
            });

            if (atts.length > 0) {
              S.exportedAttDays = S.exportedAttDays || {};
              S.exportedAttDays[iso] = true;
            }
          }

          // 2. Aggiorna Riga 5 Assenze (FE / MA) per il mese esportato
          const r5 = rowMap.get(5);
          if (r5) {
            const sigAss = formatAssenzaExcelGiorno(iso);
            if (sigAss) {
              setXmlCellSharedString(sDoc, ssDoc, ssState, getOrCreateCellInRow(sDoc, r5, colL, 5), sigAss);
            } else if (!baseInfo.keepCompiled || m === meseCorrente || wasTouched || forzaRipartiPulito || tDay(iso).length > 0 || tipoGiorno(iso).fest) {
              clearXmlCellValue(getOrCreateCellInRow(sDoc, r5, colL, 5));
            }
          }
        }

        // Se ci sono note sulle voci ALTRO (SPECIFICARE), aggiorna l'etichetta in colonna C
        Object.keys(noteAltroPerRiga).forEach(rnStr => {
          const rn = +rnStr;
          const notes = [...noteAltroPerRiga[rn]];
          if (notes.length > 0) {
            const cMeta = cats.find(c => c.excelRow === rn);
            const baseLbl = (cMeta && cMeta.baseLabel) ? cMeta.baseLabel.replace(/:$/, '') : 'ALTRO (SPECIFICARE)';
            const rEl = rowMap.get(rn);
            if (rEl) {
              setXmlCellSharedString(sDoc, ssDoc, ssState, getOrCreateCellInRow(sDoc, rEl, 'C', rn), `${baseLbl}: ${notes.join(', ')}`);
            }
          }
        });

        const calcRes = ricalcolaCacheFormuleMeseXml(sDoc, rowMap);
        monthlyRowTotals[m] = calcRes.rowTotals;
        zip.file(sPath, serializeXmlClean(sDoc));
      } else {
        // Legge i totali riga esistenti per allineare la cache del Quadro Riassuntivo Annuo (sheet13)
        const rTots = {};
        for (let rn = 7; rn <= 58; rn++) {
          if (rn === 39 || rn === 40) continue;
          const rEl = rowMap.get(rn);
          rTots[rn] = rEl ? readXmlCellNumeric(getOrCreateCellInRow(sDoc, rEl, 'AI', rn)) : 0;
        }
        monthlyRowTotals[m] = rTots;
      }
    }

    // Aggiorna la cache valori (<v>) del foglio 13 (QUADRO_RIASSUNTIVO_ANNUO) mantenendo intatte tutte le formule
    const s13Path = 'xl/worksheets/sheet13.xml';
    const s13File = zip.file(s13Path);
    if (s13File) {
      const s13Doc = parser.parseFromString(await s13File.async('string'), 'application/xml');
      const r13Map = buildSheetRowMap(s13Doc);
      // Corregge eventuali formule duplicate (es. 'X'!AI42+'X'!AI42) nel Quadro Riassuntivo
      const fEls = s13Doc.getElementsByTagNameNS(XLSX_MAIN_NS, 'f');
      for (let i = 0; i < fEls.length; i++) {
        const mm = /^('[^']+'![A-Z]+\d+)\+\1$/.exec((fEls[i].textContent || '').trim());
        if (mm) fEls[i].textContent = mm[1];
      }
      let grandYearTot = 0;
      const yearRowTots = {};
      const monthColSums = new Array(13).fill(0);

      for (let rn = 7; rn <= 58; rn++) {
        if (rn === 39 || rn === 40) continue;
        const rEl = r13Map.get(rn);
        if (!rEl) continue;
        let yrSum = 0;
        for (let m = 1; m <= 12; m++) {
          const val = (monthlyRowTotals[m] && monthlyRowTotals[m][rn]) || 0;
          const colL = colIdxToLetter(3 + m); // D=Gen(1) .. O=Dic(12)
          setXmlFormulaCachedVal(s13Doc, getOrCreateCellInRow(s13Doc, rEl, colL, rn), val, false);
          yrSum += val;
          monthColSums[m] += val;
        }
        yearRowTots[rn] = Math.round(yrSum * 10000) / 10000;
        grandYearTot += yearRowTots[rn];
        setXmlFormulaCachedVal(s13Doc, getOrCreateCellInRow(s13Doc, rEl, 'P', rn), yearRowTots[rn], false);
      }
      grandYearTot = Math.round(grandYearTot * 10000) / 10000;

      for (let rn = 7; rn <= 58; rn++) {
        if (rn === 39 || rn === 40) continue;
        const rEl = r13Map.get(rn);
        if (!rEl) continue;
        const qCell = getOrCreateCellInRow(s13Doc, rEl, 'Q', rn);
        if (grandYearTot > 0) setXmlFormulaCachedVal(s13Doc, qCell, yearRowTots[rn] / grandYearTot, false);
        else setXmlFormulaCachedVal(s13Doc, qCell, 0, true);
      }

      const r60 = r13Map.get(60);
      if (r60) {
        for (let m = 1; m <= 12; m++) {
          setXmlFormulaCachedVal(s13Doc, getOrCreateCellInRow(s13Doc, r60, colIdxToLetter(3 + m), 60), monthColSums[m], false);
        }
        setXmlFormulaCachedVal(s13Doc, getOrCreateCellInRow(s13Doc, r60, 'P', 60), grandYearTot, false);
        if (grandYearTot > 0) setXmlFormulaCachedVal(s13Doc, getOrCreateCellInRow(s13Doc, r60, 'Q', 60), 1, false);
        else setXmlFormulaCachedVal(s13Doc, getOrCreateCellInRow(s13Doc, r60, 'Q', 60), 0, true);
      }
      zip.file(s13Path, serializeXmlClean(s13Doc));
    }

    // Salva sharedStrings aggiornate
    zip.file('xl/sharedStrings.xml', serializeXmlClean(ssDoc));

    // Rimuove calcChain.xml e imposta ricalcolo automatico + scheda attiva sul mese corrente in workbook.xml
    zip.remove('xl/calcChain.xml');
    const ctFile = zip.file('[Content_Types].xml');
    if (ctFile) {
      let ctTxt = await ctFile.async('string');
      ctTxt = ctTxt.replace(/<Override[^>]*calcChain\.xml[^>]*\/>/gi, '');
      zip.file('[Content_Types].xml', ctTxt);
    }
    const relsFile = zip.file('xl/_rels/workbook.xml.rels');
    if (relsFile) {
      let relsTxt = await relsFile.async('string');
      relsTxt = relsTxt.replace(/<Relationship[^>]*calcChain\.xml[^>]*\/>/gi, '');
      zip.file('xl/_rels/workbook.xml.rels', relsTxt);
    }
    const wbFile = zip.file('xl/workbook.xml');
    if (wbFile) {
      const wbDoc = parser.parseFromString(await wbFile.async('string'), 'application/xml');
      const calcPr = wbDoc.getElementsByTagNameNS(XLSX_MAIN_NS, 'calcPr')[0];
      if (calcPr) calcPr.setAttribute('fullCalcOnLoad', '1');
      const wbView = wbDoc.getElementsByTagNameNS(XLSX_MAIN_NS, 'workbookView')[0];
      if (wbView) wbView.setAttribute('activeTab', String(Math.max(0, meseCorrente - 1)));
      const recPr = wbDoc.getElementsByTagNameNS(XLSX_MAIN_NS, 'fileRecoveryPr')[0];
      if (recPr && recPr.parentNode) recPr.parentNode.removeChild(recPr);
      zip.file('xl/workbook.xml', serializeXmlClean(wbDoc));
    }

    // Genera il binario .xlsx definitivo e lo salva come progressivo annuale in IndexedDB
    const outBuffer = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    await excelIdbSet(progKey, {
      buffer: outBuffer,
      templateSig: baseInfo.sig,
      updatedAt: new Date().toISOString()
    });
    save();

    // Avvia download del file identico al modello ufficiale
    const blob = new Blob([outBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `DIR-NEW ${anno} AGENDA.xlsx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);

    aggiornaInfoModelloExcelUI();
    toast(`Excel ${anno} aggiornato con ${cap(MESI[meseCorrente - 1])} e scaricato! ✓`);
  } catch (err) {
    console.error('Errore esportazione Excel:', err);
    alert('Errore durante la generazione del file Excel: ' + err.message);
  }
}

// Estrae automaticamente le righe commessa se un nuovo modello .xlsx caricato ha voci diverse
async function estraiCategorieDaNuovoModelloZip(zip) {
  try {
    const parser = new DOMParser();
    const ssFile = zip.file('xl/sharedStrings.xml');
    const s1File = zip.file('xl/worksheets/sheet1.xml');
    if (!ssFile || !s1File) return null;

    const ssDoc = parser.parseFromString(await ssFile.async('string'), 'application/xml');
    const ssState = parseSharedStringsXml(ssDoc);
    const s1Doc = parser.parseFromString(await s1File.async('string'), 'application/xml');
    const rowMap = buildSheetRowMap(s1Doc);

    let curMacro = 'GESTIONE ORDINARIA';
    let curSub = null;
    const extracted = [];

    for (let rn = 6; rn <= 80; rn++) {
      const rEl = rowMap.get(rn);
      if (!rEl) continue;
      const cCell = getOrCreateCellInRow(s1Doc, rEl, 'C', rn);
      const aiCell = getOrCreateCellInRow(s1Doc, rEl, 'AI', rn);
      const label = readXmlCellText(cCell, ssState);
      const cleanLbl = label.trim();
      if (cleanLbl === 'TOTALI') break;
      if (!cleanLbl) { curSub = null; continue; }

      const hasFormula = aiCell && aiCell.getElementsByTagNameNS(XLSX_MAIN_NS, 'f').length > 0;
      if (/^GESTIONE ORDINARIA$/i.test(cleanLbl)) { curMacro = 'GESTIONE ORDINARIA'; curSub = null; continue; }
      if (/^GESTIONE STRAORDINARIA$/i.test(cleanLbl)) { curMacro = 'GESTIONE STRAORDINARIA'; curSub = null; continue; }

      // Verifica se la riga successiva appartiene a un sottogruppo (es. ORD., ORDINARIA COMUNE..., ORDINARIA AGESP AMBIENTE, AGESP AMBIENTE PER IL TER.)
      const isKnownSubHeader = /^(ORD\.|ORDINARIA COMUNE|ORDINARIA AGESP AMBIENTE|AGESP AMBIENTE PER IL TER)/i.test(cleanLbl);
      if (isKnownSubHeader) {
        curSub = cleanLbl;
        continue;
      }

      // Se arriviamo a voci autonome dirette fuori dal sottogruppo
      if (/^(ORDINARIA AGESP ENERGIA|ORDINARIA PREALPI GAS|AGESP ENERGIA|PREALPI GAS)$/i.test(cleanLbl) ||
          (curMacro === 'GESTIONE STRAORDINARIA' && /^ALTRO/i.test(cleanLbl))) {
        curSub = null;
      }

      if (hasFormula) {
        const isAltro = /^ALTRO/i.test(cleanLbl);
        extracted.push({
          excelRow: rn,
          macro: curMacro,
          sub: curSub,
          nome: label,
          isAltro: isAltro,
          baseLabel: isAltro ? cleanLbl : undefined
        });
      }
    }

    return extracted.length >= 5 ? extracted : null;
  } catch (e) {
    console.warn('Estrazione categorie da modello personalizzato non riuscita:', e);
    return null;
  }
}

async function apriModalModelloExcel() {
  await aggiornaInfoModelloExcelUI();
  apriModal('modalModelloExcel');
}

async function aggiornaInfoModelloExcelUI() {
  const box = $('infoModelloExcelAttivo');
  const btnResetMod = $('btnRipristinaModelloDefault');
  const anno = rie.y || new Date().getFullYear();
  if ($('lblAnnoResetExcel')) $('lblAnnoResetExcel').textContent = String(anno);

  const custom = await excelIdbGet('custom_template');
  const prog = await excelIdbGet(`progressive_${anno}`);

  if (box) {
    const modName = custom ? `📌 Personalizzato: <b>${escHtml(custom.fileName)}</b>` : `✅ Ufficiale integrato: <b>DIR-NEW AGENDA (AGESP)</b>`;
    const progInfo = prog
      ? `Archivio incrementale ${anno} attivo (ultimo aggiornamento: ${new Date(prog.updatedAt).toLocaleString('it-IT')})`
      : `Pronto per l'anno ${anno} (verrà inizializzato alla prima esportazione e riparte pulito ogni nuovo anno)`;
    box.innerHTML = `<div style="font-size:0.84rem;margin-bottom:4px">${modName}</div><div style="font-size:0.78rem;color:var(--muted)">${progInfo}</div>`;
  }
  if (btnResetMod) {
    btnResetMod.style.display = custom ? 'inline-block' : 'none';
  }
}

async function caricaNuovoModelloExcel(event) {
  const f = event.target.files && event.target.files[0];
  if (!f) return;
  try {
    if (typeof JSZip === 'undefined') return alert('Libreria JSZip non ancora caricata.');
    const buf = await f.arrayBuffer();
    const zip = await JSZip.loadAsync(buf);
    if (!zip.file('xl/workbook.xml') || !zip.file('xl/worksheets/sheet1.xml')) {
      return alert('Il file selezionato non sembra essere un modello Excel (.xlsx) valido.');
    }

    const keepCompiled = confirm(
      `Modello "${f.name}" letto correttamente!\n\n` +
      `• Premi OK se questo file contiene già mesi precedenti compilati da mantenere come base incrementale.\n` +
      `• Premi Annulla se vuoi usarlo come modello vuoto pulito.`
    );

    const extractedCats = await estraiCategorieDaNuovoModelloZip(zip);
    const sameAsDefault = extractedCats && extractedCats.length === DEFAULT_CATEGORIE_DIRIGENTE.length &&
      extractedCats.every((c, idx) => c.excelRow === DEFAULT_CATEGORIE_DIRIGENTE[idx].excelRow && c.nome.trim() === DEFAULT_CATEGORIE_DIRIGENTE[idx].nome.trim());

    await excelIdbSet('custom_template', {
      buffer: buf,
      fileName: f.name,
      uploadedAt: new Date().toISOString(),
      keepCompiled
    });
    const anno = rie.y || new Date().getFullYear();
    await excelIdbDel(`progressive_${anno}`);

    mut(() => {
      S.customCatDir = (!sameAsDefault && extractedCats) ? extractedCats : null;
    });
    popolaSelectAttivita(true);
    await aggiornaInfoModelloExcelUI();
    event.target.value = '';
    toast(`Nuovo modello "${f.name}" salvato e attivato! ✓`);
  } catch (err) {
    alert('Errore nel caricamento del modello .xlsx: ' + err.message);
  }
}

async function ripristinaModelloExcelPredefinito() {
  if (!confirm('Ripristinare il modello Excel ufficiale predefinito (DIR-NEW AGENDA)?')) return;
  const anno = rie.y || new Date().getFullYear();
  await excelIdbDel('custom_template');
  await excelIdbDel(`progressive_${anno}`);
  mut(() => { S.customCatDir = null; });
  popolaSelectAttivita(true);
  await aggiornaInfoModelloExcelUI();
  toast('Modello ufficiale predefinito ripristinato! ✓');
}

async function ripartiFoglioPulitoAnno() {
  const anno = rie.y || new Date().getFullYear();
  if (!confirm(`Vuoi rigenerare il foglio dell'anno ${anno} partendo completamente pulito (inserendo solo le ore registrate nell'app per il ${anno})?`)) return;
  await excelIdbDel(`progressive_${anno}`);
  chiudiModal('modalModelloExcel');
  await esportaExcelDirigente(true);
}



// La sincronizzazione Cloud multi-utente (Google + Email/Password su Firestore) è gestita in firebase-sync.js


// ==========================================
// GESTIONE PARAMETRI ORARIO PERSONALI
// ==========================================
const DEFAULT_PARAMETRI = {
  fasciaIngressoInizio: 8 * 60,      // 08:00
  fasciaIngressoFine: 9 * 60,        // 09:00
  pausaMinimaMinuti: 30,
  pausaFineFinestra: 14 * 60 + 15,   // 14:15
  uscitaMinimaLunGio: 17 * 60 + 15,  // 17:15
  oreTeoricheLunGio: 8 * 60,         // 480 min
  oreTeoricheVenerdi: 6 * 60,        // 360 min
  scattoMinimoStraordinario: 30,
  scattoSuccessivoStraordinario: 15,
  tettoBancaOre: 40 * 60,            // 2400 min
  santoPatrono: '06-24',             // S. Giovanni (Busto Arsizio), personalizzabile ('' = nessuno)
  festiviExtra: ''                   // altri festivi ricorrenti 'MM-DD' separati da virgola
};

function applicaParametri() {
  const p = S.prm || {};
  PARAMETRI = Object.assign({}, DEFAULT_PARAMETRI, p);
  festivi.c = {};
}

function caricaParametriOrario() {
  applicaParametri();
  if ($('paramFasciaInizio')) $('paramFasciaInizio').value = T(PARAMETRI.fasciaIngressoInizio);
  if ($('paramFasciaFine')) $('paramFasciaFine').value = T(PARAMETRI.fasciaIngressoFine);
  if ($('paramOreLunGio')) $('paramOreLunGio').value = T(PARAMETRI.oreTeoricheLunGio);
  if ($('paramOreVen')) $('paramOreVen').value = T(PARAMETRI.oreTeoricheVenerdi);
  if ($('paramPausaMin')) $('paramPausaMin').value = PARAMETRI.pausaMinimaMinuti;
  if ($('paramPausaFine')) $('paramPausaFine').value = T(PARAMETRI.pausaFineFinestra);
  if ($('paramUscitaMin')) $('paramUscitaMin').value = T(PARAMETRI.uscitaMinimaLunGio);
  if ($('paramTettoBanca')) $('paramTettoBanca').value = T(PARAMETRI.tettoBancaOre);
  if ($('paramScattoMin')) $('paramScattoMin').value = PARAMETRI.scattoMinimoStraordinario;
  if ($('paramScattoSucc')) $('paramScattoSucc').value = PARAMETRI.scattoSuccessivoStraordinario;
  if ($('paramSantoPatrono')) $('paramSantoPatrono').value = fmtGiornoMeseIT(PARAMETRI.santoPatrono);
  if ($('paramFestiviExtra')) $('paramFestiviExtra').value = String(PARAMETRI.festiviExtra || '').split(',').map(fmtGiornoMeseIT).filter(Boolean).join(', ');
}

function salvaParametriOrario() {
  const fi = P($('paramFasciaInizio').value);
  const ff = P($('paramFasciaFine').value);
  const olg = P($('paramOreLunGio').value);
  const ov = P($('paramOreVen').value);
  const pmin = parseInt($('paramPausaMin').value, 10);
  const pfine = P($('paramPausaFine').value);
  const umin = P($('paramUscitaMin').value);
  const tb = P($('paramTettoBanca').value);
  const smin = parseInt($('paramScattoMin').value, 10);
  const ssucc = parseInt($('paramScattoSucc').value, 10);
  const sp = parseGiornoMeseRicorrente($('paramSantoPatrono') ? $('paramSantoPatrono').value : '');
  if (sp === null) return alert('Santo Patrono non valido: usa il formato GG/MM (es. 24/06) oppure lascia vuoto per disattivarlo.');
  const feRaw = ($('paramFestiviExtra') ? $('paramFestiviExtra').value : '').split(',').map(s => s.trim()).filter(Boolean);
  const feConv = feRaw.map(parseGiornoMeseRicorrente);
  if (feConv.some(x => !x)) return alert('Altri festivi non validi: usa il formato GG/MM separando le date con la virgola (es. 07/12, 15/09).');

  if (fi === null || ff === null || olg === null || ov === null || isNaN(pmin) || pfine === null || umin === null || tb === null || isNaN(smin) || isNaN(ssucc)) {
    return alert('Tutti i campi devono contenere valori validi.');
  }

  mut(() => {
    S.prm = {
      fasciaIngressoInizio: fi,
      fasciaIngressoFine: ff,
      oreTeoricheLunGio: olg,
      oreTeoricheVenerdi: ov,
      pausaMinimaMinuti: pmin,
      pausaFineFinestra: pfine,
      uscitaMinimaLunGio: umin,
      tettoBancaOre: tb,
      scattoMinimoStraordinario: smin,
      scattoSuccessivoStraordinario: ssucc,
      santoPatrono: sp,
      festiviExtra: feConv.join(',')
    };
  });
  applicaParametri();
  toast('Parametri orario salvati con successo! ✓');
}

function ripristinaParametriPredefiniti() {
  if (confirm('Vuoi ripristinare i parametri orari ai valori contrattuali predefiniti?')) {
    mut(() => { S.prm = null; });
    applicaParametri();
    caricaParametriOrario();
    toast('Parametri ripristinati ai valori predefiniti.');
  }
}


// ==========================================
// SINCRONIZZAZIONE DIRETTA VIA FEED ICAL/WEBCAL
// ==========================================
function parseICSText(txt) {
  const lines = txt.split(/\r?\n/);
  const events = [];
  let cur = null;

  for (let i = 0; i < lines.length; i++) {
    let l = lines[i];
    // Gestione continuazione riga RFC 5545 (se inizia con spazio o tab)
    while (i + 1 < lines.length && (lines[i + 1].startsWith(' ') || lines[i + 1].startsWith('\t'))) {
      l += lines[i + 1].slice(1);
      i++;
    }

    if (l.startsWith('BEGIN:VEVENT')) {
      cur = {};
    } else if (l.startsWith('END:VEVENT')) {
      if (cur && cur.data && cur.titolo) {
        if (!cur.dataFine || cur.dataFine < cur.data) cur.dataFine = cur.data;
        events.push(cur);
      }
      cur = null;
    } else if (cur) {
      if (l.startsWith('SUMMARY:')) {
        cur.titolo = l.slice(8).replace(/\\,/g, ',').replace(/\\;/g, ';').trim();
      } else if (l.startsWith('LOCATION:')) {
        cur.luogo = l.slice(9).replace(/\\,/g, ',').replace(/\\;/g, ';').trim();
      } else if (l.startsWith('UID:')) {
        cur.uid = l.slice(4).trim();
      } else if (l.startsWith('DTSTART')) {
        const val = l.split(':').pop().trim();
        if (val.length >= 8) {
          const yr = parseInt(val.slice(0, 4), 10);
          const mo = parseInt(val.slice(4, 6), 10);
          const dy = parseInt(val.slice(6, 8), 10);
          cur.data = `${val.slice(0, 4)}-${val.slice(4, 6)}-${val.slice(6, 8)}`;
          cur._allDay = !val.includes('T');
          if (val.includes('T') && val.length >= 13) {
            const tPart = val.split('T')[1];
            const hh = parseInt(tPart.slice(0, 2), 10);
            const mm = parseInt(tPart.slice(2, 4), 10);
            if (val.endsWith('Z')) {
              const utcD = new Date(Date.UTC(yr, mo - 1, dy, hh, mm));
              cur.data = iso0(utcD);
              cur.ora = `${String(utcD.getHours()).padStart(2, '0')}:${String(utcD.getMinutes()).padStart(2, '0')}`;
            } else {
              cur.ora = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
            }
          }
        }
      } else if (l.startsWith('DTEND')) {
        const val = l.split(':').pop().trim();
        if (val.length >= 8) {
          const yr = parseInt(val.slice(0, 4), 10);
          const mo = parseInt(val.slice(4, 6), 10);
          const dy = parseInt(val.slice(6, 8), 10);
          if (val.includes('T') && val.length >= 13) {
            const tPart = val.split('T')[1];
            const hh = parseInt(tPart.slice(0, 2), 10);
            const mm = parseInt(tPart.slice(2, 4), 10);
            const endD = val.endsWith('Z') ? new Date(Date.UTC(yr, mo - 1, dy, hh, mm)) : new Date(yr, mo - 1, dy, hh, mm);
            if (endD.getHours() === 0 && endD.getMinutes() === 0 && cur.data && iso0(endD) > cur.data) {
              const prev = new Date(endD.getTime() - 60000);
              cur.dataFine = iso0(prev);
              cur.oraFine = '23:59';
            } else {
              cur.dataFine = iso0(endD);
              cur.oraFine = `${String(endD.getHours()).padStart(2, '0')}:${String(endD.getMinutes()).padStart(2, '0')}`;
            }
          } else {
            const endExcl = D(`${val.slice(0, 4)}-${val.slice(4, 6)}-${val.slice(6, 8)}`);
            endExcl.setDate(endExcl.getDate() - 1);
            cur.dataFine = iso0(endExcl);
          }
        }
      }
    }
  }
  return events;
}

function aggiornaStatoFeedCalUI() {
  const url = localStorage.getItem('cf_cal_feed_url');
  const badge = $('badgeStatusCalUrl');
  const inp = $('calFeedUrl');
  const btnRimuovi = $('btnRimuoviFeedCal');
  const txt = $('outlookStatusText');

  if (url) {
    if (badge) { badge.textContent = 'Collegato ✓'; badge.className = 'bd g'; }
    if (inp) inp.value = url;
    if (btnRimuovi) btnRimuovi.style.display = 'inline-block';
    if (txt && !isGoogleConfigured()) txt.textContent = 'Calendario sincronizzato via Link ICS ✓';
  } else {
    if (badge) { badge.textContent = 'Non attivo'; badge.className = 'bd n'; }
    if (btnRimuovi) btnRimuovi.style.display = 'none';
  }
}

async function salvaESincronizzaFeedCal() {
  let url = ($('calFeedUrl') ? $('calFeedUrl').value.trim() : '');
  if (!url) return alert('Incolla il link ICS del tuo calendario.');
  if (url.startsWith('webcal://')) url = 'https://' + url.slice(9);
  localStorage.setItem('cf_cal_feed_url', url);
  aggiornaStatoFeedCalUI();
  await sincronizzaFeedCal(true);
}

function rimuoviFeedCal() {
  if (confirm('Vuoi rimuovere il link del calendario e ripulire gli appuntamenti importati dal link?')) {
    localStorage.removeItem('cf_cal_feed_url');
    if ($('calFeedUrl')) $('calFeedUrl').value = '';
    S.ev = S.ev.filter(e => !e.feedUid && !e.isFeedIcs);
    save();
    refresh();
    triggerAutoSyncCloud();
    aggiornaStatoFeedCalUI();
    aggiornaStatoGoogleUI();
    toast('Link calendario ed eventi associati rimossi.');
  }
}

async function sincronizzaFeedCal(notificaUser = false) {
  let url = localStorage.getItem('cf_cal_feed_url');
  if (!url) return;
  if (url.startsWith('webcal://')) url = 'https://' + url.slice(9);

  try {
    let fetchUrl = url;
    let res;
    try {
      res = await fetch(fetchUrl);
    } catch (e) {
      fetchUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url);
      res = await fetch(fetchUrl);
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const icsText = await res.text();
    const events = parseICSText(icsText);

    const liveMap = new Map();
    events.forEach(ev => {
      const key = ev.uid || `${ev.data}::${ev.titolo}`;
      liveMap.set(key, ev);
    });

    const matchedKeys = new Set();
    let nuovi = 0, aggiornati = 0, rimossi = 0;
    const nextEv = [];

    for (const e of S.ev) {
      if (!e.feedUid && !e.isFeedIcs) {
        nextEv.push(e);
        continue;
      }
      const key = e.feedUid || `${e.data}::${e.titolo}`;
      const live = liveMap.get(key);
      if (live && !matchedKeys.has(key)) {
        matchedKeys.add(key);
        const liveFine = live.dataFine || live.data;
        if (e.data !== live.data || evFine(e) !== liveFine || (e.ora || '') !== (live.ora || '') || (e.oraFine || '') !== (live.oraFine || '') || e.titolo !== live.titolo || (e.luogo || '') !== (live.luogo || '') || !e.isFeedIcs) {
          e.data = live.data;
          e.dataFine = liveFine;
          e.ora = live.ora || '';
          e.oraFine = live.oraFine || '';
          e.titolo = live.titolo;
          e.luogo = live.luogo || '';
          e.feedUid = key;
          e.isFeedIcs = true;
          aggiornati++;
        }
        nextEv.push(e);
      } else {
        rimossi++;
      }
    }

    for (const [key, ev] of liveMap.entries()) {
      if (!matchedKeys.has(key)) {
        nextEv.push({
          id: uid(),
          feedUid: key,
          isFeedIcs: true,
          data: ev.data,
          dataFine: ev.dataFine || ev.data,
          ora: ev.ora || '',
          oraFine: ev.oraFine || '',
          titolo: ev.titolo,
          luogo: ev.luogo || '',
          tipo: 'Lavoro',
          fuori: false,
          reminder: 30,
          concluso: false
        });
        nuovi++;
      }
    }

    if (nuovi > 0 || aggiornati > 0 || rimossi > 0) {
      S.ev = nextEv;
      save();
      refresh();
      triggerAutoSyncCloud();
    }

    if (notificaUser) {
      toast(`Calendario ICS sincronizzato (+${nuovi} nuovi, ${aggiornati} aggiornati, ${rimossi} rimossi) ✓`);
      chiudiModal('modalOutlook');
    }
    caricaAgenda();
  } catch (err) {
    console.warn('Errore lettura feed calendario:', err);
    if (notificaUser) alert('Impossibile scaricare il calendario dal link indicato. Verifica che il link sia corretto e pubblico.');
  }
}


// ==========================================
// VISTA MESE A GRIGLIA PER AGENDA
// ==========================================
let vistaAgendaCur = 'mese';

function setVistaAgenda(v) {
  vistaAgendaCur = v;
  const btnE = $('btnVistaElenco');
  const btnM = $('btnVistaMese');
  const boxE = $('boxVistaElencoAgenda');
  const boxM = $('boxVistaMeseAgenda');

  if (v === 'mese') {
    if (btnE) btnE.classList.remove('on');
    if (btnM) btnM.classList.add('on');
    if (boxE) boxE.style.display = 'none';
    if (boxM) boxM.style.display = 'block';
    renderVistaMeseGriglia(ymStr(rie.y, rie.m));
  } else {
    if (btnE) btnE.classList.add('on');
    if (btnM) btnM.classList.remove('on');
    if (boxE) boxE.style.display = 'block';
    if (boxM) boxM.style.display = 'none';
    if ($('agList') && !$('agList').children.length) caricaAgenda();
  }
}

function renderVistaMeseGriglia(ym) {
  const box = $('agMeseGriglia');
  if (!box) return;
  const y = +ym.slice(0, 4), m = +ym.slice(5, 7);
  const numGiorni = ultimoMese(y, m);
  const primoGiorno = new Date(y, m - 1, 1).getDay(); // 0 = dom, 1 = lun...
  const offset = (primoGiorno === 0 ? 6 : primoGiorno - 1); // Lunedì = 0

  let html = `<div class="ag-cal-head">
    <div>LUN</div><div>MAR</div><div>MER</div><div>GIO</div><div>VEN</div><div style="color:var(--danger)">SAB</div><div style="color:var(--danger)">DOM</div>
  </div>`;

  html += `<div class="ag-cal-grid">`;

  // Spazi vuoti prima del primo giorno
  for (let i = 0; i < offset; i++) {
    html += `<div class="ag-cal-cell empty"></div>`;
  }

  // Giorni del mese
  for (let d = 1; d <= numGiorni; d++) {
    const iso = `${ym}-${String(d).padStart(2, '0')}`;
    const evGiorno = S.ev.filter(e => evCopreGiorno(e, iso));
    const todoGiorno = (S.todo || []).filter(t => t.data === iso);
    const isOggi = iso === todayISO();

    html += `<div onclick="currentDate=D('${iso}');pagina('oggi')" class="ag-cal-cell${isOggi ? ' today' : ''}">
      <div class="ag-cal-num">${d}</div>
      <div class="ag-cal-items">
        ${evGiorno.slice(0, 2).map(e => {
          const done = isEvConcluso(e, iso);
          const col = e.googleCalColor || '#1f8fd0';
          const oraCell = (iso === e.data && e.ora) ? (e.ora + ' ') : '';
          return `<div class="ag-cal-ev" style="background:${ isMultiGiorno(e) ? 'rgba(31,143,208,0.18)' : 'rgba(31,143,208,0.10)' };border-left:2.5px solid ${escHtml(col)};${done ? 'text-decoration:line-through;opacity:0.6' : ''}">${escHtml(oraCell + e.titolo)}</div>`;
        }).join('')}
        ${evGiorno.length > 2 ? `<div class="ag-cal-more">+${evGiorno.length - 2} altri</div>` : ''}
        ${todoGiorno.length ? `<div class="ag-cal-todo">✓ ${todoGiorno.filter(x=>x.fatto).length}/${todoGiorno.length}</div>` : ''}
      </div>
    </div>`;
  }

  html += `</div>`;
  box.innerHTML = html;
}


// ==========================================
// IMPORTAZIONE ATTIVITA' SVOLTE DA EXCEL DIRIGENZA COMPILATO (.xlsx)
// ==========================================
async function importaAttivitaDaExcelFile(event) {
  const f = event.target.files && event.target.files[0];
  if (!f) return;
  try {
    if (typeof JSZip === 'undefined') return alert('Libreria JSZip non ancora caricata.');
    const zip = await JSZip.loadAsync(await f.arrayBuffer());
    const ssF = zip.file('xl/sharedStrings.xml');
    if (!ssF || !zip.file('xl/worksheets/sheet1.xml')) return alert('Il file selezionato non sembra un Excel dirigenza valido.');
    const parser = new DOMParser();
    const ssState = parseSharedStringsXml(parser.parseFromString(await ssF.async('string'), 'application/xml'));
    const cats = getCategorieDirigente();
    let anno = null;
    const trovate = {};
    for (let m = 1; m <= 12; m++) {
      const sf = zip.file('xl/worksheets/sheet' + m + '.xml');
      if (!sf) continue;
      const sDoc = parser.parseFromString(await sf.async('string'), 'application/xml');
      const rowMap = buildSheetRowMap(sDoc);
      if (!anno) {
        const r3 = rowMap.get(3);
        const y = r3 ? readXmlCellNumeric(getOrCreateCellInRow(sDoc, r3, 'AI', 3)) : 0;
        anno = (y >= 2020 && y <= 2100) ? y : rie.y;
      }
      for (let day = 1; day <= ultimoMese(anno, m); day++) {
        const colL = colIdxToLetter(3 + day);
        const iso = anno + '-' + String(m).padStart(2, '0') + '-' + String(day).padStart(2, '0');
        cats.forEach(cat => {
          const rn = cat.excelRow;
          const rEl = rn ? rowMap.get(rn) : null;
          if (!rEl) return;
          const v = readXmlCellNumeric(getOrCreateCellInRow(sDoc, rEl, colL, rn));
          if (v > 0) {
            let note = '';
            if (cat.isAltro) {
              note = readXmlCellText(getOrCreateCellInRow(sDoc, rEl, 'C', rn), ssState).replace(/^ALTRO\s*\(?SPECIFICARE\)?\s*:?\s*/i, '').trim();
            }
            (trovate[iso] = trovate[iso] || []).push({ cat: getCatKey(cat), ore: Math.round(v * 100) / 100, note });
          }
        });
      }
    }
    const giorni = Object.keys(trovate).sort();
    event.target.value = '';
    if (!giorni.length) return alert('Nessuna attività svolta trovata nel file.');
    const totOre = giorni.reduce((a, d) => a + trovate[d].reduce((x, y) => x + y.ore, 0), 0);
    if (!confirm('Trovate attività in ' + giorni.length + ' giornate (' + giorni[0] + ' → ' + giorni[giorni.length - 1] + ', ' + totOre.toFixed(2) + ' ore).\nLe giornate che hanno già attività in app o appartengono a mesi verificati NON verranno toccate. Importare?')) return;
    let nGg = 0, nVoci = 0, skipEs = 0, skipVer = 0;
    mut(() => {
      S.att = S.att || {};
      S.exportedAttDays = S.exportedAttDays || {};
      giorni.forEach(iso => {
        if (S.ver[iso.slice(0, 7)]) { skipVer++; return; }
        if ((S.att[iso] || []).length) { skipEs++; return; }
        S.att[iso] = trovate[iso];
        S.exportedAttDays[iso] = true;
        nGg++;
        nVoci += trovate[iso].length;
      });
    });
    toast('Importate ' + nVoci + ' attività in ' + nGg + ' giornate' + (skipEs ? ' (' + skipEs + ' già presenti)' : '') + (skipVer ? ' (' + skipVer + ' in mesi verificati)' : '') + ' ✓');
  } catch (err) {
    alert('Errore durante l\'importazione dal file Excel: ' + err.message);
  }
}
