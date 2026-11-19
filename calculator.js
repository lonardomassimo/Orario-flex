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

// Calcolo deterministico della singola giornata
function calcolaGiornata(dataStr, timbratureGiorno, giustificativiGiorno) {
  // dataStr = YYYY-MM-DD
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

  // 4. Pausa Effettiva
  const hasStraordPausa = giustificativiGiorno.some(g => g.tipo === 'STRAORDINARIO PAUSA');
  const hasPausaNonTimbrata = giustificativiGiorno.some(g => g.tipo === 'PAUSA NON TIMBRATA');

  let pausaEffettivaMin = 0;
  let pausaConvertitaStraordMin = 0;

  if (isVenerdi) {
    pausaEffettivaMin = 0;
  } else {
    if (inizioPausaMin !== null && finePausaNormMin !== null) {
      const durataTimbrata = Math.max(0, finePausaNormMin - inizioPausaMin);
      pausaEffettivaMin = Math.max(PARAMETRI.pausaMinimaMinuti, durataTimbrata);
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
        attenzioni.push('Pausa non timbrata: dedotti 30 min d’ufficio');
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

  // 6. Uscita Teorica Minima
  let uscitaTeoricaMin = null;
  if (entrataNormMin !== null) {
    const baseCalcolo = Math.min(9 * 60, entrataNormMin);
    const minutiNecessari = baseCalcolo + Math.max(0, oreDovute - oreGiustificateMin) + pausaEffettivaMin;

    if (isVenerdi) {
      uscitaTeoricaMin = entrataNormMin + Math.max(0, oreDovute - oreGiustificateMin);
    } else {
      uscitaTeoricaMin = Math.max(PARAMETRI.uscitaMinimaLunGio, minutiNecessari);
    }
  }

  // 7. Ore Lavorate Effettive
  let oreLavorateMin = 0;
  if (entrataNormMin !== null && ultimaUscitaMin !== null) {
    const lordo = Math.max(0, ultimaUscitaMin - entrataNormMin);
    oreLavorateMin = Math.max(0, lordo - pausaEffettivaMin);
  } else if (entrataNormMin !== null && ultimaUscitaMin === null) {
    attenzioni.push('Uscita mancante');
  }

  const oreTotaliSvolteMin = oreLavorateMin + oreGiustificateMin;

  // 8. Straordinario
  const ritardoTotaleMin = ritardoIngressoMin + ritardoPausaMin;
  const eccedenzaGrezzaMin = Math.max(0, oreTotaliSvolteMin - oreDovute) + pausaConvertitaStraordMin;
  const eccedenzaNettaMin = Math.max(0, eccedenzaGrezzaMin - ritardoTotaleMin);

  let straordinarioNettoMin = 0;
  if (eccedenzaNettaMin >= PARAMETRI.scattoMinimoStraordinario) {
    straordinarioNettoMin = Math.floor(eccedenzaNettaMin / PARAMETRI.scattoSuccessivoStraordinario) * PARAMETRI.scattoSuccessivoStraordinario;
  }

  if (ritardoTotaleMin > 0) {
    if (eccedenzaGrezzaMin >= ritardoTotaleMin) {
      attenzioni.push(`Ritardo compensato (${ritardoTotaleMin} min)`);
    } else {
      attenzioni.push(`Ritardo non compensato interamente (${ritardoTotaleMin - eccedenzaGrezzaMin} min scoperti)`);
    }
  }

  // 9. Ticket Restaurant
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
    inizioPausa: formatMinutesToTime(inizioPausaMin),
    finePausa: formatMinutesToTime(finePausaNormMin),
    ultimaUscita: formatMinutesToTime(ultimaUscitaMin),
    pausaEffettivaMin,
    oreLavorateMin,
    oreGiustificateMin,
    oreTotaliSvolteMin,
    straordinarioNettoMin,
    ticket,
    attenzioni
  };
}
