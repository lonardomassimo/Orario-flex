/**
 * Logica Applicativa e Storage Locale (IndexedDB / LocalStorage)
 */

const STORAGE_KEY_TIMBRATURE = 'orario_flex_timbrature';
const STORAGE_KEY_GIUSTIFICATIVI = 'orario_flex_giustificativi';

let timbrature = [];
let giustificativi = [];
// All'avvio si posiziona sempre sulla giornata di oggi
let currentDate = new Date();

// Inizializzazione dati
function initStorage() {
  const localTimb = localStorage.getItem(STORAGE_KEY_TIMBRATURE);
  const localGiust = localStorage.getItem(STORAGE_KEY_GIUSTIFICATIVI);

  if (!localTimb && window.SEED_TIMBRATURE) {
    timbrature = window.SEED_TIMBRATURE.map(t => ({
      data: formatExcelDate(t.data),
      ora: t.ora,
      tipo: t.tipo,
      fittizia: t.fittizia,
      autorizzata: t.autorizzata
    }));
    salvaDati();
  } else if (localTimb) {
    timbrature = JSON.parse(localTimb);
  }

  if (!localGiust && window.SEED_GIUSTIFICATIVI) {
    giustificativi = window.SEED_GIUSTIFICATIVI.map(g => ({
      data: formatExcelDate(g.data),
      tipo: g.tipo,
      oraInizio: g.oraInizio,
      oraFine: g.oraFine,
      durata: g.durata,
      tragittoPrima: g.tragittoPrima,
      tragittoDopo: g.tragittoDopo
    }));
    salvaDati();
  } else if (localGiust) {
    giustificativi = JSON.parse(localGiust);
  }
}

// Converte "lunedì 2 marzo 2026" in "2026-03-02"
function formatExcelDate(str) {
  if (!str) return '';
  if (str.includes('-')) return str;
  const mesi = {
    'gennaio': '01', 'febbraio': '02', 'marzo': '03', 'aprile': '04',
    'maggio': '05', 'giugno': '06', 'luglio': '07', 'agosto': '08',
    'settembre': '09', 'ottobre': '10', 'novembre': '11', 'dicembre': '12'
  };
  const parts = str.toLowerCase().split(' ');
  if (parts.length >= 4) {
    const day = parts[1].padStart(2, '0');
    const month = mesi[parts[2]] || '01';
    const year = parts[3];
    return `${year}-${month}-${day}`;
  }
  return str;
}

function formatDateISO(d) {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDateHuman(d) {
  const opts = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  const str = d.toLocaleDateString('it-IT', opts);
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function salvaDati() {
  localStorage.setItem(STORAGE_KEY_TIMBRATURE, JSON.stringify(timbrature));
  localStorage.setItem(STORAGE_KEY_GIUSTIFICATIVI, JSON.stringify(giustificativi));
}

function aggiornaSchermataOggi() {
  const isoStr = formatDateISO(currentDate);
  document.getElementById('currentDateLabel').textContent = formatDateHuman(currentDate);

  const timbGiorno = timbrature.filter(t => t.data === isoStr);
  const giustGiorno = giustificativi.filter(g => g.data === isoStr);

  const calcolo = calcolaGiornata(isoStr, timbGiorno, giustGiorno);

  document.getElementById('heroUscita').textContent = calcolo.uscitaTeorica;
  document.getElementById('heroSub').textContent = (calcolo.entrataNorm !== '--:--')
    ? `Entrata normalizzata: ${calcolo.entrataNorm}`
    : `In attesa di timbratura d'entrata`;

  document.getElementById('statOreSvolte').textContent = formatMinutesToHoursMins(calcolo.oreTotaliSvolteMin);
  document.getElementById('statPausa').textContent = `${calcolo.pausaEffettivaMin} min`;
  document.getElementById('statStraord').textContent = `${calcolo.straordinarioNettoMin} min`;

  // Avvisi
  const alertContainer = document.getElementById('alertContainer');
  alertContainer.innerHTML = '';
  if (calcolo.attenzioni && calcolo.attenzioni.length > 0) {
    const box = document.createElement('div');
    box.className = 'alert-box';
    box.innerHTML = '<strong>⚠️ Attenzioni del giorno:</strong>' +
      calcolo.attenzioni.map(a => `<div class="alert-item">• ${a}</div>`).join('');
    alertContainer.appendChild(box);
  }

  // Render timeline con pulsanti di cancellazione
  renderTimeline(timbGiorno, giustGiorno);
}

function renderTimeline(timbGiorno, giustGiorno) {
  const tl = document.getElementById('timelineList');
  tl.innerHTML = '';

  if (timbGiorno.length === 0 && giustGiorno.length === 0) {
    tl.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem;">Nessuna timbratura o permesso registrato</div>';
    return;
  }

  timbGiorno.forEach((t) => {
    const globalIdx = timbrature.indexOf(t);
    const item = document.createElement('div');
    item.className = 'timeline-item';
    item.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <button onclick="eliminaTimbratura(${globalIdx})" style="background: rgba(239, 68, 68, 0.2); border: 1px solid var(--danger); color: var(--danger); font-size: 0.75rem; border-radius: 4px; padding: 2px 6px; cursor: pointer;" title="Elimina passaggio">🗑️ Elimina</button>
        <span>🕒 Timbratura <strong>${t.tipo}</strong></span>
      </div>
      <span style="font-weight: 600;">${t.ora}</span>
    `;
    tl.appendChild(item);
  });

  giustGiorno.forEach((g) => {
    const globalIdx = giustificativi.indexOf(g);
    const item = document.createElement('div');
    item.className = 'timeline-item';
    item.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <button onclick="eliminaGiustificativo(${globalIdx})" style="background: rgba(239, 68, 68, 0.2); border: 1px solid var(--danger); color: var(--danger); font-size: 0.75rem; border-radius: 4px; padding: 2px 6px; cursor: pointer;" title="Elimina giustificativo">🗑️ Elimina</button>
        <span>📋 Giustificativo <strong>${g.tipo}</strong></span>
      </div>
      <span style="font-weight: 600;">${g.durata || (g.oraInizio + '-' + g.oraFine)}</span>
    `;
    tl.appendChild(item);
  });
}

function eliminaTimbratura(index) {
  if (index >= 0 && index < timbrature.length) {
    const rimosso = timbrature[index];
    if (confirm(`Vuoi davvero eliminare la timbratura ${rimosso.tipo} delle ore ${rimosso.ora}?`)) {
      timbrature.splice(index, 1);
      salvaDati();
      aggiornaSchermataOggi();
    }
  }
}

function eliminaGiustificativo(index) {
  if (index >= 0 && index < giustificativi.length) {
    const rimosso = giustificativi[index];
    if (confirm(`Vuoi davvero eliminare il giustificativo ${rimosso.tipo}?`)) {
      giustificativi.splice(index, 1);
      salvaDati();
      aggiornaSchermataOggi();
    }
  }
}

function cambiaGiorno(delta) {
  currentDate.setDate(currentDate.getDate() + delta);
  aggiornaSchermataOggi();
}

function vaiAOggi() {
  currentDate = new Date();
  aggiornaSchermataOggi();
}

function switchTab(tabId) {
  document.getElementById('tab-oggi').style.display = (tabId === 'tab-oggi') ? 'block' : 'none';
  document.getElementById('tab-storico').style.display = (tabId === 'tab-storico') ? 'block' : 'none';
  document.getElementById('tab-riepilogo').style.display = (tabId === 'tab-riepilogo') ? 'block' : 'none';

  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
  event.target.classList.add('active');

  if (tabId === 'tab-storico') caricaStorico();
}

function quickTimbra(tipo) {
  const now = new Date();
  const h = now.getHours().toString().padStart(2, '0');
  const m = now.getMinutes().toString().padStart(2, '0');
  const oraStr = `${h}:${m}`;
  const dataStr = formatDateISO(currentDate);

  timbrature.push({
    data: dataStr,
    ora: oraStr,
    tipo: tipo,
    fittizia: false,
    autorizzata: false
  });

  salvaDati();
  aggiornaSchermataOggi();
}

function apriDialogGiustificativo() {
  document.getElementById('modalGiust').classList.add('active');
}

function apriDialogTimbraturaManuale() {
  const now = new Date();
  document.getElementById('oraTimbManuale').value = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  document.getElementById('modalTimb').classList.add('active');
}

function chiudiModal(id) {
  document.getElementById(id).classList.remove('active');
}

function aggiornaFormGiust() {
  const val = document.getElementById('selTipoGiust').value;
  document.getElementById('visitaFields').style.display = (val === 'VISITA MEDICA') ? 'block' : 'none';
  document.getElementById('durataFields').style.display = (['FERIE', 'EX-FESTIVITÀ', 'ORE RECUPERO'].includes(val)) ? 'block' : 'none';
}

function salvaGiustificativo() {
  const tipo = document.getElementById('selTipoGiust').value;
  const dataStr = formatDateISO(currentDate);

  const nuovo = {
    data: dataStr,
    tipo: tipo
  };

  if (tipo === 'VISITA MEDICA') {
    nuovo.oraInizio = document.getElementById('visitaInizio').value;
    nuovo.oraFine = document.getElementById('visitaFine').value;
    nuovo.tragittoPrima = document.getElementById('chkTragittoPrima').checked ? '0:30' : '0:00';
    nuovo.tragittoDopo = document.getElementById('chkTragittoDopo').checked ? '0:30' : '0:00';
  } else if (['FERIE', 'EX-FESTIVITÀ', 'ORE RECUPERO'].includes(tipo)) {
    nuovo.durata = document.getElementById('durataManuale').value || '1:00';
  } else if (tipo === 'STRAORDINARIO PAUSA' || tipo === 'PAUSA NON TIMBRATA') {
    nuovo.durata = '0:30';
  }

  giustificativi.push(nuovo);
  salvaDati();
  chiudiModal('modalGiust');
  aggiornaSchermataOggi();
}

function salvaTimbraturaManuale() {
  const tipo = document.getElementById('selTipoTimb').value;
  const ora = document.getElementById('oraTimbManuale').value;
  if (!ora) return;

  timbrature.push({
    data: formatDateISO(currentDate),
    ora: ora,
    tipo: tipo,
    fittizia: false,
    autorizzata: false
  });

  salvaDati();
  chiudiModal('modalTimb');
  aggiornaSchermataOggi();
}

function caricaStorico() {
  const container = document.getElementById('storicoList');
  container.innerHTML = '';

  const dateUniche = [...new Set(timbrature.map(t => t.data))].sort().reverse().slice(0, 30);

  dateUniche.forEach(dataStr => {
    const tGiorno = timbrature.filter(t => t.data === dataStr);
    const gGiorno = giustificativi.filter(g => g.data === dataStr);
    const res = calcolaGiornata(dataStr, tGiorno, gGiorno);

    const card = document.createElement('div');
    card.style.cssText = 'padding: 10px 0; border-bottom: 1px solid var(--card-border); display: flex; justify-content: space-between; align-items: center; cursor: pointer;';
    card.innerHTML = `
      <div>
        <div style="font-weight: 600; font-size: 0.95rem;">${dataStr}</div>
        <div style="font-size: 0.75rem; color: var(--text-muted);">
          E: ${res.entrataNorm} | U: ${res.ultimaUscita} | Svolte: ${formatMinutesToHoursMins(res.oreTotaliSvolteMin)}
        </div>
      </div>
      <div style="text-align: right;">
        <span style="font-size: 0.85rem; font-weight: bold; color: ${res.straordinarioNettoMin > 0 ? 'var(--accent)' : 'inherit'};">
          ${res.straordinarioNettoMin > 0 ? '+' + res.straordinarioNettoMin + 'm' : 'OK'}
        </span>
      </div>
    `;
    card.onclick = () => {
      currentDate = new Date(dataStr + 'T12:00:00');
      switchTab('tab-oggi');
      aggiornaSchermataOggi();
    };
    container.appendChild(card);
  });
}

// Backup & Restore
document.getElementById('btnSync').onclick = () => {
  document.getElementById('modalSync').classList.add('active');
};

function esportaDati() {
  const backup = {
    versione: 1,
    dataExport: new Date().toISOString(),
    timbrature,
    giustificativi
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `backup_orario_flex_${formatDateISO(new Date())}.json`;
  a.click();
}

function importaDati() {
  const fileInput = document.getElementById('fileImport');
  if (!fileInput.files || fileInput.files.length === 0) {
    alert('Seleziona un file di backup prima.');
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.timbrature && data.giustificativi) {
        timbrature = data.timbrature;
        giustificativi = data.giustificativi;
        salvaDati();
        alert('Dati ripristinati con successo!');
        chiudiModal('modalSync');
        aggiornaSchermataOggi();
      } else {
        alert('File di backup non valido.');
      }
    } catch (err) {
      alert('Errore nella lettura del file: ' + err.message);
    }
  };
  reader.readAsText(fileInput.files[0]);
}

// Service Worker per PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

window.onload = () => {
  initStorage();
  aggiornaSchermataOggi();
};
