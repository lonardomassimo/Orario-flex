/** Agesp Flex — logica applicativa e storage locale */
const K_T = 'orario_flex_timbrature', K_G = 'orario_flex_giustificativi', K_D = 'orario_flex_destinazioni';
let timbrature = [], giustificativi = [], destinazioni = {};
let currentDate = new Date();
const APP_VERSION = '2.2';
const $ = id => document.getElementById(id);
const TIPI_DURATA = ['FERIE', 'EX-FESTIVITÀ', 'ORE RECUPERO', 'SMART WORKING'];
// Soglie annuali (minuti). ORE RECUPERO non ha soglia fissa: dipende dal monte ore accantonato.
const LIMITI = { 'FERIE': 168 * 60, 'EX-FESTIVITÀ': 30 * 60, 'VISITA MEDICA': 30 * 60 };
const isRecupero = t => t === 'ORE RECUPERO' || t === 'ORE RECUPERO STRAORDINARI';

function initStorage() {
  const lt = localStorage.getItem(K_T), lg = localStorage.getItem(K_G), ld = localStorage.getItem(K_D);
  if (lt) timbrature = JSON.parse(lt);
  else if (window.SEED_TIMBRATURE) timbrature = SEED_TIMBRATURE.map(t => ({ ...t, data: formatExcelDate(t.data) }));
  if (lg) giustificativi = JSON.parse(lg);
  else if (window.SEED_GIUSTIFICATIVI) giustificativi = SEED_GIUSTIFICATIVI.map(g => ({ ...g, data: formatExcelDate(g.data) }));
  if (ld) destinazioni = JSON.parse(ld);
  salvaDati();
}

function formatExcelDate(str) {
  if (!str || str.includes('-')) return str || '';
  const mesi = { gennaio: '01', febbraio: '02', marzo: '03', aprile: '04', maggio: '05', giugno: '06', luglio: '07', agosto: '08', settembre: '09', ottobre: '10', novembre: '11', dicembre: '12' };
  const p = str.toLowerCase().split(' ');
  return p.length >= 4 ? `${p[3]}-${mesi[p[2]] || '01'}-${p[1].padStart(2, '0')}` : str;
}
const formatDateISO = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function formatDateHuman(d) {
  const s = d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function salvaDati() {
  localStorage.setItem(K_T, JSON.stringify(timbrature));
  localStorage.setItem(K_G, JSON.stringify(giustificativi));
  localStorage.setItem(K_D, JSON.stringify(destinazioni));
}

// Destinazione straordinario (monte ore / pagamento), per giornata
const getDest = iso => destinazioni[iso] || 'PAGAMENTO';
function setDest(v) { destinazioni[formatDateISO(currentDate)] = v; salvaDati(); aggiornaSchermataOggi(); }

// Selettore monte ore / pagamento: "Monte ore" si disattiva a limite annuo raggiunto
function aggiornaDest(iso, strao) {
  const resto = PARAMETRI.tettoBancaOre - accantonatoPrima(iso), pieno = resto <= 0;
  const d = pieno ? 'PAGAMENTO' : getDest(iso), F = formatMinutesToHoursMins;
  document.querySelectorAll('#segDest button').forEach(b => {
    b.classList.toggle('on', b.dataset.v === d);
    if (b.dataset.v === 'BANCA') b.disabled = pieno;
  });
  $('destNote').textContent = pieno ? 'Limite annuo di 40h raggiunto: lo straordinario va in pagamento'
    : d === 'BANCA' ? (strao > resto ? `Ancora accantonabili ${F(resto)}: l'eccedenza va in pagamento` : `Monte ore accantonato ${F(accantonatoAnno(iso.slice(0, 4)))} su 40h`)
    : 'Lo straordinario sarà pagato a fine mese (+30%)';
}

function aggiornaSchermataOggi() {
  const iso = formatDateISO(currentDate);
  $('currentDateLabel').textContent = formatDateHuman(currentDate);
  const tG = timbrature.filter(t => t.data === iso), gG = giustificativi.filter(g => g.data === iso);
  const now = new Date();
  const nowMin = iso === formatDateISO(now) ? now.getHours() * 60 + now.getMinutes() : null;
  const c = calcolaGiornata(iso, tG, gG, nowMin);

  $('heroUscita').textContent = c.uscitaTeorica;
  $('heroSub').textContent = c.entrataNorm !== '--:--' ? `Entrata normalizzata ${c.entrataNorm}` : "In attesa dell'entrata";

  const mat = c.entrataNorm !== '--:--';
  $('cardMattina').style.display = mat ? 'block' : 'none';
  if (mat) {
    $('valPausaMassima').textContent = c.pausaMassimaPerUscitaMinima;
    $('rowAnticipoPaletto').style.display = c.anticipoRispettoPalettoMin > 0 ? 'flex' : 'none';
    $('valAnticipoPaletto').textContent = `${c.anticipoRispettoPalettoMin} min maturano alle 17:15`;
    $('pillScatto30').textContent = c.oraScatto30m; $('pillScatto45').textContent = c.oraScatto45m; $('pillScatto60').textContent = c.oraScatto60m;
  }

  $('cardPomeriggioLive').style.display = c.isLive && mat ? 'block' : 'none';
  if (c.isLive && mat) {
    $('valOltreOrario').textContent = `${c.minutiOltreOrario} min`;
    $('valNomeProssimoScatto').textContent = c.valoreProssimoScatto > 0 ? `+${c.valoreProssimoScatto} min di straordinario` : "l'orario minimo";
    $('valMinutiProssimoScatto').textContent = `${c.minutiAlProssimoScatto} min`;
    $('valOraProssimoScatto').textContent = c.orarioProssimoScatto;
  }

  $('statOreSvolte').textContent = formatMinutesToHoursMins(c.oreTotaliSvolteMin);
  $('statPausa').textContent = `${c.pausaEffettivaMin} min`;
  $('statStraord').textContent = `${c.straordinarioNettoMin} min`;
  $('pulseOre').style.display = $('pulseStraord').style.display = c.isLive ? 'inline-block' : 'none';

  aggiornaDest(iso, c.straordinarioNettoMin);

  $('alertContainer').innerHTML = c.attenzioni.length
    ? `<div class="alert"><b>Da controllare</b>${c.attenzioni.map(a => `<div>• ${a}</div>`).join('')}</div>` : '';
  renderTimeline(tG, gG);
}

function renderTimeline(tG, gG) {
  const tl = $('timelineList');
  if (!tG.length && !gG.length) { tl.innerHTML = '<div class="empty">Nessuna registrazione</div>'; return; }
  tl.innerHTML = '';
  const add = (lbl, val, fn) => {
    const r = document.createElement('div'); r.className = 'tl';
    r.innerHTML = `<span><button class="x" aria-label="Elimina">Elimina</button>${lbl}</span><b>${val}</b>`;
    r.querySelector('.x').onclick = fn; tl.appendChild(r);
  };
  tG.forEach(t => add(t.tipo, t.ora, () => elimina(timbrature, t, `la timbratura ${t.tipo} delle ${t.ora}`)));
  gG.forEach(g => add(g.tipo, g.durata || `${g.oraInizio}-${g.oraFine}`, () => elimina(giustificativi, g, `il giustificativo ${g.tipo}`)));
}
function elimina(arr, el, desc) {
  if (!confirm(`Eliminare ${desc}?`)) return;
  arr.splice(arr.indexOf(el), 1); salvaDati(); aggiornaSchermataOggi();
}

const cambiaGiorno = n => { currentDate.setDate(currentDate.getDate() + n); aggiornaSchermataOggi(); };
const vaiAOggi = () => { currentDate = new Date(); aggiornaSchermataOggi(); };

function switchTab(id, btn) {
  ['tab-oggi', 'tab-storico', 'tab-riepilogo'].forEach(t => $(t).style.display = t === id ? 'block' : 'none');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  (btn || document.querySelector(`.nav-btn[onclick*="${id}"]`)).classList.add('active');
  if (id === 'tab-storico') caricaStorico();
  if (id === 'tab-riepilogo') caricaRiepilogo();
}

function quickTimbra(tipo) {
  const n = new Date();
  timbrature.push({ data: formatDateISO(currentDate), ora: `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`, tipo, fittizia: false, autorizzata: false });
  salvaDati(); aggiornaSchermataOggi();
}
function apriDialogTimbraturaManuale() {
  const n = new Date();
  $('oraTimbManuale').value = `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
  $('modalTimb').classList.add('active');
}
function salvaTimbraturaManuale() {
  const ora = $('oraTimbManuale').value; if (!ora) return;
  timbrature.push({ data: formatDateISO(currentDate), ora, tipo: $('selTipoTimb').value, fittizia: false, autorizzata: false });
  salvaDati(); chiudiModal('modalTimb'); aggiornaSchermataOggi();
}
const apriDialogGiustificativo = () => { aggiornaFormGiust(); $('modalGiust').classList.add('active'); };
const chiudiModal = id => $(id).classList.remove('active');

function aggiornaFormGiust() {
  const t = $('selTipoGiust').value, iso = formatDateISO(currentDate), r = residuo(t, iso);
  $('visitaFields').style.display = t === 'VISITA MEDICA' ? 'block' : 'none';
  $('durataFields').style.display = TIPI_DURATA.includes(t) ? 'block' : 'none';
  $('limiteInfo').textContent = t === 'SCIOPERO' ? `Intera giornata: ${oreGiornata().slice(0, -3)} ore non retribuite`
    : r === null ? '' : r <= 0 ? 'Soglia raggiunta: inserimento bloccato' : `Residuo disponibile${t === 'SMART WORKING' ? ' questa settimana' : ''}: ${formatMinutesToHoursMins(r)}`;
}
const oreGiornata = () => currentDate.getDay() === 5 ? '6:00' : '8:00';

function salvaGiustificativo() {
  const tipo = $('selTipoGiust').value, iso = formatDateISO(currentDate), n = { data: iso, tipo };
  if (tipo === 'VISITA MEDICA') {
    n.oraInizio = $('visitaInizio').value; n.oraFine = $('visitaFine').value;
    if (!n.oraInizio || !n.oraFine || n.oraFine <= n.oraInizio) return alert('Orario non valido: la fine deve essere dopo l\'inizio.');
    n.tragittoPrima = $('chkTragittoPrima').checked ? '0:30' : '0:00';
    n.tragittoDopo = $('chkTragittoDopo').checked ? '0:30' : '0:00';
  } else if (tipo === 'SCIOPERO') {
    if (giustificativi.some(g => g.data === iso && g.tipo === 'SCIOPERO')) return alert('Sciopero già registrato per questo giorno.');
    n.durata = oreGiornata();
  } else if (TIPI_DURATA.includes(tipo)) {
    const d = $('durataManuale').value.trim() || '1:00', m = /^\d{1,2}:[0-5]\d$/.test(d) ? parseTimeToMinutes(d) : 0;
    if (!m) return alert('Durata non valida: usa il formato ore:minuti, es. 1:30');
    if (tipo !== 'SMART WORKING' && m % 15) return alert('Questo giustificativo si prende a quarti d\'ora.');
    if (tipo === 'FERIE' && m < 30) return alert('Il primo scatto delle ferie è di almeno mezz\'ora.');
    n.durata = d;
  } else n.durata = '0:30';
  const req = uso(n), r = residuo(tipo, iso), F = formatMinutesToHoursMins;
  if (r !== null && req > r) {
    return alert(tipo === 'ORE RECUPERO'
      ? `Ore recupero insufficienti: disponibili ${F(Math.max(0, r))}, richieste ${F(req)}.\nSi sblocca accantonando altro straordinario nel monte ore.`
      : tipo === 'SMART WORKING'
      ? `Smart working massimo 8h a settimana (un giorno o due mezze giornate): residuo ${F(Math.max(0, r))}, richieste ${F(req)}.\nInserimento bloccato fino alla prossima settimana.`
      : `Soglia annuale superata per ${tipo}: residuo ${F(Math.max(0, r))}, richieste ${F(req)}.\nInserimento bloccato fino al nuovo caricamento annuale.`);
  }
  giustificativi.push(n); salvaDati(); chiudiModal('modalGiust'); aggiornaSchermataOggi();
}

function giorniConDati() {
  return [...new Set([...timbrature.map(t => t.data), ...giustificativi.map(g => g.data)])].filter(Boolean).sort();
}
function calcDay(iso) {
  return calcolaGiornata(iso, timbrature.filter(t => t.data === iso), giustificativi.filter(g => g.data === iso), null);
}
// Ripartizione cronologica dello straordinario: monte ore (tetto 40h/anno) e pagamento
function ripartoAnno(y) {
  let resto = PARAMETRI.tettoBancaOre; const out = {};
  giorniConDati().filter(d => d.startsWith(y)).forEach(d => {
    const s = calcDay(d).straordinarioNettoMin, ban = getDest(d) === 'BANCA' ? Math.min(s, Math.max(0, resto)) : 0;
    resto -= ban; out[d] = { ban, pag: s - ban };
  });
  return out;
}
const sommaBan = (y, ok) => { const o = ripartoAnno(y); return Object.keys(o).filter(ok).reduce((a, d) => a + o[d].ban, 0); };
const accantonatoAnno = y => sommaBan(y, () => true);
const accantonatoPrima = iso => sommaBan(iso.slice(0, 4), d => d < iso);
const durMin = g => g.durata ? (parseTimeToMinutes(g.durata) || 0) : Math.max(0, (parseTimeToMinutes(g.oraFine) || 0) - (parseTimeToMinutes(g.oraInizio) || 0));
// Minuti scalati dal monte ore del giustificativo (visita medica: include i tragitti)
const uso = g => durMin(g) + (parseTimeToMinutes(g.tragittoPrima) || 0) + (parseTimeToMinutes(g.tragittoDopo) || 0);
const usatoAnno = (tipo, y) => giustificativi.filter(g => g.data.startsWith(y) && (tipo === 'ORE RECUPERO' ? isRecupero(g.tipo) : g.tipo === tipo)).reduce((a, g) => a + uso(g), 0);
// Minuti ancora disponibili per il giustificativo (null = nessuna soglia)
function residuo(tipo, iso) {
  const y = iso.slice(0, 4);
  if (tipo === 'ORE RECUPERO') return sommaBan(y, d => d <= iso) - usatoAnno(tipo, y);
  if (tipo === 'SMART WORKING') return SW_SETTIMANA - usoSettimana(iso);
  const l = limite(tipo, y);
  return l === null ? null : l - usatoAnno(tipo, y);
}
const SW_SETTIMANA = 8 * 60; // un giorno a settimana o due mezze giornate
const lunediDi = iso => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return formatDateISO(d); };
const usoSettimana = iso => giustificativi.filter(g => g.tipo === 'SMART WORKING' && lunediDi(g.data) === lunediDi(iso)).reduce((a, g) => a + uso(g), 0);
// Lavorando il 4 novembre (timbrature o smart working) maturano altre 8h di ex-festività
const lavoratoIl4Nov = y => timbrature.some(t => t.data === `${y}-11-04`) || giustificativi.some(g => g.data === `${y}-11-04` && g.tipo === 'SMART WORKING');
const extra4Nov = y => lavoratoIl4Nov(y) ? 8 * 60 : 0;
const limite = (tipo, y) => LIMITI[tipo] === undefined ? null : LIMITI[tipo] + (tipo === 'EX-FESTIVITÀ' ? extra4Nov(y) : 0);
// Ticket: ore in sede + ore di smart working >= 4h
const ticketGiorno = d => calcDay(d).oreLavorateMin + giustificativi.filter(g => g.data === d && g.tipo === 'SMART WORKING').reduce((a, g) => a + uso(g), 0) >= 240;

function caricaStorico() {
  const box = $('storicoList'); box.innerHTML = '';
  giorniConDati().reverse().slice(0, 30).forEach(d => {
    const r = calcDay(d), row = document.createElement('div');
    row.className = 'tl'; row.style.cursor = 'pointer';
    const sw = giustificativi.some(g => g.data === d && g.tipo === 'SMART WORKING') ? ' · SW' : '';
    row.innerHTML = `<span><b>${d.split('-').reverse().join('/')}</b><br><small style="color:var(--muted)">E ${r.entrataNorm} · U ${r.ultimaUscita} · ${formatMinutesToHoursMins(r.oreTotaliSvolteMin)}${sw}</small></span>
      <b style="color:${r.straordinarioNettoMin ? 'var(--amber)' : 'var(--muted)'}">${r.straordinarioNettoMin ? '+' + r.straordinarioNettoMin + 'm' : 'OK'}</b>`;
    row.onclick = () => { currentDate = new Date(d + 'T12:00:00'); switchTab('tab-oggi'); aggiornaSchermataOggi(); };
    box.appendChild(row);
  });
}

function caricaRiepilogo() {
  const y = String(currentDate.getFullYear()), ym = formatDateISO(currentDate).slice(0, 7), F = formatMinutesToHoursMins;
  const nomeMese = currentDate.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  $('rieMeseTit').textContent = nomeMese.charAt(0).toUpperCase() + nomeMese.slice(1);
  $('rieAnnoTit').textContent = `Saldi ${y}`;
  const rp = ripartoAnno(y), m = { lav: 0, giu: 0, ban: 0, pag: 0, tk: 0 };
  giorniConDati().filter(d => d.startsWith(ym)).forEach(d => {
    const r = calcDay(d); m.lav += r.oreLavorateMin; m.giu += r.oreGiustificateMin; m.ban += rp[d].ban; m.pag += rp[d].pag;
    if (ticketGiorno(d)) m.tk++;
  });
  const mese = t => giustificativi.filter(g => g.data.startsWith(ym) && g.tipo === t).reduce((a, g) => a + uso(g), 0);
  const sw = mese('SMART WORKING'), sc = mese('SCIOPERO'), row = (a, b) => `<div class="row"><span>${a}</span><b>${b}</b></div>`;
  $('rieMese').innerHTML = row('Ore lavorate in sede', F(m.lav)) + row('Smart working', F(sw)) + row('Ore giustificate', F(m.giu - sw - sc))
    + row('Sciopero (non retribuito)', F(sc)) + row('Straordinario in monte ore', F(m.ban)) + row('Straordinario in pagamento', F(m.pag)) + row('Ticket maturati', m.tk);

  const acc = accantonatoAnno(y), usate = usatoAnno('ORE RECUPERO', y);
  const bar = (lbl, usedMin, maxH, note) => `<div class="f"><div class="row" style="border:0;padding:0"><span>${lbl}</span><b>${F(usedMin)} / ${maxH}h</b></div>
    <div class="bar"><i style="width:${Math.min(100, usedMin / (maxH * 60) * 100)}%"></i></div>${note ? `<small style="color:var(--danger)">${note}</small>` : ''}</div>`;
  $('rieAnno').innerHTML = bar('Monte ore accantonato', acc, 40, acc >= PARAMETRI.tettoBancaOre ? 'Tetto annuo raggiunto' : '')
    + bar('Ore recupero usate', usate, 40, usate > acc ? 'Superiori al monte ore accantonato' : '')
    + bar('Ferie usate', usatoAnno('FERIE', y), 168) + bar(extra4Nov(y) ? 'Ex-festività usate (incl. +8h del 4 novembre)' : 'Ex-festività usate', usatoAnno('EX-FESTIVITÀ', y), limite('EX-FESTIVITÀ', y) / 60) + bar('Visite mediche', usatoAnno('VISITA MEDICA', y), 30)
    + row('Smart working annuo', F(usatoAnno('SMART WORKING', y))) + row('Sciopero annuo', F(usatoAnno('SCIOPERO', y)));
}

$('btnSync').onclick = () => $('modalSync').classList.add('active');
function esportaDati() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ versione: 2, timbrature, giustificativi, destinazioni }, null, 2)], { type: 'application/json' }));
  a.download = `backup_agesp_flex_${formatDateISO(new Date())}.json`; a.click();
}
function importaDati() {
  const f = $('fileImport').files[0]; if (!f) return alert('Seleziona un file di backup.');
  const rd = new FileReader();
  rd.onload = e => {
    try {
      const d = JSON.parse(e.target.result);
      if (!d.timbrature || !d.giustificativi) return alert('File di backup non valido.');
      timbrature = d.timbrature; giustificativi = d.giustificativi; destinazioni = d.destinazioni || {};
      salvaDati(); chiudiModal('modalSync'); aggiornaSchermataOggi();
    } catch (err) { alert('Errore nella lettura del file: ' + err.message); }
  };
  rd.readAsText(f);
}

// Pulisce service worker e cache dell'app (i dati salvati restano intatti) e ricarica
async function forzaAggiornamento() {
  try {
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    for (const k of await caches.keys()) await caches.delete(k);
  } catch (e) {}
  location.replace('index.html?v=' + Date.now());
}
if ('serviceWorker' in navigator) {
  const aveva = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (aveva && !window._ric) { window._ric = 1; location.reload(); } });
}
window.onload = () => {
  initStorage(); aggiornaSchermataOggi();
  const hv = document.documentElement.dataset.ver, ok = hv === APP_VERSION;
  $('ver').textContent = ok ? `Agesp Flex · versione ${APP_VERSION}` : `File non allineati (pagina ${hv}, logica ${APP_VERSION}): apri Backup e usa "Forza aggiornamento"`;
  $('ver').style.color = ok ? 'var(--muted)' : 'var(--danger)';
  setInterval(() => { if ($('tab-oggi').style.display !== 'none') aggiornaSchermataOggi(); }, 30000);
};
