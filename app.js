/** Agesp Flex — by arch. Lonardo Massimo */
const APP_VERSION = '3.0';
const K_T = 'orario_flex_timbrature', K_G = 'orario_flex_giustificativi', K_D = 'orario_flex_destinazioni', K_P = 'orario_flex_puntozero';
let timbrature = [], giustificativi = [], destinazioni = {}, pz = null, currentDate = new Date(), editIdx = null;
const $ = id => document.getElementById(id), F = formatMinutesToHoursMins, T = formatMinutesToTime, P = parseTimeToMinutes;
const TIPI_DURATA = ['FERIE', 'EX-FESTIVITÀ', 'ORE RECUPERO', 'SMART WORKING', 'ORE 4 NOVEMBRE'];
const LIMITI = { 'FERIE': 168 * 60, 'EX-FESTIVITÀ': 30 * 60, 'VISITA MEDICA': 30 * 60 };
const PZ_KEY = { 'FERIE': 'ferie', 'EX-FESTIVITÀ': 'ex', 'VISITA MEDICA': 'visite', 'ORE 4 NOVEMBRE': 'nov4', 'ORE RECUPERO': 'rec' };
const SW_SETTIMANA = 8 * 60;
const isRecupero = t => t === 'ORE RECUPERO' || t === 'ORE RECUPERO STRAORDINARI';
const svg = p => `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const IC = { pen: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>'), bin: svg('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>') };

// ---------- Dati ----------
function initStorage() {
  const g = k => localStorage.getItem(k);
  timbrature = g(K_T) ? JSON.parse(g(K_T)) : (window.SEED_TIMBRATURE || []).map(t => ({ ...t, data: formatExcelDate(t.data) }));
  giustificativi = g(K_G) ? JSON.parse(g(K_G)) : (window.SEED_GIUSTIFICATIVI || []).map(x => ({ ...x, data: formatExcelDate(x.data) }));
  destinazioni = g(K_D) ? JSON.parse(g(K_D)) : {};
  pz = g(K_P) ? JSON.parse(g(K_P)) : null;
  salvaDati();
}
function formatExcelDate(s) {
  if (!s || s.includes('-')) return s || '';
  const m = { gennaio: '01', febbraio: '02', marzo: '03', aprile: '04', maggio: '05', giugno: '06', luglio: '07', agosto: '08', settembre: '09', ottobre: '10', novembre: '11', dicembre: '12' }, p = s.toLowerCase().split(' ');
  return p.length >= 4 ? `${p[3]}-${m[p[2]] || '01'}-${p[1].padStart(2, '0')}` : s;
}
const iso0 = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayISO = () => iso0(new Date());
const isVen = iso => new Date(iso + 'T12:00:00').getDay() === 5;
function salvaDati() {
  localStorage.setItem(K_T, JSON.stringify(timbrature)); localStorage.setItem(K_G, JSON.stringify(giustificativi));
  localStorage.setItem(K_D, JSON.stringify(destinazioni)); localStorage.setItem(K_P, JSON.stringify(pz));
}
function refresh() {
  aggiornaSchermataOggi();
  if ($('tab-storico').style.display !== 'none') caricaStorico();
  if ($('tab-riepilogo').style.display !== 'none') caricaRiepilogo();
}
const giorniConDati = () => [...new Set([...timbrature.map(t => t.data), ...giustificativi.map(g => g.data)])].filter(Boolean).sort();
const calcDay = iso => calcolaGiornata(iso, timbrature.filter(t => t.data === iso), giustificativi.filter(g => g.data === iso), null);

// ---------- Contatori, soglie, punto zero ----------
const pzAttivo = y => pz && pz.data && pz.data.slice(0, 4) === y ? pz : null;
const getDest = iso => destinazioni[iso] || null;
function setDest(v, iso) { destinazioni[iso || iso0(currentDate)] = v; salvaDati(); refresh(); }
function ripartoAnno(y) {
  const p = pzAttivo(y); let resto = PARAMETRI.tettoBancaOre - (p ? p.banca || 0 : 0); const out = {};
  giorniConDati().filter(d => d.startsWith(y) && (!p || d > p.data)).forEach(d => {
    const s = calcDay(d).straordinarioNettoMin, g = getDest(d) || (resto <= 0 ? 'PAGAMENTO' : null);
    const ban = g === 'BANCA' ? Math.min(s, Math.max(0, resto)) : 0; resto -= ban;
    out[d] = { ban, pag: g === 'PAGAMENTO' ? s : g === 'BANCA' ? s - ban : 0, nd: g ? 0 : s };
  });
  return out;
}
const sommaBan = (y, ok) => { const o = ripartoAnno(y), p = pzAttivo(y); return (p ? p.banca || 0 : 0) + Object.keys(o).filter(ok).reduce((a, d) => a + o[d].ban, 0); };
const accantonatoAnno = y => sommaBan(y, () => true);
const accantonatoPrima = iso => sommaBan(iso.slice(0, 4), d => d < iso);
const durMin = g => g.durata ? (P(g.durata) || 0) : Math.max(0, (P(g.oraFine) || 0) - (P(g.oraInizio) || 0));
const uso = g => durMin(g) + (P(g.tragittoPrima) || 0) + (P(g.tragittoDopo) || 0);
function usatoAnno(tipo, y) {
  const p = pzAttivo(y);
  return giustificativi.filter(g => g.data.startsWith(y) && (!p || g.data > p.data) && (tipo === 'ORE RECUPERO' ? isRecupero(g.tipo) : g.tipo === tipo))
    .reduce((a, g) => a + uso(g), 0) + (p ? p[PZ_KEY[tipo]] || 0 : 0);
}
const lunediDi = iso => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return iso0(d); };
const usoSettimana = iso => giustificativi.filter(g => g.tipo === 'SMART WORKING' && lunediDi(g.data) === lunediDi(iso)).reduce((a, g) => a + uso(g), 0);
const lavoratoIl4Nov = y => timbrature.some(t => t.data === `${y}-11-04`) || giustificativi.some(g => g.data === `${y}-11-04` && g.tipo === 'SMART WORKING') || !!(pzAttivo(y) && pz.lavNov4);
const extra4Nov = y => lavoratoIl4Nov(y) ? 8 * 60 : 0;
function residuo(tipo, iso) {
  const y = iso.slice(0, 4);
  if (tipo === 'SMART WORKING') return SW_SETTIMANA - usoSettimana(iso);
  if (tipo === 'ORE 4 NOVEMBRE') return extra4Nov(y) - usatoAnno(tipo, y);
  if (tipo === 'ORE RECUPERO') return sommaBan(y, d => d <= iso) - usatoAnno(tipo, y);
  return LIMITI[tipo] === undefined ? null : LIMITI[tipo] - usatoAnno(tipo, y);
}
const ticketGiorno = d => calcDay(d).oreLavorateMin + giustificativi.filter(g => g.data === d && g.tipo === 'SMART WORKING').reduce((a, g) => a + uso(g), 0) >= 240;
const pausaRaw = tG => { const u = tG.find(t => t.tipo === 'U PAUSA'), e = tG.find(t => t.tipo === 'E PAUSA'); return u && e ? Math.max(0, P(e.ora) - P(u.ora)) : null; };
function mancanti(iso, tG) {
  const has = t => tG.some(x => x.tipo === t), m = [], ven = isVen(iso);
  if (has('U') && !has('E')) m.push('E');
  if (has('E') && !has('U') && iso < todayISO()) m.push('U');
  if (!ven) { if (has('U PAUSA') && !has('E PAUSA')) m.push('E PAUSA'); if (has('E PAUSA') && !has('U PAUSA')) m.push('U PAUSA'); }
  return m;
}

// ---------- Schermata Oggi ----------
const big = (l, v, s) => `<div class="big"><small>${l}</small><b>${v}</b>${s ? `<em>${s}</em>` : ''}</div>`;
const pills = c => `<div class="lbl">Se fai straordinario esci alle</div><div class="pills"><div><small>+30 min</small><b>${c.oraScatto30m}</b></div><div><small>+45 min</small><b>${c.oraScatto45m}</b></div><div><small>+60 min</small><b>${c.oraScatto60m}</b></div></div>`;
function fase(tG, ven) {
  const has = t => tG.some(x => x.tipo === t);
  if (!has('E')) return 'prima'; if (has('U')) return 'fine';
  if (ven || has('E PAUSA')) return 'pom'; return has('U PAUSA') ? 'pausa' : 'mat';
}
function aggiornaSchermataOggi() {
  const iso = iso0(currentDate), now = new Date(), isOggi = iso === todayISO();
  const tG = timbrature.filter(t => t.data === iso), gG = giustificativi.filter(g => g.data === iso);
  const c = calcolaGiornata(iso, tG, gG, isOggi ? now.getHours() * 60 + now.getMinutes() : null), f = fase(tG, isVen(iso));
  const s = currentDate.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  $('currentDateLabel').textContent = s.charAt(0).toUpperCase() + s.slice(1);
  let h = '';
  if (f === 'prima') h = '<div class="hl">In attesa della timbratura di entrata</div>';
  else if (f === 'mat') h = `<div class="tag">Mattina · entrata ${c.entrataNorm}</div><div class="grid2">${big('Pausa massima', F(P(c.pausaMassimaPerUscitaMinima)), 'per uscire alle 17:15')}${big('Uscita minima', c.uscitaTeorica, 'con pausa di 30 min')}</div>${pills(c)}${c.anticipoRispettoPalettoMin > 0 ? `<div class="sub">Con la pausa minima finisci le ore ${c.anticipoRispettoPalettoMin} min prima delle 17:15</div>` : ''}`;
  else if (f === 'pausa') {
    const ini = P(c.inizioPausa), mn = ini + 30, mx = Math.max(mn, Math.min(ini + P(c.pausaMassimaPerUscitaMinima), PARAMETRI.pausaFineFinestra));
    h = `<div class="tag">In pausa dalle ${c.inizioPausa}</div><div class="grid2">${big('Rientro minimo', T(mn), '30 minuti di pausa')}${big('Rientro massimo', T(mx), mx === PARAMETRI.pausaFineFinestra ? 'limite fascia 14:15' : 'per uscire alle 17:15')}</div><div class="sub">Uscita minima con rientro al minimo: ${c.uscitaTeorica}</div>`;
  } else if (f === 'pom') {
    const persi = c.minutiOltreOrario - c.straordinarioNettoMin;
    h = `<div class="tag">Pomeriggio</div><div class="grid2">${big('Uscita minima', c.uscitaTeorica, 'da timbrature entrata e pausa')}${c.isLive ? big('Se esci ora', `+${c.straordinarioNettoMin} min`, c.minutiOltreOrario > 0 ? `perdi ${persi} min non riconosciuti` : 'ore non ancora completate') : ''}</div>${pills(c)}`;
  } else h = `<div class="tag">Giornata conclusa</div><div class="grid2">${big('Ore svolte', F(c.oreTotaliSvolteMin))}${big('Straordinario', F(c.straordinarioNettoMin), 'uscita ' + c.ultimaUscita)}</div>`;
  $('hero').innerHTML = h;
  destCard(iso, c);
  $('alertContainer').innerHTML = c.attenzioni.length ? `<div class="alert"><b>Da controllare</b>${c.attenzioni.map(a => `<div>• ${a}</div>`).join('')}</div>` : '';
  renderReg(tG, gG);
  const r = x => `<div class="row"><span>${x[0]}</span><b>${x[1]}</b></div>`;
  $('recap').innerHTML = [['Entrata normalizzata', c.entrataNorm], ['Ore lavorate', F(c.oreLavorateMin)], ['Ore giustificate', F(c.oreGiustificateMin)], ['Ore svolte', F(c.oreTotaliSvolteMin)], ['Pausa', c.pausaEffettivaMin + ' min'], ['Straordinario', F(c.straordinarioNettoMin)], ['Ticket', ticketGiorno(iso) ? 'sì' : 'no']].map(r).join('');
}
const segHTML = (iso, d, pieno) => `<div class="seg"><button class="${d === 'BANCA' ? 'on' : ''}" ${pieno ? 'disabled' : ''} onclick="setDest('BANCA','${iso}')">Monte ore</button><button class="${d === 'PAGAMENTO' ? 'on' : ''}" onclick="setDest('PAGAMENTO','${iso}')">Pagamento</button></div>`;
function destCard(iso, c) {
  const box = $('destCard'), s = c.straordinarioNettoMin;
  if (s <= 0) { box.style.display = 'none'; return; }
  const resto = PARAMETRI.tettoBancaOre - accantonatoPrima(iso), pieno = resto <= 0, d = getDest(iso) || (pieno ? 'PAGAMENTO' : null);
  box.style.display = 'block';
  box.innerHTML = `${d ? '' : '<div class="warn">⚠ Non hai ancora scelto dove va lo straordinario</div>'}<div class="h">Straordinario di ${F(s)}: dove va?</div>${segHTML(iso, d, pieno)}<small class="note">${pieno ? 'Limite annuo di 40h raggiunto: solo pagamento' : d === 'BANCA' && s > resto ? `Accantonabili ancora ${F(resto)}: il resto va in pagamento` : `Monte ore accantonato ${F(accantonatoAnno(iso.slice(0, 4)))} su 40h`}</small>`;
}
function renderReg(tG, gG) {
  const ts = [...tG].sort((a, b) => P(a.ora) - P(b.ora)), ib = (fn, ic, cls, lbl) => `<button class="ib ${cls}" onclick="${fn}" aria-label="${lbl}">${ic}</button>`;
  $('regList').innerHTML = `<div class="h">Timbrature</div>` + (ts.length ? ts.map(t => { const i = timbrature.indexOf(t);
      return `<div class="tl"><span class="bd t">TIMBRATURA</span><span class="nm">${t.tipo}</span><b>${t.ora}</b>${ib(`modificaTimb(${i})`, IC.pen, '', 'Modifica')}${ib(`eliminaTimb(${i})`, IC.bin, 'd', 'Elimina')}</div>`; }).join('') : '<div class="empty">Nessuna timbratura</div>')
    + `<div class="h" style="margin-top:12px">Giustificativi</div>` + (gG.length ? gG.map(g => { const i = giustificativi.indexOf(g);
      const v = g.tipo === 'VISITA MEDICA' ? `${g.oraInizio}–${g.oraFine} (+tragitti)` : (g.durata ? F(P(g.durata)) : '');
      return `<div class="tl"><span class="bd g">GIUSTIFICATIVO</span><span class="nm">${g.tipo}</span><b>${v}</b>${ib(`eliminaGiust(${i})`, IC.bin, 'd', 'Elimina')}</div>`; }).join('') : '<div class="empty">Nessun giustificativo</div>');
}
function eliminaTimb(i) { const t = timbrature[i]; if (confirm(`Eliminare la timbratura ${t.tipo} delle ${t.ora}?`)) { timbrature.splice(i, 1); salvaDati(); refresh(); } }
function eliminaGiust(i) { if (confirm(`Eliminare il giustificativo ${giustificativi[i].tipo}?`)) { giustificativi.splice(i, 1); salvaDati(); refresh(); } }
const cambiaGiorno = n => { currentDate.setDate(currentDate.getDate() + n); aggiornaSchermataOggi(); };
const vaiAOggi = () => { currentDate = new Date(); aggiornaSchermataOggi(); };
function switchTab(id) {
  ['tab-oggi', 'tab-storico', 'tab-riepilogo'].forEach(t => $(t).style.display = t === id ? 'block' : 'none');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.t === id));
  if (id === 'tab-storico') caricaStorico(); if (id === 'tab-riepilogo') caricaRiepilogo();
}

// ---------- Timbrature ----------
function quickTimbra(tipo) { const n = new Date(); timbrature.push({ data: iso0(currentDate), ora: `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`, tipo, fittizia: false, autorizzata: false }); salvaDati(); refresh(); }
function apriTimb(tipo, ora, idx) {
  editIdx = idx === undefined ? null : idx;
  const n = new Date(); $('selTipoTimb').value = tipo || 'E';
  $('oraTimbManuale').value = ora || `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
  $('titTimb').textContent = editIdx === null ? 'Aggiungi timbratura' : 'Modifica timbratura';
  $('modalTimb').classList.add('active');
}
const modificaTimb = i => apriTimb(timbrature[i].tipo, timbrature[i].ora, i);
function salvaTimbraturaManuale() {
  const ora = $('oraTimbManuale').value, tipo = $('selTipoTimb').value; if (!ora) return;
  if (editIdx === null) timbrature.push({ data: iso0(currentDate), ora, tipo, fittizia: false, autorizzata: false });
  else { timbrature[editIdx].ora = ora.replace(/^0/, ''); timbrature[editIdx].tipo = tipo; timbrature[editIdx].fittizia = false; }
  salvaDati(); chiudiModal('modalTimb'); refresh();
}
const chiudiModal = id => $(id).classList.remove('active');

// ---------- Giustificativi ----------
const oreGiornata = () => currentDate.getDay() === 5 ? '6:00' : '8:00';
const apriDialogGiustificativo = () => { aggiornaFormGiust(); $('modalGiust').classList.add('active'); };
function aggiornaFormGiust() {
  const t = $('selTipoGiust').value, iso = iso0(currentDate), r = residuo(t, iso);
  $('visitaFields').style.display = t === 'VISITA MEDICA' ? 'block' : 'none';
  $('durataFields').style.display = TIPI_DURATA.includes(t) ? 'block' : 'none';
  $('limiteInfo').textContent = t === 'SCIOPERO' ? `Intera giornata: ${oreGiornata().slice(0, -3)} ore non retribuite`
    : r === null ? '' : t === 'ORE 4 NOVEMBRE' && !extra4Nov(iso.slice(0, 4)) ? 'Non maturate: serve aver lavorato il 4 novembre'
    : r <= 0 ? 'Soglia raggiunta: inserimento bloccato' : `Residuo disponibile${t === 'SMART WORKING' ? ' questa settimana' : ''}: ${F(r)}`;
}
function salvaGiustificativo() {
  const tipo = $('selTipoGiust').value, iso = iso0(currentDate), n = { data: iso, tipo };
  if (tipo === 'VISITA MEDICA') {
    n.oraInizio = $('visitaInizio').value; n.oraFine = $('visitaFine').value;
    if (!n.oraInizio || !n.oraFine || n.oraFine <= n.oraInizio) return alert("Orario non valido: la fine deve essere dopo l'inizio.");
    n.tragittoPrima = $('chkTragittoPrima').checked ? '0:30' : '0:00'; n.tragittoDopo = $('chkTragittoDopo').checked ? '0:30' : '0:00';
  } else if (tipo === 'SCIOPERO') {
    if (giustificativi.some(g => g.data === iso && g.tipo === 'SCIOPERO')) return alert('Sciopero già registrato per questo giorno.');
    n.durata = oreGiornata();
  } else if (TIPI_DURATA.includes(tipo)) {
    const d = $('durataManuale').value.trim() || '1:00', m = /^\d{1,2}:[0-5]\d$/.test(d) ? P(d) : 0;
    if (!m) return alert('Durata non valida: usa il formato ore:minuti, es. 1:30');
    if (tipo !== 'SMART WORKING' && m % 15) return alert("Questo giustificativo si prende a quarti d'ora.");
    if (tipo === 'FERIE' && m < 30) return alert("Il primo scatto delle ferie è di almeno mezz'ora.");
    n.durata = d;
  } else n.durata = '0:30';
  const req = uso(n), r = residuo(tipo, iso);
  if (r !== null && req > r) return alert(tipo === 'ORE RECUPERO' ? `Ore recupero insufficienti: disponibili ${F(Math.max(0, r))}, richieste ${F(req)}.\nSi sblocca accantonando altro straordinario.`
    : tipo === 'ORE 4 NOVEMBRE' ? `Ore 4 novembre disponibili: ${F(Math.max(0, r))}, richieste ${F(req)}.`
    : tipo === 'SMART WORKING' ? `Smart working massimo 8h a settimana: residuo ${F(Math.max(0, r))}, richieste ${F(req)}.\nBloccato fino alla prossima settimana.`
    : `Soglia annuale superata per ${tipo}: residuo ${F(Math.max(0, r))}, richieste ${F(req)}.\nBloccato fino al nuovo caricamento annuale.`);
  giustificativi.push(n); salvaDati(); chiudiModal('modalGiust'); refresh();
}

// ---------- Storico operativo ----------
function azione(iso, kind, tipo) { currentDate = new Date(iso + 'T12:00:00'); kind === 'timb' ? apriTimb(tipo, '') : apriDialogGiustificativo(); }
function caricaStorico() {
  const box = $('storicoList'); box.innerHTML = '';
  giorniConDati().reverse().slice(0, 30).forEach(d => {
    const tG = timbrature.filter(t => t.data === d), r = calcDay(d), pr = pausaRaw(tG), chips = [];
    mancanti(d, tG).forEach(t => chips.push(`<button class="chip" onclick="azione('${d}','timb','${t}')">+ Manca ${t}</button>`));
    const hasU = tG.some(t => t.tipo === 'U');
    if (hasU && r.oreTotaliSvolteMin < r.oreDovute) chips.push(`<button class="chip" onclick="azione('${d}','giust')">+ Giustificativo (mancano ${F(r.oreDovute - r.oreTotaliSvolteMin)})</button>`);
    let dest = '';
    if (r.straordinarioNettoMin > 0) {
      const pieno = PARAMETRI.tettoBancaOre - accantonatoPrima(d) <= 0, g = getDest(d) || (pieno ? 'PAGAMENTO' : null);
      dest = `<div class="${g ? '' : 'warn'}" style="margin-top:8px">${g ? '' : '⚠ Scegli: '}${segHTML(d, g, pieno)}</div>`;
    }
    const el = document.createElement('div'); el.className = 'day';
    el.innerHTML = `<div class="dh"><b>${new Date(d + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'short' })}</b>
      <button class="ib" onclick="currentDate=new Date('${d}T12:00:00');switchTab('tab-oggi');aggiornaSchermataOggi()" aria-label="Apri giorno">${IC.pen}</button></div>
      <div class="dm"><span>E ${r.entrataNorm}</span><span>U ${r.ultimaUscita}</span><span>Svolte ${F(r.oreTotaliSvolteMin)}</span><span>Pausa ${pr === null ? '—' : pr + ' min'}</span><span class="${r.straordinarioNettoMin ? 'am' : ''}">Str. ${r.straordinarioNettoMin ? '+' + r.straordinarioNettoMin + 'm' : '0'}</span></div>
      ${chips.length ? `<div class="chips">${chips.join('')}</div>` : ''}${dest}`;
    box.appendChild(el);
  });
}

// ---------- Riepilogo e punto zero ----------
function caricaRiepilogo() {
  const y = String(currentDate.getFullYear()), ym = iso0(currentDate).slice(0, 7), nm = currentDate.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  $('rieMeseTit').textContent = nm.charAt(0).toUpperCase() + nm.slice(1); $('rieAnnoTit').textContent = `Saldi ${y}`;
  const rp = ripartoAnno(y), m = { lav: 0, giu: 0, ban: 0, pag: 0, nd: 0, tk: 0 }, p = pzAttivo(y);
  giorniConDati().filter(d => d.startsWith(ym) && (!p || d > p.data)).forEach(d => {
    const r = calcDay(d), x = rp[d] || { ban: 0, pag: 0, nd: 0 };
    m.lav += r.oreLavorateMin; m.giu += r.oreGiustificateMin; m.ban += x.ban; m.pag += x.pag; m.nd += x.nd; if (ticketGiorno(d)) m.tk++;
  });
  const mese = t => giustificativi.filter(g => g.data.startsWith(ym) && g.tipo === t && (!p || g.data > p.data)).reduce((a, g) => a + uso(g), 0);
  const sw = mese('SMART WORKING'), sc = mese('SCIOPERO'), row = (a, b, w) => `<div class="row"><span>${a}</span><b${w ? ' style="color:var(--danger)"' : ''}>${b}</b></div>`;
  $('rieMese').innerHTML = row('Ore lavorate in sede', F(m.lav)) + row('Smart working', F(sw)) + row('Ore giustificate', F(m.giu - sw - sc)) + row('Sciopero (non retribuito)', F(sc))
    + row('Straordinario in monte ore', F(m.ban)) + row('Straordinario in pagamento', F(m.pag)) + (m.nd ? row('Straordinario da assegnare', F(m.nd), 1) : '') + row('Ticket maturati', m.tk);
  const acc = accantonatoAnno(y), usate = usatoAnno('ORE RECUPERO', y), e4 = extra4Nov(y);
  const bar = (l, u, maxH, note) => `<div class="f"><div class="row" style="border:0;padding:0"><span>${l}</span><b>${F(u)} / ${maxH}h</b></div><div class="bar"><i style="width:${maxH ? Math.min(100, u / (maxH * 60) * 100) : 0}%"></i></div>${note ? `<small style="color:var(--danger)">${note}</small>` : ''}</div>`;
  $('rieAnno').innerHTML = bar('Monte ore accantonato', acc, 40, acc >= PARAMETRI.tettoBancaOre ? 'Tetto annuo raggiunto' : '')
    + bar('Ore recupero usate', usate, 40, usate > acc ? 'Superiori al monte ore accantonato' : '')
    + bar('Ferie usate', usatoAnno('FERIE', y), 168) + bar('Ex-festività usate', usatoAnno('EX-FESTIVITÀ', y), 30) + bar('Visite mediche', usatoAnno('VISITA MEDICA', y), 30)
    + (e4 ? bar('Ore 4 novembre (extra)', usatoAnno('ORE 4 NOVEMBRE', y), 8) : row('Ore 4 novembre (extra)', 'non maturate'))
    + row('Smart working annuo', F(usatoAnno('SMART WORKING', y))) + row('Sciopero annuo', F(usatoAnno('SCIOPERO', y)));
  $('pzInfo').textContent = p ? `Punto zero attivo dal ${p.data.split('-').reverse().join('/')}: i dati precedenti non vengono conteggiati.` : 'Nessun punto zero impostato.';
}
function apriPZ() {
  const p = pz || {}, h = k => p[k] ? F(p[k]).replace('h ', ':').replace('m', '') : '';
  $('pzData').value = p.data || iso0(new Date());
  [['pzFerie', 'ferie'], ['pzEx', 'ex'], ['pzVisite', 'visite'], ['pzNov4', 'nov4'], ['pzRec', 'rec'], ['pzBanca', 'banca']].forEach(([id, k]) => $(id).value = h(k));
  $('pzLav').checked = !!p.lavNov4; $('modalPZ').classList.add('active');
}
function salvaPZ() {
  const v = id => P($(id).value.trim()) || 0;
  if (!$('pzData').value) return alert('Indica la data del punto zero.');
  if (!confirm('Da questa data i contatori ripartono dai valori indicati; timbrature e giustificativi precedenti non verranno più conteggiati nei saldi. Confermi?')) return;
  pz = { data: $('pzData').value, ferie: v('pzFerie'), ex: v('pzEx'), visite: v('pzVisite'), nov4: v('pzNov4'), rec: v('pzRec'), banca: v('pzBanca'), lavNov4: $('pzLav').checked };
  salvaDati(); chiudiModal('modalPZ'); refresh();
}
function rimuoviPZ() { pz = null; salvaDati(); chiudiModal('modalPZ'); refresh(); }

// ---------- Backup e aggiornamento ----------
$('btnSync').onclick = () => $('modalSync').classList.add('active');
function esportaDati() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ versione: 3, timbrature, giustificativi, destinazioni, puntoZero: pz }, null, 2)], { type: 'application/json' }));
  a.download = `backup_agesp_flex_${todayISO()}.json`; a.click();
}
function importaDati() {
  const f = $('fileImport').files[0]; if (!f) return alert('Seleziona un file di backup.');
  const rd = new FileReader();
  rd.onload = e => { try {
    const d = JSON.parse(e.target.result); if (!d.timbrature || !d.giustificativi) return alert('File di backup non valido.');
    timbrature = d.timbrature; giustificativi = d.giustificativi; destinazioni = d.destinazioni || {}; pz = d.puntoZero || null;
    salvaDati(); chiudiModal('modalSync'); refresh();
  } catch (err) { alert('Errore nella lettura del file: ' + err.message); } };
  rd.readAsText(f);
}
async function forzaAggiornamento() {
  try { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); } catch (e) {}
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
  $('ver').textContent = ok ? `Agesp Flex v${APP_VERSION} · by arch. Lonardo Massimo` : `File non allineati (pagina ${hv}, logica ${APP_VERSION}): usa "Forza aggiornamento" in Backup`;
  $('ver').style.color = ok ? 'var(--muted)' : 'var(--danger)';
  setInterval(() => { if ($('tab-oggi').style.display !== 'none') aggiornaSchermataOggi(); }, 30000);
};
