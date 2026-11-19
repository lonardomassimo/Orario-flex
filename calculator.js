/**
 * Motore di Calcolo Orario Flex — Implementazione JavaScript pura
 */

const PARAMETRI = {
  fasciaIngressoInizio: 8 * 60,      // 08:00 (480 min)
  fasciaIngressoFine: 9 * 60,        // 09:00 (540 min)
  pausaMinimaMinuti: 30,
  pausaFineFinestra: 14 * 60 + 15,   // 14:15 (855 min)
  uscitaMinimaLunGio: 17 * 60 + 15,  // 17:15 (1035 min)
  oreTeoricheLunGio: 8 * 60,         // 480 min
  oreTeoricheVenerdi: 6 * 60,        // 360 min
  scattoMinimoStraordinario: 30,
  scattoSuccessivoStraordinario: 15,
  tettoBancaOre: 40 * 60             // 2400 min
};

function parseTimeToMinutes(str) {
  if (!str) return null;
  const parts = str.trim().split(':');
  if (parts.length < 2) return null;
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

function formatMinutesToTime(min) {
  if (min === null || min === undefined || isNaN(min)) return '--:--';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function formatMinutesToHoursMins(min) {
  if (!min || isNaN(min)) return '0h 00m';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

// Calcolo deterministico della singola giornata con scenari di mattina, pomeriggio e live tracking
function calcolaGiornata(dataStr, timbratureGiorno, giustificativiGiorno, nowMinutes = null) {
  const dateObj = new Date(dataStr + 'T12:00:00');
  const dayOfWeek = dateObj.getDay(); // 0=Dom, 1=Lun, ..., 5=Ven, 6=Sab
  const isVenerdi = (dayOfWeek === 5);
  const oreDovute = isVenerdi ? PARAMETRI.oreTeoricheVenerdi : PARAMETRI.oreTeoricheLunGio;

  const attenzioni = [];

  // 1. Estrazione passaggi
  const timbEntrate = timbratureGiorno.filter(t => t.tipo === 'E').sort((a,b) => parseTimeToMinutes(a.ora) - parseTimeToMinutes(b.ora));
  const primaEntrata = timbEntrate.length > 0 ? timbEntrate[0] : null;

  const timbPausaOut = timbratureGiorno.filter(t => t.tipo === 'U PAUSA').sort((a,b) => parseTimeToMinutes(a.ora) - parseTimeToMinutes(b.ora));
  const inizioPausaMin = timbPausaOut.length > 0 ? parseTimeToMinutes(timbPausaOut[0].ora) : null;

  const timbPausaIn = timbratureGiorno.filter(t => t.tipo === 'E PAUSA').sort((a,b) => parseTimeToMinutes(a.ora) - parseTimeToMinutes(b.ora));
  const finePausaMin = timbPausaIn.length > 0 ? parseTimeToMinutes(timbPausaIn[0].ora) : null;

  const timbUscite = timbratureGiorno.filter(t => t.tipo === 'U').sort((a,b) => parseTimeToMinutes(b.ora) - parseTimeToMinutes(a.ora));
  const ultimaUscitaMin = timbUscite.length > 0 ? parseTimeToMinutes(timbUscite[0].ora) : null;

  if (timbratureGiorno.some(t => t.fittizia)) {
    attenzioni.push('Timbrature fittizie presenti');
  }

  // 2. Normalizzazione Entrata
  let entrataNormMin = null;
  let ritardoIngressoMin = 0;

  if (primaEntrata) {
    const minEnt = parseTimeToMinutes(primaEntrata.ora);
    if (minEnt < PARAMETRI.fasciaIngressoInizio) {
      if (primaEntrata.autorizzata) {
        entrataNormMin = Math.ceil(minEnt / 15) * 15;
      } else {
        entrataNormMin = PARAMETRI.fasciaIngressoInizio;
      }
    } else if (minEnt <= PARAMETRI.fasciaIngressoFine) {
      entrataNormMin = minEnt;
    } else {
      const ritGrezzo = minEnt - PARAMETRI.fasciaIngressoFine;
      ritardoIngressoMin = Math.ceil(ritGrezzo / 15) * 15;
      entrataNormMin = PARAMETRI.fasciaIngressoFine + ritardoIngressoMin;
    }
  }

  // 3. Normalizzazione Fine Pausa
  let finePausaNormMin = finePausaMin;
  let ritardoPausaMin = 0;
  if (finePausaMin !== null) {
    if (finePausaMin > PARAMETRI.pausaFineFinestra) {
      const ritPausaGrezzo = finePausaMin - PARAMETRI.pausaFineFinestra;
      ritardoPausaMin = Math.ceil(ritPausaGrezzo / 15) * 15;
      finePausaNormMin = PARAMETRI.pausaFineFinestra + ritardoPausaMin;
    }
  }

  // 4. Pausa Effettiva / In corso
  const hasStraordPausa = giustificativiGiorno.some(g => g.tipo === 'STRAORDINARIO PAUSA');
  const hasPausaNonTimbrata = giustificativiGiorno.some(g => g.tipo === 'PAUSA NON TIMBRATA');

  let pausaEffettivaMin = 0;
  let pausaConvertitaStraordMin = 0;
  let isPausaInCorso = false;

  if (isVenerdi) {
    pausaEffettivaMin = 0;
  } else {
    if (inizioPausaMin !== null && finePausaNormMin !== null) {
      const durataTimbrata = Math.max(0, finePausaNormMin - inizioPausaMin);
      pausaEffettivaMin = Math.max(PARAMETRI.pausaMinimaMinuti, durataTimbrata);
    } else if (inizioPausaMin !== null && finePausaNormMin === null) {
      isPausaInCorso = true;
      const tempoInPausa = (nowMinutes !== null) ? Math.max(0, nowMinutes - inizioPausaMin) : PARAMETRI.pausaMinimaMinuti;
      pausaEffettivaMin = Math.max(PARAMETRI.pausaMinimaMinuti, tempoInPausa);
    } else {
      if (hasStraordPausa) {
        pausaEffettivaMin = 0;
        pausaConvertitaStraordMin = PARAMETRI.pausaMinimaMinuti;
        attenzioni.push('Pausa convertita in straordinario (autorizzata)');
      } else if (hasPausaNonTimbrata) {
        pausaEffettivaMin = PARAMETRI.pausaMinimaMinuti;
        attenzioni.push('Pausa non timbrata registrata a permesso');
      } else {
        pausaEffettivaMin = PARAMETRI.pausaMinimaMinuti;
        if (ultimaUscitaMin !== null) {
          attenzioni.push('Pausa non timbrata: dedotti 30 min d’ufficio');
        }
      }
    }
  }

  // 5. Giustificativi
  let oreGiustificateMin = 0;
  giustificativiGiorno.forEach(g => {
    if (g.tipo !== 'STRAORDINARIO PAUSA' && g.tipo !== 'PAUSA NON TIMBRATA') {
      let dur = 0;
      if (g.durata) {
        dur = parseTimeToMinutes(g.durata) || 0;
      } else if (g.oraInizio && g.oraFine) {
        dur = Math.max(0, parseTimeToMinutes(g.oraFine) - parseTimeToMinutes(g.oraInizio));
      }
      const tPrima = parseTimeToMinutes(g.tragittoPrima) || 0;
      const tDopo = parseTimeToMinutes(g.tragittoDopo) || 0;
      oreGiustificateMin += (dur + tPrima + tDopo);
    }
  });

  // 6. SCENARI MATTUTINI E STRATEGIE DI USCITA
  let uscitaTeoricaMin = null;
  let pausaMassimaPerUscitaMinima = null;
  let orarioFine8hConPausaMin = null;
  let anticipoRispettoPalettoMin = 0;

  // Scenari di Straordinario
  let oraScatto30m = null;
  let oraScatto45m = null;
  let oraScatto60m = null;

  if (entrataNormMin !== null) {
    const baseCalcolo = Math.min(9 * 60, entrataNormMin);
    const oreLavoroNecessarie = Math.max(0, oreDovute - oreGiustificateMin);

    if (isVenerdi) {
      uscitaTeoricaMin = entrataNormMin + oreLavoroNecessarie;
      oraScatto30m = uscitaTeoricaMin + 30;
      oraScatto45m = uscitaTeoricaMin + 45;
      oraScatto60m = uscitaTeoricaMin + 60;
    } else {
      // Lun-Gio: Uscita minima consentita = max(17:15, Entrata + Ore + Pausa)
      orarioFine8hConPausaMin = baseCalcolo + oreLavoroNecessarie + PARAMETRI.pausaMinimaMinuti;
      
      // Calcolo Pausa Massima per uscire all'orario minimo (17:15)
      const pausaPossibileGrezza = PARAMETRI.uscitaMinimaLunGio - (baseCalcolo + oreLavoroNecessarie);
      pausaMassimaPerUscitaMinima = Math.max(PARAMETRI.pausaMinimaMinuti, pausaPossibileGrezza);

      const orarioCompletamentoEffettivo = baseCalcolo + oreLavoroNecessarie + pausaEffettivaMin;
      uscitaTeoricaMin = Math.max(PARAMETRI.uscitaMinimaLunGio, orarioCompletamentoEffettivo);

      // Se orario completamento effettivo è prima delle 17:15
      if (orarioCompletamentoEffettivo < PARAMETRI.uscitaMinimaLunGio) {
        anticipoRispettoPalettoMin = PARAMETRI.uscitaMinimaLunGio - orarioCompletamentoEffettivo;
      }

      // Orario di maturazione straordinari:
      // Lo straordinario scatta a +30 min dal completamento del debito ore (orarioCompletamentoEffettivo)
      // ma NON prima delle 17:15!
      oraScatto30m = Math.max(PARAMETRI.uscitaMinimaLunGio, orarioCompletamentoEffettivo + 30);
      oraScatto45m = Math.max(PARAMETRI.uscitaMinimaLunGio + 15, orarioCompletamentoEffettivo + 45);
      oraScatto60m = Math.max(PARAMETRI.uscitaMinimaLunGio + 30, orarioCompletamentoEffettivo + 60);
    }
  }

  // 7. Ore Lavorate Effettive (LIVE vs CONGELATE)
  let oreLavorateMin = 0;
  let isLive = false;

  const fineConteggioMin = (ultimaUscitaMin !== null) 
    ? ultimaUscitaMin 
    : (nowMinutes !== null ? nowMinutes : null);

  if (entrataNormMin !== null && fineConteggioMin !== null) {
    if (ultimaUscitaMin === null) {
      isLive = true;
    }
    const lordo = Math.max(0, fineConteggioMin - entrataNormMin);
    oreLavorateMin = Math.max(0, lordo - pausaEffettivaMin);
  } else if (entrataNormMin !== null && ultimaUscitaMin === null && nowMinutes === null) {
    attenzioni.push('Uscita mancante');
  }

  const oreTotaliSvolteMin = oreLavorateMin + oreGiustificateMin;

  // 8. MONITORAGGIO LIVE POMERIGGIO: QUANTO SONO ANDATO OLTRE & PROSSIMO SCATTO
  const ritardoTotaleMin = ritardoIngressoMin + ritardoPausaMin;
  const eccedenzaGrezzaMin = Math.max(0, oreTotaliSvolteMin - oreDovute) + pausaConvertitaStraordMin;
  const eccedenzaNettaMin = Math.max(0, eccedenzaGrezzaMin - ritardoTotaleMin);

  let straordinarioNettoMin = 0;
  if (eccedenzaNettaMin >= PARAMETRI.scattoMinimoStraordinario) {
    straordinarioNettoMin = Math.floor(eccedenzaNettaMin / PARAMETRI.scattoSuccessivoStraordinario) * PARAMETRI.scattoSuccessivoStraordinario;
  }

  // Minuti oltre l'orario e calcolo prossimo scatto di 15 min
  let minutiOltreOrario = eccedenzaNettaMin;
  let minutiAlProssimoScatto = 0;
  let orarioProssimoScatto = null;
  let valoreProssimoScatto = 0;

  if (nowMinutes !== null && entrataNormMin !== null && ultimaUscitaMin === null) {
    if (eccedenzaNettaMin < 30) {
      // Non ha ancora raggiunto lo scatto minimo di 30m
      minutiAlProssimoScatto = 30 - eccedenzaNettaMin;
      valoreProssimoScatto = 30;
      orarioProssimoScatto = nowMinutes + minutiAlProssimoScatto;
    } else {
      // È già a 30m o più: calcola i minuti mancanti al prossimo blocco da 15m
      const residuoScatto = eccedenzaNettaMin % 15;
      minutiAlProssimoScatto = (residuoScatto === 0) ? 15 : (15 - residuoScatto);
      valoreProssimoScatto = straordinarioNettoMin + 15;
      orarioProssimoScatto = nowMinutes + minutiAlProssimoScatto;
    }
  }

  if (ritardoTotaleMin > 0) {
    if (eccedenzaGrezzaMin >= ritardoTotaleMin) {
      attenzioni.push(`Ritardo compensato (${ritardoTotaleMin} min)`);
    } else {
      attenzioni.push(`Ritardo non compensato (${ritardoTotaleMin - eccedenzaGrezzaMin} min scoperti)`);
    }
  }

  const ticket = (oreLavorateMin >= 4 * 60);

  if (ultimaUscitaMin !== null && oreTotaliSvolteMin < oreDovute) {
    const gap = oreDovute - oreTotaliSvolteMin;
    attenzioni.push(`Ore mancanti: ${Math.floor(gap / 60)}h ${(gap % 60).toString().padStart(2, '0')}m`);
  }

  return {
    dataStr,
    oreDovute,
    entrataNorm: formatMinutesToTime(entrataNormMin),
    uscitaTeorica: formatMinutesToTime(uscitaTeoricaMin),
    pausaMassimaPerUscitaMinima: formatMinutesToTime(pausaMassimaPerUscitaMinima),
    anticipoRispettoPalettoMin,
    oraScatto30m: formatMinutesToTime(oraScatto30m),
    oraScatto45m: formatMinutesToTime(oraScatto45m),
    oraScatto60m: formatMinutesToTime(oraScatto60m),
    inizioPausa: formatMinutesToTime(inizioPausaMin),
    finePausa: formatMinutesToTime(finePausaNormMin),
    ultimaUscita: formatMinutesToTime(ultimaUscitaMin),
    pausaEffettivaMin,
    oreLavorateMin,
    oreGiustificateMin,
    oreTotaliSvolteMin,
    straordinarioNettoMin,
    minutiOltreOrario,
    minutiAlProssimoScatto,
    orarioProssimoScatto: formatMinutesToTime(orarioProssimoScatto),
    valoreProssimoScatto,
    ticket,
    isLive,
    isPausaInCorso,
    attenzioni
  };
}
