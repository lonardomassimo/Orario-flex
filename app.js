/** Agesp Flex — logica applicativa e storage locale */
const K_T = 'orario_flex_timbrature', K_G = 'orario_flex_giustificativi', K_D = 'orario_flex_destinazioni';
let timbrature = [], giustificativi = [], destinazioni = {};
let currentDate = new Date();
const $ = id => document.getElementById(id);
const TIPI_DURATA = ['FERIE', 'EX-FESTIVITÀ', 'ORE RECUPERO'];
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

  const d = getDest(iso);
  document.querySelectorAll('#segDest button').forEach(b => b.classList.toggle('on', b.dataset.v === d));
  const tot = totaleBanca(iso);
  $('destNote').textContent = d === 'BANCA'
    ? `Monte ore accantonato: ${formatMinutesToHoursMins(tot)} su 40h`
    : 'Lo straordinario sarà pagato a fine mese (+30%)';

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
  const t = $('selTipoGiust').value;
  $('swFields').style.display = t === 'SMART WORKING' ? 'block' : 'none';
  $('visitaFields').style.display = t === 'VISITA MEDICA' ? 'block' : 'none';
  $('durataFields').style.display = (TIPI_DURATA.includes(t) || (t === 'SMART WORKING' && $('swMode').value === 'O')) ? 'block' : 'none';
}

function salvaGiustificativo() {
  const tipo = $('selTipoGiust').value, n = { data: formatDateISO(currentDate), tipo };
  if (tipo === 'VISITA MEDICA') {
    n.oraInizio = $('visitaInizio').value; n.oraFine = $('visitaFine').value;
    n.tragittoPrima = $('chkTragittoPrima').checked ? '0:30' : '0:00';
    n.tragittoDopo = $('chkTragittoDopo').checked ? '0:30' : '0:00';
  } else if (tipo === 'SMART WORKING') {
    // Smart working = ore lavorate da remoto: contano come ore svolte, senza straordinario
    n.durata = $('swMode').value === 'G' ? (currentDate.getDay() === 5 ? '6:00' : '8:00') : ($('durataManuale').value || '1:00');
    n.modalita = $('swMode').value === 'G' ? 'giornata' : 'ore';
  } else if (TIPI_DURATA.includes(tipo)) n.durata = $('durataManuale').value || '1:00';
  else n.durata = '0:30';
  giustificativi.push(n); salvaDati(); chiudiModal('modalGiust'); aggiornaSchermataOggi();
}

function giorniConDati() {
  return [...new Set([...timbrature.map(t => t.data), ...giustificativi.map(g => g.data)])].filter(Boolean).sort();
}
function calcDay(iso) {
  return calcolaGiornata(iso, timbrature.filter(t => t.data === iso), giustificativi.filter(g => g.data === iso), null);
}
// Minuti accantonati in monte ore nell'anno, fino alla data indicata inclusa (tetto 40h)
function totaleBanca(isoFino) {
  const y = isoFino.slice(0, 4);
  const s = giorniConDati().filter(d => d.startsWith(y) && d <= isoFino && getDest(d) === 'BANCA')
    .reduce((a, d) => a + calcDay(d).straordinarioNettoMin, 0);
  return Math.min(s, PARAMETRI.tettoBancaOre);
}
const durMin = g => g.durata ? (parseTimeToMinutes(g.durata) || 0) : Math.max(0, (parseTimeToMinutes(g.oraFine) || 0) - (parseTimeToMinutes(g.oraInizio) || 0));

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
  const y = String(currentDate.getFullYear()), ym = formatDateISO(currentDate).slice(0, 7);
  const nomeMese = currentDate.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  $('rieMeseTit').textContent = nomeMese.charAt(0).toUpperCase() + nomeMese.slice(1);
  $('rieAnnoTit').textContent = `Saldi ${y}`;
  const m = { lav: 0, giu: 0, ban: 0, pag: 0, sw: 0, tk: 0 };
  giorniConDati().filter(d => d.startsWith(ym)).forEach(d => {
    const r = calcDay(d); m.lav += r.oreLavorateMin; m.giu += r.oreGiustificateMin;
    getDest(d) === 'BANCA' ? m.ban += r.straordinarioNettoMin : m.pag += r.straordinarioNettoMin;
    if (r.ticket) m.tk++;
  });
  giustificativi.filter(g => g.data.startsWith(ym) && g.tipo === 'SMART WORKING').forEach(g => m.sw += durMin(g));
  const F = formatMinutesToHoursMins, row = (a, b) => `<div class="row"><span>${a}</span><b>${b}</b></div>`;
  $('rieMese').innerHTML = row('Ore lavorate in sede', F(m.lav)) + row('di cui smart working', F(m.sw)) + row('Ore giustificate', F(m.giu))
    + row('Straordinario in monte ore', F(m.ban)) + row('Straordinario in pagamento', F(m.pag)) + row('Ticket maturati', m.tk);

  const banca = totaleBanca(`${y}-12-31`);
  const usate = giustificativi.filter(g => g.data.startsWith(y) && isRecupero(g.tipo)).reduce((a, g) => a + durMin(g), 0);
  const sum = tipo => giustificativi.filter(g => g.data.startsWith(y) && g.tipo === tipo).reduce((a, g) => a + durMin(g), 0);
  const bar = (lbl, usedMin, maxH, note) => `<div class="f"><div class="row" style="border:0;padding:0"><span>${lbl}</span><b>${F(usedMin)} / ${maxH}h</b></div>
    <div class="bar"><i style="width:${Math.min(100, usedMin / (maxH * 60) * 100)}%"></i></div>${note ? `<small style="color:var(--danger)">${note}</small>` : ''}</div>`;
  $('rieAnno').innerHTML = bar('Monte ore accantonato', banca, 40, banca >= 2400 ? 'Tetto annuo raggiunto' : '')
    + bar('Ore recupero usate', usate, 40, usate > banca ? 'Ore recupero superiori al monte ore disponibile' : '')
    + bar('Ferie usate', sum('FERIE'), 168) + bar('Ex-festività usate', sum('EX-FESTIVITÀ'), 30) + bar('Visite mediche', sum('VISITA MEDICA'), 30)
    + row('Smart working annuo', F(sum('SMART WORKING')));
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

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
window.onload = () => {
  initStorage(); aggiornaSchermataOggi();
  setInterval(() => { if ($('tab-oggi').style.display !== 'none') aggiornaSchermataOggi(); }, 30000);
};
