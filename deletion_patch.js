// Timeline passaggi con pulsante Elimina
function renderTimeline(timbGiorno, giustGiorno) {
  const tl = document.getElementById('timelineList');
  tl.innerHTML = '';
  
  if (timbGiorno.length === 0 && giustGiorno.length === 0) {
    tl.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem;">Nessuna timbratura o permesso registrato</div>';
    return;
  }

  // Lista Timbrature del giorno
  timbGiorno.forEach((t) => {
    // Troviamo l'indice globale
    const globalIdx = timbrature.findIndex(item => item === t);
    const item = document.createElement('div');
    item.className = 'timeline-item';
    item.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <button onclick="eliminaTimbratura(${globalIdx})" style="background: none; border: none; color: var(--danger); font-size: 1.1rem; cursor: pointer; padding: 0 4px;" title="Elimina passaggio">❌</button>
        <span>🕒 Timbratura <strong>${t.tipo}</strong></span>
      </div>
      <span style="font-weight: 600;">${t.ora}</span>
    `;
    tl.appendChild(item);
  });

  // Lista Giustificativi del giorno
  giustGiorno.forEach((g) => {
    const globalIdx = giustificativi.findIndex(item => item === g);
    const item = document.createElement('div');
    item.className = 'timeline-item';
    item.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <button onclick="eliminaGiustificativo(${globalIdx})" style="background: none; border: none; color: var(--danger); font-size: 1.1rem; cursor: pointer; padding: 0 4px;" title="Elimina giustificativo">❌</button>
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
    if (confirm(`Confermi di voler eliminare la timbratura ${rimosso.tipo} delle ${rimosso.ora}?`)) {
      timbrature.splice(index, 1);
      salvaDati();
      aggiornaSchermataOggi();
    }
  }
}

function eliminaGiustificativo(index) {
  if (index >= 0 && index < giustificativi.length) {
    const rimosso = giustificativi[index];
    if (confirm(`Confermi di voler eliminare il giustificativo ${rimosso.tipo}?`)) {
      giustificativi.splice(index, 1);
      salvaDati();
      aggiornaSchermataOggi();
    }
  }
}
