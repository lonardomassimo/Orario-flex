/** Cronoflex — orario flessibile AGESP SPA · by arch. Lonardo Massimo */
const APP_VERSION = '4.0', KEY = 'cronoflex_v4';
const $ = id => document.getElementById(id), F = formatMinutesToHoursMins, T = formatMinutesToTime, P = parseTimeToMinutes;
const VUOTO = () => ({ t: [], g: [], d: {}, pz: null, ver: {}, rep: [], att: {}, ev: [], todo: [], busta: {} });
let S = VUOTO(), undoStack = [], editIdx = null, currentDate = new Date(), rie = { y: new Date().getFullYear(), m: new Date().getMonth() + 1 };
const TIPI_DURATA = ['FERIE', 'EX-FESTIVITÀ', 'ORE RECUPERO', 'SMART WORKING', 'ORE 4 NOVEMBRE'];
const LIMITI = { 'EX-FESTIVITÀ': 30 * 60, 'VISITA MEDICA': 30 * 60 }, FERIE_ANNO = 168 * 60, SW_SETT = 480;
const PZ_KEY = { 'FERIE': 'ferie', 'EX-FESTIVITÀ': 'ex', 'VISITA MEDICA': 'visite', 'ORE 4 NOVEMBRE': 'nov4', 'ORE RECUPERO': 'rec' };
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
function load() {
  const raw = localStorage.getItem(KEY), old = k => JSON.parse(localStorage.getItem(k) || 'null');
  if (raw) S = Object.assign(VUOTO(), JSON.parse(raw));
  else {
    S.t = old('orario_flex_timbrature') || (window.SEED_TIMBRATURE || []).map(t => ({ ...t, data: formatExcelDate(t.data) }));
    S.g = old('orario_flex_giustificativi') || (window.SEED_GIUSTIFICATIVI || []).map(g => ({ ...g, data: formatExcelDate(g.data) }));
    S.d = old('orario_flex_destinazioni') || {}; S.pz = old('orario_flex_puntozero');
  }
  S.g.forEach(g => { if (g.data === '2025-03-17') g.data = '2026-03-17'; }); // refuso nei dati storici
  save();
}
const save = () => localStorage.setItem(KEY, JSON.stringify(S));
function mut(fn) { undoStack.push(JSON.stringify(S)); if (undoStack.length > 30) undoStack.shift(); fn(); save(); refresh(); }
function annulla() { if (!undoStack.length) return toast('Nessuna operazione da annullare'); S = JSON.parse(undoStack.pop()); save(); refresh(); toast('Ultima operazione annullata'); }
function toast(m) { const e = $('toast'); e.textContent = m; e.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('on'), 5000); }
const bloccato = iso => { if (S.ver[iso.slice(0, 7)]) { toast('Mese verificato: sbloccalo dal Riepilogo per modificarlo'); return true; } return false; };

// ---------- Calendario: riposo e festivi ----------
function festivi(y) {
  if (festivi.c[y]) return festivi.c[y];
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const pq = iso0(new Date(y, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 2));
  return festivi.c[y] = new Set(['01-01', '01-06', '04-25', '05-01', '06-02', '08-15', '11-01', '12-08', '12-25', '12-26'].map(x => `${y}-${x}`).concat(pq));
}
festivi.c = {};
const tipoGiorno = iso => ({ rip: dow(iso) === 0 || dow(iso) === 6, fest: festivi(+iso.slice(0, 4)).has(iso) });
const lavorativo = iso => { const t = tipoGiorno(iso); return !t.rip && !t.fest; };
const ultimoMese = (y, m) => new Date(y, m, 0).getDate();

// ---------- Accessi dati ----------
const tDay = iso => S.t.filter(t => t.data === iso && !t.rep), gDay = iso => S.g.filter(g => g.data === iso);
const calcDay = iso => calcolaGiornata(iso, tDay(iso), gDay(iso), null);
const giorniConDati = () => [...new Set([...S.t.map(t => t.data), ...S.g.map(g => g.data)])].filter(Boolean).sort();
const getDest = iso => S.d[iso] || null;
const inRep = iso => S.rep.some(r => iso >= r.da && iso <= r.a);
const durMin = g => g.durata ? (P(g.durata) || 0) : Math.max(0, (P(g.oraFine) || 0) - (P(g.oraInizio) || 0));
const uso = g => durMin(g) + (P(g.tragittoPrima) || 0) + (P(g.tragittoDopo) || 0);
const pzAttivo = y => S.pz && S.pz.data && S.pz.data.slice(0, 4) === String(y) ? S.pz : null;
const primoAnno = () => Math.min(+todayISO().slice(0, 4), ...giorniConDati().map(d => +d.slice(0, 4)), S.pz ? +S.pz.data.slice(0, 4) : 9999);

// ---------- Contatori annuali con riporti ----------
function usatoAnno(tipo, y, fino) {
  const p = pzAttivo(y), ok = g => tipo === 'ORE RECUPERO' ? isRecupero(g.tipo) : g.tipo === tipo;
  return S.g.filter(g => g.data.startsWith(y) && (!p || g.data > p.data) && (!fino || g.data <= fino) && ok(g)).reduce((a, g) => a + uso(g), 0) + (p ? p[PZ_KEY[tipo]] || 0 : 0);
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
  const p = pzAttivo(y); let resto = bancaAbilitata(y) ? PARAMETRI.tettoBancaOre - (p ? p.banca || 0 : 0) : 0; const out = {};
  giorniConDati().filter(d => d.startsWith(y) && (!p || d > p.data)).forEach(d => {
    const s = calcDay(d).straordinarioNettoMin, g = getDest(d) || (resto <= 0 ? 'PAGAMENTO' : null), ban = g === 'BANCA' ? Math.min(s, Math.max(0, resto)) : 0; resto -= ban;
    out[d] = { ban, pag: g === 'PAGAMENTO' ? s : g === 'BANCA' ? s - ban : 0, nd: g ? 0 : s };
  });
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
const pausaRaw = tG => { const u = tG.find(t => t.tipo === 'U PAUSA'), e = tG.find(t => t.tipo === 'E PAUSA'); return u && e ? Math.max(0, P(e.ora) - P(u.ora)) : null; };
function mancanti(iso, tG) {
  const has = t => tG.some(x => x.tipo === t), m = [];
  if (has('U') && !has('E')) m.push('E'); if (has('E') && !has('U') && iso < todayISO()) m.push('U');
  if (!isVen(iso)) { if (has('U PAUSA') && !has('E PAUSA')) m.push('E PAUSA'); if (has('E PAUSA') && !has('U PAUSA')) m.push('U PAUSA'); }
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
  if ((td.rip || td.fest) && !tG.length && !gG.length) return out;
  if (!tG.length && !gG.length) return [{ t: 'Nessuna registrazione', f: 't' }];
  mancanti(iso, tG).forEach(x => out.push({ t: `Manca la timbratura ${x}`, f: 't:' + x }));
  if (tG.some(t => t.tipo === 'U') && r.oreTotaliSvolteMin < r.oreDovute) out.push({ t: `Mancano ${F(r.oreDovute - r.oreTotaliSvolteMin)}: serve un giustificativo`, f: 'g' });
  r.attenzioni.forEach(a => { if (!/^Ore mancanti|^Uscita mancante|^Ritardo compensato/.test(a)) out.push({ t: a }); });
  if (r.straordinarioNettoMin > 0 && !getDest(iso) && !pienoBanca(iso)) out.push({ t: 'Straordinario: destinazione non scelta', f: 'd' });
  const mi = mancataInfo(iso); if (mi && mi.oltre) out.push({ t: `Mancata timbratura oltre il limite mensile (n° ${mi.n}: +${mi.n - 1})` });
  return out;
}

// ---------- Oggi ----------
const big = (l, v, s) => `<div class="big"><small>${l}</small><b>${v}</b>${s ? `<em>${s}</em>` : ''}</div>`;
const pills = c => `<div class="lbl">Se fai straordinario esci alle</div><div class="pills">${[30, 45, 60].map((m, i) => `<div><small>+${m} min</small><b>${c['oraScatto' + m + 'm']}</b></div>`).join('')}</div>`;
function fase(tG, ven) { const has = t => tG.some(x => x.tipo === t); if (!has('E')) return 'prima'; if (has('U')) return 'fine'; if (ven || has('E PAUSA')) return 'pom'; return has('U PAUSA') ? 'pausa' : 'mat'; }
const rientri = c => { const ini = P(c.inizioPausa), mn = ini + 30; return { mn, mx: Math.max(mn, Math.min(ini + P(c.pausaMassimaPerUscitaMinima), PARAMETRI.pausaFineFinestra)) }; };
function aggiornaSchermataOggi() {
  const iso = iso0(currentDate), now = new Date(), nm = now.getHours() * 60 + now.getMinutes(), isOggi = iso === todayISO(), td = tipoGiorno(iso);
  const tG = tDay(iso), gG = gDay(iso), c = calcolaGiornata(iso, tG, gG, isOggi ? nm : null), f = fase(tG, isVen(iso));
  $('dWeek').textContent = cap(currentDate.toLocaleDateString('it-IT', { weekday: 'long' })); $('dDay').textContent = `${currentDate.getDate()} ${MESI[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
  $('dBadges').innerHTML = [td.rip ? '<span class="bd n">RIPOSO</span>' : '', td.fest ? '<span class="bd n">FESTIVO</span>' : '', inRep(iso) ? '<span class="bd r">REPERIBILE</span>' : '', S.ver[iso.slice(0, 7)] ? '<span class="bd g">MESE VERIFICATO</span>' : ''].join('');
  let h = '';
  if (f === 'prima') h = `<div class="hl">${!lavorativo(iso) && !gG.length ? (td.fest && td.rip ? 'Festivo che cade di riposo' : td.fest ? 'Giornata festiva' : 'Giornata di riposo') : "In attesa della timbratura d'entrata"}</div>`;
  else if (f === 'mat') h = `<div class="tag">Mattina · entrata ${c.entrataNorm}</div><div class="grid2">${big('Pausa massima', F(P(c.pausaMassimaPerUscitaMinima)), 'per uscire alle 17:15')}${big('Uscita minima', c.uscitaTeorica, 'con pausa di 30 min')}</div>${pills(c)}${c.anticipoRispettoPalettoMin > 0 ? `<div class="sub">Con la pausa minima finisci le ore ${c.anticipoRispettoPalettoMin} min prima delle 17:15</div>` : ''}`;
  else if (f === 'pausa') { const { mn, mx } = rientri(c); h = `<div class="tag">In pausa dalle ${c.inizioPausa}</div><div class="grid2">${big('Rientro minimo', T(mn), '30 minuti di pausa')}${big('Rientro massimo', T(mx), mx === PARAMETRI.pausaFineFinestra ? 'limite fascia 14:15' : 'per uscire alle 17:15')}</div><div class="sub">${isOggi ? `Margine: ${Math.max(0, mx - nm)} min sotto il rientro massimo · ` : ''}pausa utile ${mx - P(c.inizioPausa)} min</div>`; }
  else if (f === 'pom') h = `<div class="tag">Pomeriggio</div><div class="grid2">${big('Uscita minima', c.uscitaTeorica)}${c.isLive ? big('Se esci ora', `+${c.straordinarioNettoMin} min`, c.minutiOltreOrario > 0 ? `perdi ${c.minutiOltreOrario - c.straordinarioNettoMin} min non riconosciuti` : 'ore non ancora completate') : ''}</div>${pills(c)}`;
  else h = `<div class="tag">Giornata conclusa</div><div class="grid2">${big('Ore svolte', F(c.oreTotaliSvolteMin))}${big('Straordinario', F(c.straordinarioNettoMin), 'uscita ' + c.ultimaUscita)}</div>`;
  $('hero').innerHTML = h; destCard(iso, c);
  const bn = []; const rp = S.rep.find(r => repReminderDay(r.da) === iso); if (rp) bn.push(`Reperibilità da ${rp.da.split('-').reverse().join('/')}: ricordati prima di staccare`);
  const al = iso < todayISO() ? alertGiorno(iso) : [];
  $('alertContainer').innerHTML = (bn.length ? `<div class="alert">${bn.join('<br>')}</div>` : '') + (al.length ? `<div class="alert"><b>Da sistemare</b>${al.map(a => `<div>• ${a.t}</div>`).join('')}</div>` : '');
  renderReg(tG, gG, iso); renderAgendaGiorno(iso); renderAttivita(iso); renderTodo(iso);
  $('recap').innerHTML = [['Entrata normalizzata', c.entrataNorm], ['Ore lavorate', F(c.oreLavorateMin)], ['Ore giustificate', F(c.oreGiustificateMin)], ['Ore svolte', F(c.oreTotaliSvolteMin)], ['Pausa', c.pausaEffettivaMin + ' min'], ['Straordinario', F(c.straordinarioNettoMin)], ['Ticket', ticketGiorno(iso) ? 'sì' : 'no']].map(x => `<div class="row"><span>${x[0]}</span><b>${x[1]}</b></div>`).join('');
}
const segHTML = (iso, d, pieno) => `<div class="seg"><button class="${d === 'BANCA' ? 'on' : ''}" ${pieno ? 'disabled' : ''} onclick="setDest('BANCA','${iso}')">Monte ore</button><button class="${d === 'PAGAMENTO' ? 'on' : ''}" onclick="setDest('PAGAMENTO','${iso}')">Pagamento</button></div>`;
function setDest(v, iso) { iso = iso || iso0(currentDate); if (bloccato(iso)) return; mut(() => S.d[iso] = v); }
function destCard(iso, c) {
  const box = $('destCard'), s = c.straordinarioNettoMin; if (s <= 0) { box.style.display = 'none'; return; }
  const pieno = pienoBanca(iso), d = getDest(iso) || (pieno ? 'PAGAMENTO' : null), y = iso.slice(0, 4); box.style.display = 'block';
  box.innerHTML = `${d ? '' : '<div class="warn">⚠ Non hai ancora scelto dove va lo straordinario</div>'}<div class="h">Straordinario di ${F(s)}: dove va?</div>${segHTML(iso, d, pieno)}<small class="note">${!bancaAbilitata(y) ? 'Accantonamento non attivo: ferie residue oltre 50h a fine anno scorso' : pieno ? 'Limite annuo di 40h raggiunto: solo pagamento' : `Ancora accantonabili ${F(accantonabile(y))}`}</small>`;
}
function renderReg(tG, gG, iso) {
  const ts = S.t.filter(t => t.data === iso).sort((a, b) => P(a.ora) - P(b.ora)), ib = (fn, ic, cls, l) => `<button class="ib ${cls}" onclick="${fn}" aria-label="${l}">${ic}</button>`, mi = mancataInfo(iso);
  $('regList').innerHTML = `<div class="h">Timbrature</div>` + (ts.length ? ts.map(t => { const i = S.t.indexOf(t);
    return `<div class="tl"><span class="bd t">TIMBRATURA</span><span class="nm">${t.tipo}${t.mancata ? ' <span class="bd x">MANCATA</span>' : ''}${t.rep ? ' <span class="bd r">REP</span>' : ''}</span><b>${t.ora}</b>${ib(`modificaTimb(${i})`, IC.pen, '', 'Modifica')}${ib(`eliminaTimb(${i})`, IC.bin, 'd', 'Elimina')}</div>`; }).join('') : '<div class="empty">Nessuna timbratura</div>')
    + (mi ? `<div class="empty" style="color:var(--danger)">Mancata timbratura n° ${mi.n} del mese${mi.oltre ? ` — oltre il limite di 1: +${mi.n - 1}` : ' (tollerata)'}</div>` : '')
    + `<div class="h" style="margin-top:12px">Giustificativi</div>` + (gG.length ? gG.map(g => { const i = S.g.indexOf(g), v = g.tipo === 'VISITA MEDICA' ? `${g.oraInizio}–${g.oraFine} (+tragitti)` : (g.durata ? F(P(g.durata)) : '');
    return `<div class="tl"><span class="bd g">GIUSTIFICATIVO</span><span class="nm">${g.tipo}</span><b>${v}</b>${ib(`eliminaGiust(${i})`, IC.bin, 'd', 'Elimina')}</div>`; }).join('') : '<div class="empty">Nessun giustificativo</div>');
}
function eliminaTimb(i) { const t = S.t[i]; if (bloccato(t.data)) return; if (confirm(`Eliminare la timbratura ${t.tipo} delle ${t.ora}?`)) mut(() => S.t.splice(i, 1)); }
function eliminaGiust(i) { const g = S.g[i]; if (bloccato(g.data)) return; if (confirm(`Eliminare il giustificativo ${g.tipo}?`)) mut(() => S.g.splice(i, 1)); }
const cambiaGiorno = n => { currentDate.setDate(currentDate.getDate() + n); aggiornaSchermataOggi(); };
const vaiAOggi = () => { currentDate = new Date(); aggiornaSchermataOggi(); };

// Agenda, attività, cose da fare
const rowEv = e => `<div class="tl"><span class="bd ${e.tipo === 'Lavoro' ? 't' : 'g'}">${e.tipo.toUpperCase()}</span><span class="nm"><b>${e.ora || ''}</b> ${e.titolo}${e.luogo ? ` · ${e.luogo}` : ''}${e.fuori ? ' <span class="bd x">FUORI SEDE</span>' : ''}</span><button class="ib d" onclick="delEv('${e.id}')" aria-label="Elimina">${IC.bin}</button></div>`;
function renderAgendaGiorno(iso) { const l = S.ev.filter(e => e.data === iso).sort((a, b) => (a.ora || '').localeCompare(b.ora || '')); $('agendaGiorno').innerHTML = l.length ? l.map(rowEv).join('') : '<div class="empty">Nessun impegno</div>'; }
function apriEv() { $('evData').value = iso0(currentDate); $('evOra').value = ''; $('evTitolo').value = ''; $('evLuogo').value = ''; $('evFuori').checked = false; $('modalEv').classList.add('active'); }
function salvaEv() { const t = $('evTitolo').value.trim(); if (!t || !$('evData').value) return alert('Inserisci data e titolo.'); mut(() => S.ev.push({ id: uid(), data: $('evData').value, ora: $('evOra').value, titolo: t, luogo: $('evLuogo').value.trim(), tipo: $('evTipo').value, fuori: $('evFuori').checked })); chiudiModal('modalEv'); }
const delEv = id => mut(() => S.ev = S.ev.filter(e => e.id !== id));
function renderAttivita(iso) { const l = S.att[iso] || []; $('attList').innerHTML = l.length ? l.map((a, i) => `<div class="tl"><span class="nm"><b>${a.cat}</b>${a.note ? `<br><small>${a.note}</small>` : ''}</span><button class="ib d" onclick="delAtt(${i})" aria-label="Elimina">${IC.bin}</button></div>`).join('') : '<div class="empty">Nessuna attività registrata</div>'; }
function addAtt() { const iso = iso0(currentDate); if (bloccato(iso)) return; const n = $('attNote').value.trim(); mut(() => (S.att[iso] = S.att[iso] || []).push({ cat: $('attCat').value, note: n })); $('attNote').value = ''; }
const delAtt = i => { const iso = iso0(currentDate); if (!bloccato(iso)) mut(() => S.att[iso].splice(i, 1)); };
function renderTodo(iso) { const l = S.todo.filter(x => x.data === iso); $('todoList').innerHTML = l.length ? l.map(x => `<div class="tl"><label class="nm chk"><input type="checkbox" ${x.fatto ? 'checked' : ''} onchange="togTodo('${x.id}')"><span style="${x.fatto ? 'text-decoration:line-through;color:var(--muted)' : ''}">${x.testo}</span></label><button class="ib d" onclick="delTodo('${x.id}')" aria-label="Elimina">${IC.bin}</button></div>`).join('') : '<div class="empty">Niente da fare</div>'; }
function addTodo() { const t = $('todoIn').value.trim(); if (!t) return; mut(() => S.todo.push({ id: uid(), data: iso0(currentDate), testo: t, fatto: false })); $('todoIn').value = ''; }
const togTodo = id => mut(() => { const x = S.todo.find(y => y.id === id); x.fatto = !x.fatto; }), delTodo = id => mut(() => S.todo = S.todo.filter(x => x.id !== id));

// ---------- Pagine e menu ----------
function pagina(id) {
  document.querySelectorAll('.pg').forEach(p => p.classList.toggle('on', p.id === 'p-' + id)); $('drawer').classList.remove('open'); window.scrollTo(0, 0);
  $('titPag').textContent = { oggi: 'Oggi', agenda: 'Agenda', storico: 'Storico', riepilogo: 'Riepilogo', busta: 'Verifica busta paga', rep: 'Reperibilità' }[id]; pagina.cur = id; refresh();
}
function refresh() {
  const p = pagina.cur || 'oggi';
  if (p === 'oggi') aggiornaSchermataOggi(); if (p === 'storico') caricaStorico(); if (p === 'riepilogo') caricaRiepilogo(); if (p === 'agenda') caricaAgenda(); if (p === 'busta') caricaBusta(); if (p === 'rep') caricaRep();
  const rd = reportDovuto(); $('repBanner').innerHTML = rd ? `<div class="alert">📄 Report di ${nomeMese(rd)} pronto: <a href="#" onclick="apriReport('${rd}');return false">aprilo</a></div>` : '';
}
const apriMenu = () => $('drawer').classList.toggle('open');

// ---------- Timbrature ----------
function quickTimbra(tipo) { const iso = iso0(currentDate); if (bloccato(iso)) return; const n = new Date(); mut(() => S.t.push({ data: iso, ora: `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`, tipo, mancata: false, fittizia: false, autorizzata: false })); }
function apriTimb(tipo, ora, idx) {
  editIdx = idx === undefined ? null : idx; const n = new Date(), t = editIdx === null ? {} : S.t[editIdx];
  $('selTipoTimb').value = tipo || 'E'; $('oraTimbManuale').value = ora || `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
  $('chkMancata').checked = !!t.mancata; $('chkRep').checked = !!t.rep; $('rowRep').style.display = inRep(editIdx === null ? iso0(currentDate) : t.data) ? 'flex' : 'none';
  $('titTimb').textContent = editIdx === null ? 'Aggiungi timbratura' : 'Modifica timbratura'; $('modalTimb').classList.add('active');
}
const modificaTimb = i => apriTimb(S.t[i].tipo, S.t[i].ora, i);
function salvaTimbraturaManuale() {
  const ora = $('oraTimbManuale').value, tipo = $('selTipoTimb').value, iso = editIdx === null ? iso0(currentDate) : S.t[editIdx].data; if (!ora || bloccato(iso)) return;
  const f = { ora: ora.replace(/^0/, ''), tipo, mancata: $('chkMancata').checked, rep: $('chkRep').checked, fittizia: false };
  mut(() => editIdx === null ? S.t.push({ data: iso, autorizzata: false, ...f }) : Object.assign(S.t[editIdx], f)); chiudiModal('modalTimb');
  const mi = f.mancata && mancataInfo(iso); if (mi) toast(`Mancata timbratura n° ${mi.n} del mese${mi.oltre ? ` — oltre il limite di 1: +${mi.n - 1}` : ' (tollerata)'}`);
}
const chiudiModal = id => $(id).classList.remove('active');

// ---------- Giustificativi ----------
const oreGiornata = () => currentDate.getDay() === 5 ? '6:00' : '8:00', apriDialogGiustificativo = () => { aggiornaFormGiust(); $('modalGiust').classList.add('active'); };
function aggiornaFormGiust() {
  const t = $('selTipoGiust').value, iso = iso0(currentDate), r = residuo(t, iso), y = iso.slice(0, 4);
  $('visitaFields').style.display = t === 'VISITA MEDICA' ? 'block' : 'none'; $('durataFields').style.display = TIPI_DURATA.includes(t) ? 'block' : 'none';
  $('limiteInfo').textContent = t === 'SCIOPERO' ? `Intera giornata: ${oreGiornata().slice(0, -3)} ore non retribuite` : r === null ? '' : t === 'ORE 4 NOVEMBRE' && !extra4Nov(y) ? 'Non maturate: serve aver lavorato il 4 novembre' : r <= 0 ? 'Soglia raggiunta: inserimento bloccato' : `Residuo disponibile${t === 'SMART WORKING' ? ' questa settimana' : t === 'FERIE' && iso > y + '-06-30' && carryFerie(y) > carryUsato(y) ? ' (riporto scaduto il 30 giugno)' : ''}: ${F(r)}`;
}
function salvaGiustificativo() {
  const tipo = $('selTipoGiust').value, iso = iso0(currentDate), n = { data: iso, tipo }; if (bloccato(iso)) return;
  if (tipo === 'VISITA MEDICA') {
    n.oraInizio = $('visitaInizio').value; n.oraFine = $('visitaFine').value; if (!n.oraInizio || !n.oraFine || n.oraFine <= n.oraInizio) return alert("Orario non valido: la fine deve essere dopo l'inizio.");
    n.tragittoPrima = $('chkTragittoPrima').checked ? '0:30' : '0:00'; n.tragittoDopo = $('chkTragittoDopo').checked ? '0:30' : '0:00';
  } else if (tipo === 'SCIOPERO') { if (S.g.some(g => g.data === iso && g.tipo === 'SCIOPERO')) return alert('Sciopero già registrato per questo giorno.'); n.durata = oreGiornata(); }
  else if (TIPI_DURATA.includes(tipo)) {
    const d = $('durataManuale').value.trim() || '1:00', m = /^\d{1,2}:[0-5]\d$/.test(d) ? P(d) : 0;
    if (!m) return alert('Durata non valida: usa il formato ore:minuti, es. 1:30'); if (tipo !== 'SMART WORKING' && m % 15) return alert("Questo giustificativo si prende a quarti d'ora."); if (tipo === 'FERIE' && m < 30) return alert("Il primo scatto delle ferie è di almeno mezz'ora."); n.durata = d;
  } else n.durata = '0:30';
  const req = uso(n), r = residuo(tipo, iso);
  if (r !== null && req > r) return alert(tipo === 'ORE RECUPERO' ? `Ore recupero insufficienti: disponibili ${F(Math.max(0, r))}, richieste ${F(req)}.\nSi sblocca accantonando altro straordinario.` : tipo === 'ORE 4 NOVEMBRE' ? `Ore 4 novembre disponibili: ${F(Math.max(0, r))}, richieste ${F(req)}.` : tipo === 'SMART WORKING' ? `Smart working massimo 8h a settimana: residuo ${F(Math.max(0, r))}, richieste ${F(req)}.\nBloccato fino alla prossima settimana.` : tipo === 'FERIE' ? `Ferie disponibili: ${F(Math.max(0, r))}, richieste ${F(req)}.\nIl riporto dell'anno scorso scade il 30 giugno.` : `Soglia annuale superata per ${tipo}: residuo ${F(Math.max(0, r))}, richieste ${F(req)}.\nBloccato fino al nuovo caricamento annuale.`);
  mut(() => S.g.push(n)); chiudiModal('modalGiust');
}

// ---------- Storico ----------
function fix(iso, f) { currentDate = D(iso); if (f === 'd') return pagina('oggi'); if (f.startsWith('t:')) apriTimb(f.slice(2), ''); else if (f === 't') apriTimb(); else apriDialogGiustificativo(); }
function caricaStorico() {
  const box = $('storicoList'); box.innerHTML = ''; const oggi = D(todayISO());
  for (let k = 0; k < 45; k++) {
    const dd = new Date(oggi); dd.setDate(dd.getDate() - k); const d = iso0(dd), td = tipoGiorno(d), tG = tDay(d), gG = gDay(d), has = tG.length || gG.length, el = document.createElement('div'); el.className = 'day';
    const ds = cap(dd.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'short' }));
    if (!has && (td.rip || td.fest)) { el.classList.add('quiet'); el.innerHTML = `<div class="dh"><b>${ds}</b><span class="bd n">${td.fest ? 'FESTIVO' : 'RIPOSO'}${td.fest && td.rip ? ' (di riposo)' : ''}</span></div>`; box.appendChild(el); continue; }
    const r = calcDay(d), pr = pausaRaw(tG), al = d < todayISO() ? alertGiorno(d) : [], mi = mancataInfo(d), nd = r.straordinarioNettoMin > 0, g = getDest(d) || (pienoBanca(d) ? 'PAGAMENTO' : null);
    el.innerHTML = `<div class="dh"><b>${ds}</b><span>${has && ticketGiorno(d) ? '<span class="bd g">TICKET ✓</span> ' : ''}${mi ? `<span class="bd x">MANCATA${mi.oltre ? ` +${mi.n - 1}` : ''}</span> ` : ''}${inRep(d) ? '<span class="bd r">REP</span> ' : ''}${S.ver[d.slice(0, 7)] ? '<span class="bd g">VERIFICATO</span>' : ''}<button class="ib" onclick="currentDate=D('${d}');pagina('oggi')" aria-label="Apri giornata">${IC.pen}</button></span></div>
      ${has ? `<div class="dm"><span>E ${r.entrataNorm}</span><span>U ${r.ultimaUscita}</span><span>Svolte ${F(r.oreTotaliSvolteMin)}</span><span>Pausa ${pr === null ? '—' : pr + ' min'}</span><span class="${nd ? 'am' : ''}">Str. ${nd ? '+' + r.straordinarioNettoMin + 'm' : '0'}</span></div>` : ''}
      ${al.length ? `<div class="chips">${al.map(a => `<button class="chip" onclick="fix('${d}','${a.f || 'd'}')">${a.t}</button>`).join('')}</div>` : ''}${nd && !S.ver[d.slice(0, 7)] ? `<div class="${g ? '' : 'warn'}" style="margin-top:8px">${g ? '' : '⚠ Scegli: '}${segHTML(d, g, pienoBanca(d))}</div>` : ''}`;
    box.appendChild(el);
  }
}

// ---------- Riepilogo, report, navigazione mesi ----------
function navMese(d) { rie.m += d; if (rie.m < 1) { rie.m = 12; rie.y--; } if (rie.m > 12) { rie.m = 1; rie.y++; } refresh(); }
function setNav(y, m) { rie.y = +y; rie.m = +m; refresh(); }
function navHTML() { const ys = []; for (let y = primoAnno(); y <= new Date().getFullYear() + 1; y++) ys.push(y);
  return `<div class="nav2"><button class="ib" onclick="navMese(-1)" aria-label="Mese precedente">‹</button><select onchange="setNav(rie.y,this.value)">${MESI.map((m, i) => `<option value="${i + 1}" ${i + 1 === rie.m ? 'selected' : ''}>${cap(m)}</option>`).join('')}</select><select onchange="setNav(this.value,rie.m)">${ys.map(y => `<option ${y === rie.y ? 'selected' : ''}>${y}</option>`).join('')}</select><button class="ib" onclick="navMese(1)" aria-label="Mese successivo">›</button></div>`; }
function datiMese(ym) {
  const y = ym.slice(0, 4), rp = ripartoAnno(y), p = pzAttivo(y), m = { lav: 0, giu: 0, ban: 0, pag: 0, nd: 0, tk: 0, gt: {}, festRip: [], att: {} };
  giorniConDati().filter(d => d.startsWith(ym) && (!p || d > p.data)).forEach(d => { const r = calcDay(d), x = rp[d] || { ban: 0, pag: 0, nd: 0 }; m.lav += r.oreLavorateMin; m.giu += r.oreGiustificateMin; m.ban += x.ban; m.pag += x.pag; m.nd += x.nd; if (ticketGiorno(d)) m.tk++; });
  S.g.filter(g => g.data.startsWith(ym) && (!p || g.data > p.data)).forEach(g => { const k = isRecupero(g.tipo) ? 'ORE RECUPERO' : g.tipo; m.gt[k] = (m.gt[k] || 0) + uso(g); });
  m.sw = m.gt['SMART WORKING'] || 0; m.sc = m.gt['SCIOPERO'] || 0; m.mancate = mancateMese(ym); m.repMin = repMin(ym);
  for (let d = 1; d <= ultimoMese(+y, +ym.slice(5)); d++) { const i = `${ym}-${String(d).padStart(2, '0')}`, t = tipoGiorno(i); if (t.fest && t.rip) m.festRip.push(i); (S.att[i] || []).forEach(a => m.att[a.cat] = (m.att[a.cat] || 0) + 1); }
  m.ev = S.ev.filter(e => e.data.startsWith(ym)).sort((a, b) => (a.data + a.ora).localeCompare(b.data + b.ora)); return m;
}
const R = (a, b, w) => `<div class="row"><span>${a}</span><b${w ? ' style="color:var(--danger)"' : ''}>${b}</b></div>`;
function righeMese(m) {
  const ob = Math.max(0, m.mancate.length - 1);
  return R('Ore lavorate in sede', F(m.lav)) + R('Smart working', F(m.sw)) + R('Ore giustificate', F(m.giu - m.sw - m.sc)) + R('Sciopero (non retribuito)', F(m.sc)) + R('Straordinario in monte ore', F(m.ban)) + R('Straordinario in pagamento', F(m.pag)) + (m.nd ? R('Straordinario da assegnare', F(m.nd), 1) : '') + R('Ticket maturati', m.tk)
    + R('Mancate timbrature', `${m.mancate.length}${ob ? ` (${ob} oltre il limite)` : ''}`, ob) + R('Ore di reperibilità', F(m.repMin)) + (m.festRip.length ? R('Festivi caduti di riposo (da verificare in busta)', m.festRip.map(d => d.slice(8) + '/' + d.slice(5, 7)).join(', ')) : '');
}
function caricaRiepilogo() {
  const ym = ymStr(rie.y, rie.m), y = String(rie.y), m = datiMese(ym), ver = !!S.ver[ym]; $('rieNav').innerHTML = navHTML();
  $('rieMese').innerHTML = `<div class="h">${cap(nomeMese(ym))}${ver ? ' · verificato ✓' : ''}</div>` + righeMese(m) + `<div class="foot"><button class="btn" onclick="apriReport('${ym}')">Report del mese</button><button class="btn ${ver ? '' : 'main'}" onclick="toggleVer('${ym}')">${ver ? 'Sblocca mese' : 'Segna come verificato'}</button></div>`;
  const acc = accantonatoAnno(y), usate = usatoAnno('ORE RECUPERO', y), e4 = extra4Nov(y), cf = carryFerie(y), fr = residuoFerie(y + '-12-31');
  const bar = (l, u, maxH, note) => `<div class="f"><div class="row" style="border:0;padding:0"><span>${l}</span><b>${F(u)} / ${F(maxH * 60)}</b></div><div class="bar"><i style="width:${maxH ? Math.min(100, u / (maxH * 60) * 100) : 0}%"></i></div>${note ? `<small class="note">${note}</small>` : ''}</div>`;
  $('rieAnno').innerHTML = `<div class="h">Saldi ${y}</div>` + bar('Ferie usate (anno + riporto)', usatoAnno('FERIE', y), (FERIE_ANNO + cf) / 60, `Riporto dall'anno scorso ${F(cf)} (da usare entro il 30/06) · residuo a fine anno ${F(Math.max(0, fr))}`)
    + bar('Monte ore accantonato nell\'anno', acc, 40, bancaAbilitata(y) ? `Puoi ancora accantonare ${F(accantonabile(y))}` : 'Accantonamento non attivo: a fine anno scorso restavano più di 50h di ferie')
    + R('Saldo ore recupero (non scade)', F(Math.max(0, bancaRip(y) + acc - usate))) + R('Ore recupero usate', F(usate), usate > bancaRip(y) + acc)
    + bar('Ex-festività (si azzerano a fine anno)', usatoAnno('EX-FESTIVITÀ', y), 30) + (e4 ? bar('Ore 4 novembre (si azzerano)', usatoAnno('ORE 4 NOVEMBRE', y), 8) : R('Ore 4 novembre (extra)', 'non maturate'))
    + bar('Visite mediche (si azzerano)', usatoAnno('VISITA MEDICA', y), 30) + R('Smart working annuo', F(usatoAnno('SMART WORKING', y))) + R('Sciopero annuo', F(usatoAnno('SCIOPERO', y)));
  $('pzInfo').textContent = S.pz ? `Punto zero attivo dal ${S.pz.data.split('-').reverse().join('/')}.` : 'Nessun punto zero impostato.';
}
function toggleVer(ym) { if (S.ver[ym]) { if (!confirm('Sbloccare il mese per poterlo modificare?')) return; mut(() => delete S.ver[ym]); } else { if (!confirm(`Confermi che ${nomeMese(ym)} è stato verificato con la busta paga? Verrà bloccato in modifica.`)) return; mut(() => S.ver[ym] = true); } }
function apriReport(ym) {
  const m = datiMese(ym), g = Object.keys(m.gt).map(k => R(k, F(m.gt[k]))).join('') || '<div class="empty">Nessuno</div>', at = Object.keys(m.att).map(k => R(k, m.att[k] + ' giornate')).join('') || '<div class="empty">Nessuna attività registrata</div>';
  const ev = m.ev.map(e => { const t = tDay(e.data).length, sw = gDay(e.data).some(x => x.tipo === 'SMART WORKING'); return R(`${e.data.slice(8)}/${e.data.slice(5, 7)} ${e.ora || ''} ${e.titolo}${e.luogo ? ' · ' + e.luogo : ''}`, `${t ? 'in sede' : sw ? 'smart' : 'assente'}${e.fuori ? ' · fuori sede' : ''}`); }).join('') || '<div class="empty">Nessun impegno</div>';
  $('reportBody').innerHTML = `<h3>Report ${cap(nomeMese(ym))}</h3><div class="h">Ore e straordinari</div>${righeMese(m)}<div class="h" style="margin-top:12px">Giustificativi</div>${g}<div class="h" style="margin-top:12px">Attività svolte</div>${at}<div class="h" style="margin-top:12px">Agenda e presenza</div>${ev}<div class="h" style="margin-top:12px">Mancate timbrature</div>${m.mancate.map(t => R(t.data.split('-').reverse().join('/'), t.tipo + ' ' + t.ora)).join('') || '<div class="empty">Nessuna</div>'}`;
  $('modalReport').classList.add('active');
}
const reportTrigger = () => { const n = new Date(); return Math.min(30, ultimoMese(n.getFullYear(), n.getMonth() + 1)); };
function reportDovuto() { const n = new Date(); if (n.getDate() < reportTrigger()) return null; const p = new Date(n.getFullYear(), n.getMonth() - 1, 1), ym = ymStr(p.getFullYear(), p.getMonth() + 1); return S.ver[ym] ? null : ym; }

// ---------- Busta paga (confronto) ----------
const BF = [['bStr', 'Straordinario pagato', 'pag'], ['bBan', 'Straordinario in monte ore', 'ban'], ['bTk', 'Ticket', 'tk'], ['bRep', 'Ore reperibilità', 'rep']];
function caricaBusta() {
  const ym = ymStr(rie.y, rie.m), m = datiMese(ym), b = S.busta[ym] || {}, mine = { pag: m.pag, ban: m.ban, tk: m.tk, rep: m.repMin }; $('bNav').innerHTML = navHTML();
  $('bForm').innerHTML = BF.map(([id, l, k]) => `<div class="f"><label>${l} (da busta, ${k === 'tk' ? 'numero' : 'h:mm'})</label><input type="text" id="${id}" value="${b[k] || ''}"><small class="note">App: ${k === 'tk' ? mine[k] : F(mine[k])}</small></div>`).join('');
  const val = (k, s) => k === 'tk' ? +s : P(s); $('bEsito').innerHTML = BF.map(([id, l, k]) => { if (b[k] === undefined || b[k] === '') return ''; const d = val(k, b[k]) - mine[k]; return `<div class="row"><span>${l}</span><b style="color:var(--${d ? 'danger' : 'green'})">${d ? 'differenza ' + (k === 'tk' ? d : (d > 0 ? '+' : '−') + F(Math.abs(d))) : '✓ coincide'}</b></div>`; }).join('');
  $('bVer').textContent = S.ver[ym] ? 'Sblocca mese' : 'Segna mese come verificato';
}
function salvaBusta() { const ym = ymStr(rie.y, rie.m); mut(() => S.busta[ym] = Object.fromEntries(BF.map(([id, l, k]) => [k, $(id).value.trim()]))); }
const toggleVerBusta = () => toggleVer(ymStr(rie.y, rie.m));

// ---------- Agenda, reperibilità ----------
function caricaAgenda() {
  const ym = ymStr(rie.y, rie.m); $('agNav').innerHTML = navHTML(); const l = S.ev.filter(e => e.data.startsWith(ym)).sort((a, b) => (a.data + (a.ora || '')).localeCompare(b.data + (b.ora || ''))); let last = '';
  $('agList').innerHTML = l.length ? l.map(e => { const h = e.data !== last ? `<div class="h" style="margin-top:10px">${cap(D(e.data).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }))}</div>` : ''; last = e.data; return h + rowEv(e); }).join('') : '<div class="empty">Nessun impegno in questo mese</div>';
}
function caricaRep() {
  const ym = ymStr(rie.y, rie.m); $('rpNav').innerHTML = navHTML();
  $('rpList').innerHTML = [...S.rep].sort((a, b) => a.da.localeCompare(b.da)).map(r => `<div class="tl"><span class="nm">${r.da.split('-').reverse().join('/')} → ${r.a.split('-').reverse().join('/')}<br><small>promemoria il ${repReminderDay(r.da).split('-').reverse().join('/')}</small></span><button class="ib d" onclick="delRep('${r.da}')" aria-label="Elimina">${IC.bin}</button></div>`).join('') || '<div class="empty">Nessuna reperibilità</div>';
  $('rpOre').textContent = `Ore di uscita in reperibilità a ${nomeMese(ym)}: ${F(repMin(ym))}`;
}
function addRep() { const da = $('rpDa').value, a = $('rpA').value; if (!da || !a || a < da) return alert('Indica un periodo valido.'); mut(() => S.rep.push({ da, a })); }
const delRep = da => mut(() => S.rep = S.rep.filter(r => r.da !== da));
function repReminderDay(da) { const d = D(da); do d.setDate(d.getDate() - 1); while (!lavorativo(iso0(d))); return iso0(d); }

// ---------- Notifiche (attive con l'app aperta) ----------
const fired = () => JSON.parse(localStorage.getItem('cf_fired') || '{}');
function notifica(tit, corpo, k, dati) {
  if (k) { const f = fired(); if (f[k]) return; f[k] = 1; localStorage.setItem('cf_fired', JSON.stringify(f)); }
  toast(`${tit} — ${corpo}`);
  if ('Notification' in window && Notification.permission === 'granted' && navigator.serviceWorker) navigator.serviceWorker.ready.then(r => r.showNotification(tit, { body: corpo, icon: 'icon-192.png', tag: k || tit, data: dati || '' }));
}
function abilitaNotifiche() { if (!('Notification' in window)) return alert('Notifiche non supportate da questo browser.'); Notification.requestPermission().then(p => toast(p === 'granted' ? 'Notifiche attivate' : 'Notifiche non consentite')); $('drawer').classList.remove('open'); }
function controlli() {
  const n = new Date(), nm = n.getHours() * 60 + n.getMinutes(), iso = todayISO(), tG = tDay(iso), c = calcolaGiornata(iso, tG, gDay(iso), nm), f = fase(tG, isVen(iso));
  const at = (m, k, tit, msg) => { if (nm >= m && nm - m < 30) notifica(tit, msg, iso + k); };
  if (f === 'pausa') { const { mn, mx } = rientri(c); at(mn, 'rmin', 'Rientro minimo', 'Puoi rientrare dalla pausa'); at(mx, 'rmax', 'Rientro massimo', 'Rientra ora per uscire alle 17:15'); }
  if (f === 'pom') { at(P(c.uscitaTeorica), 'umin', 'Uscita minima', `Puoi uscire (${c.uscitaTeorica})`); const s0 = P(c.oraScatto30m); for (let k = 0; k < 12; k++) at(s0 + 15 * k, 's' + k, 'Straordinario', `Uscendo ora maturi +${30 + 15 * k} min`); }
  const ev = S.ev.filter(e => e.data === iso).sort((a, b) => (a.ora || '').localeCompare(b.ora || '')); if (nm >= 480 && ev.length) notifica('Agenda di oggi', ev.map(e => `${e.ora || ''} ${e.titolo}`).join(' · '), iso + 'ag');
  S.rep.forEach(r => { if (repReminderDay(r.da) === iso && nm >= 480) notifica('Reperibilità', `Dal ${r.da.split('-').reverse().join('/')} sei reperibile`, iso + 'rp' + r.da); });
  const rd = reportDovuto(); if (rd) notifica('Report mensile pronto', `Verifica ${nomeMese(rd)} con la busta paga`, 'rep' + rd + iso.slice(0, 7), '#report=' + rd);
}

// ---------- Punto zero, backup ----------
function apriPZ() { const p = S.pz || {}, h = k => p[k] ? F(p[k]).replace('h ', ':').replace('m', '') : ''; $('pzData').value = p.data || todayISO(); [['pzFerie', 'ferie'], ['pzFerieRip', 'ferieRip'], ['pzEx', 'ex'], ['pzVisite', 'visite'], ['pzNov4', 'nov4'], ['pzRec', 'rec'], ['pzBanca', 'banca'], ['pzBancaRip', 'bancaRip']].forEach(([id, k]) => $(id).value = h(k)); $('pzLav').checked = !!p.lavNov4; $('drawer').classList.remove('open'); $('modalPZ').classList.add('active'); }
function salvaPZ() { const v = id => P($(id).value.trim()) || 0; if (!$('pzData').value) return alert('Indica la data del punto zero.'); if (!confirm('Da questa data i contatori ripartono dai valori indicati; le registrazioni precedenti non verranno più conteggiate nei saldi. Confermi?')) return;
  mut(() => S.pz = { data: $('pzData').value, ferie: v('pzFerie'), ferieRip: v('pzFerieRip'), ex: v('pzEx'), visite: v('pzVisite'), nov4: v('pzNov4'), rec: v('pzRec'), banca: v('pzBanca'), bancaRip: v('pzBancaRip'), lavNov4: $('pzLav').checked }); chiudiModal('modalPZ'); }
const rimuoviPZ = () => { mut(() => S.pz = null); chiudiModal('modalPZ'); };
const apriSync = () => { $('drawer').classList.remove('open'); $('modalSync').classList.add('active'); };
function esportaDati() { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify({ versione: 4, S }, null, 2)], { type: 'application/json' })); a.download = `backup_cronoflex_${todayISO()}.json`; a.click(); }
function importaDati() {
  const f = $('fileImport').files[0]; if (!f) return alert('Seleziona un file di backup.'); const rd = new FileReader();
  rd.onload = e => { try { const d = JSON.parse(e.target.result); const n = d.S || { t: d.timbrature, g: d.giustificativi, d: d.destinazioni || {}, pz: d.puntoZero || null }; if (!n.t || !n.g) return alert('File di backup non valido.'); mut(() => S = Object.assign(VUOTO(), n)); chiudiModal('modalSync'); } catch (err) { alert('Errore: ' + err.message); } };
  rd.readAsText(f);
}
async function forzaAggiornamento() { try { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); } catch (e) {} location.replace('index.html?v=' + Date.now()); }

if ('serviceWorker' in navigator) {
  const aveva = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(r => r.update()).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (aveva && !window._ric) { window._ric = 1; location.reload(); } });
  navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.open) location.hash = e.data.open, apriDaHash(); });
}
function apriDaHash() { const m = /report=(\d{4}-\d{2})/.exec(location.hash); if (m) { rie.y = +m[1].slice(0, 4); rie.m = +m[1].slice(5); apriReport(m[1]); } }
window.onload = () => {
  load(); pagina('oggi'); apriDaHash(); const hv = document.documentElement.dataset.ver, ok = hv === APP_VERSION;
  $('ver').textContent = ok ? `Cronoflex v${APP_VERSION} · by arch. Lonardo Massimo` : `File non allineati (pagina ${hv}, logica ${APP_VERSION}): usa "Forza aggiornamento" dal menu`; $('ver').style.color = ok ? 'var(--muted)' : 'var(--danger)';
  controlli(); setInterval(() => { controlli(); if (pagina.cur === 'oggi') aggiornaSchermataOggi(); }, 30000);
};
