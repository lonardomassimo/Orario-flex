/**
 * Motore di Calcolo Orario Flex — Implementazione JavaScript pura
 */

let PARAMETRI = {
  fasciaIngressoInizio: 8 * 60,      // 08:00 (480 min)
  fasciaIngressoFine: 9 * 60,        // 09:00 (540 min)
  pausaInizioFinestra: 12 * 60 + 15, // 12:15 (735 min)
  pausaMinimaMinuti: 30,
  pausaFineFinestra: 14 * 60 + 15,   // 14:15 (855 min)
  uscitaMinimaLunGio: 17 * 60 + 15,  // 17:15 (1035 min)
  oreTeoricheLunGio: 8 * 60,         // 480 min
  oreTeoricheVenerdi: 6 * 60,        // 360 min
  scattoMinimoStraordinario: 30,
  scattoSuccessivoStraordinario: 15,
  tettoBancaOre: 40 * 60,            // 2400 min
  santoPatrono: '06-24',             // S. Giovanni (Busto Arsizio), personalizzabile ('' = nessuno)
  festiviExtra: ''                   // altri festivi ricorrenti 'MM-DD' separati da virgola
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

// Calcolo deterministico della singola giornata con fasce orarie giustificativi e calcolo scoperti
function calcolaGiornata(dataStr, timbratureGiorno, giustificativiGiorno, nowMinutes = null) {
  const dateObj = new Date(dataStr + 'T12:00:00');
  const dayOfWeek = dateObj.getDay(); // 0=Dom, 1=Lun, ..., 5=Ven, 6=Sab
  const isVenerdi = (dayOfWeek === 5);
  const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
  const yStr = dataStr.slice(0, 4);
  const mmdd = dataStr.slice(5);

  // Verifica festivo (incluso Santo Patrono e festiviExtra)
  let isFestivo = false;
  if (typeof PARAMETRI !== 'undefined') {
    const sp = PARAMETRI.santoPatrono || '06-24';
    if (sp && mmdd === sp) isFestivo = true;
    if (PARAMETRI.festiviExtra) {
      const extra = String(PARAMETRI.festiviExtra).split(',').map(s => s.trim());
      if (extra.includes(mmdd)) isFestivo = true;
    }
  }
  const fissiNazionali = ['01-01', '01-06', '04-25', '05-01', '06-02', '08-15', '11-01', '12-08', '12-25', '12-26'];
  if (fissiNazionali.includes(mmdd)) isFestivo = true;

  const oreDovute = (isWeekend || isFestivo) ? 0 : (isVenerdi ? PARAMETRI.oreTeoricheVenerdi : PARAMETRI.oreTeoricheLunGio);

  const attenzioni = [];
  const scopertiOrari = []; // [{ tipoScoperto, inizio, fine, durataMin, label }]

  // 1. Estrazione passaggi (incluso riconoscimento uscite/entrate per visita medica)
  const timbEntrate = timbratureGiorno.filter(t => t.tipo === 'E').sort((a,b) => parseTimeToMinutes(a.ora) - parseTimeToMinutes(b.ora));
  const primaEntrata = timbEntrate.length > 0 ? timbEntrate[0] : null;

  const timbPausaOut = timbratureGiorno.filter(t => t.tipo === 'U PAUSA').sort((a,b) => parseTimeToMinutes(a.ora) - parseTimeToMinutes(b.ora));
  const inizioPausaMin = timbPausaOut.length > 0 ? parseTimeToMinutes(timbPausaOut[0].ora) : null;

  const timbPausaIn = timbratureGiorno.filter(t => t.tipo === 'E PAUSA').sort((a,b) => parseTimeToMinutes(a.ora) - parseTimeToMinutes(b.ora));
  const finePausaMin = timbPausaIn.length > 0 ? parseTimeToMinutes(timbPausaIn[0].ora) : null;

  const timbUscite = timbratureGiorno.filter(t => t.tipo === 'U').sort((a,b) => parseTimeToMinutes(b.ora) - parseTimeToMinutes(a.ora));
  const ultimaUscitaMin = timbUscite.length > 0 ? parseTimeToMinutes(timbUscite[0].ora) : null;

  // Timbrature intermedie (es. uscita e rientro per visita medica)
  const timbUscitaIntermedia = timbratureGiorno.find(t => t.tipo === 'U VISITA MEDICA' || (t.tipo === 'U' && t !== timbUscite[0]));
  const uscitaIntermediaMin = timbUscitaIntermedia ? parseTimeToMinutes(timbUscitaIntermedia.ora) : null;

  if (timbratureGiorno.some(t => t.fittizia)) {
    attenzioni.push('Timbrature fittizie presenti');
  }

  // 2. Normalizzazione Entrata (incluso caso ingresso pomeridiano timbrato come E PAUSA senza E mattutina, es. 21/04)
  let entrataRawMin = null;
  let entrataNormMin = null;
  let ritardoIngressoMin = 0;
  let ritardoIngressoRealeMin = 0; // effettivo ritardo non coperto da anticipare
  let ingressoSoloPomeriggio = false;

  if (primaEntrata) {
    entrataRawMin = parseTimeToMinutes(primaEntrata.ora);
    if (entrataRawMin < PARAMETRI.fasciaIngressoInizio) {
      entrataNormMin = primaEntrata.autorizzata ? Math.ceil(entrataRawMin / 15) * 15 : PARAMETRI.fasciaIngressoInizio;
    } else if (entrataRawMin <= PARAMETRI.fasciaIngressoFine) {
      entrataNormMin = entrataRawMin;
    } else {
      const ritGrezzo = entrataRawMin - PARAMETRI.fasciaIngressoFine;
      ritardoIngressoMin = Math.ceil(ritGrezzo / 15) * 15;
      entrataNormMin = PARAMETRI.fasciaIngressoFine + ritardoIngressoMin;
    }
  } else if (inizioPausaMin === null && finePausaMin !== null && ultimaUscitaMin !== null) {
    // Entrata direttamente nel pomeriggio dopo assenza mattutina (es. E PAUSA 12:53, U 17:38)
    ingressoSoloPomeriggio = true;
    entrataRawMin = finePausaMin;
    if (finePausaMin > PARAMETRI.pausaFineFinestra) {
      const ritG = finePausaMin - PARAMETRI.pausaFineFinestra;
      entrataNormMin = PARAMETRI.pausaFineFinestra + Math.ceil(ritG / 15) * 15;
    } else {
      entrataNormMin = finePausaMin;
    }
  }

  // 3. Normalizzazione Fine Pausa (solo se non usata come entrata pomeridiana unica)
  let finePausaNormMin = ingressoSoloPomeriggio ? null : finePausaMin;
  let ritardoPausaMin = 0;
  if (!ingressoSoloPomeriggio && finePausaMin !== null) {
    if (finePausaMin > PARAMETRI.pausaFineFinestra) {
      const ritPausaGrezzo = finePausaMin - PARAMETRI.pausaFineFinestra;
      ritardoPausaMin = Math.ceil(ritPausaGrezzo / 15) * 15;
      finePausaNormMin = PARAMETRI.pausaFineFinestra + ritardoPausaMin;
    }
  }

  // 4. Giustificativi e fasce orarie coperte
  let oreGiustificateMin = 0;
  let smartWorkingMin = 0;
  const intervalliGiust = []; // [{ ini, fin, dur, tipo, isFull }]
  let minutiGiustSenzaOrario = 0;
  const giustPerTipo = {};

  // Se giornata festiva, la giornata è coperta d'ufficio e non consuma giustificativi
  if (isFestivo || oreDovute === 0) {
    giustificativiGiorno.forEach(g => {
      giustPerTipo[g.tipo] = 0;
    });
  } else {
    giustificativiGiorno.forEach(g => {
      if (g.tipo === 'STRAORDINARIO PAUSA' || g.tipo === 'PAUSA NON TIMBRATA') return;
      const tPrima = parseTimeToMinutes(g.tragittoPrima) || 0;
      const tDopo = parseTimeToMinutes(g.tragittoDopo) || 0;
      const iniRaw = parseTimeToMinutes(g.oraInizio);
      const finRaw = parseTimeToMinutes(g.oraFine);

      let dur = 0;
      if (g.tuttaGiornata && oreDovute > 0) {
        dur = oreDovute;
      } else if (g.durata) {
        dur = parseTimeToMinutes(g.durata) || 0;
        // Normalizza eventuali durate storiche a 1 min dallo scatto (es. 1:29 da 09:00-10:29 -> 1:30)
        if (g.tipo !== 'VISITA MEDICA' && dur > 0 && dur % 15 === 14) {
          dur += 1;
        }
      } else if (iniRaw !== null && finRaw !== null && finRaw > iniRaw) {
        dur = finRaw - iniRaw;
        const pIni = PARAMETRI.pausaInizioFinestra || 735;
        if (g.tipo !== 'VISITA MEDICA' && !isVenerdi && !isWeekend && iniRaw < pIni && finRaw > PARAMETRI.pausaFineFinestra && inizioPausaMin === null) {
          dur = Math.max(0, dur - PARAMETRI.pausaMinimaMinuti);
        }
      }

      // Arrotondamento a scatti di 15 min per assenze brevi se non intera giornata (es. RST 17:19-17:25 -> 15 min, FER 14:00-14:58 -> 45 min)
      if (!g.tuttaGiornata && dur > 0 && dur % 15 !== 0 && g.tipo !== 'VISITA MEDICA') {
        dur = Math.ceil(dur / 15) * 15;
      }
      // Tetto rigido 4h (240 min) per Smart Working di mezza giornata
      if (g.tipo === 'SMART WORKING' && !g.tuttaGiornata && dur > 240) {
        dur = 240;
      }

      const totG = dur + tPrima + tDopo;
      oreGiustificateMin += totG;
      giustPerTipo[g.tipo] = (giustPerTipo[g.tipo] || 0) + totG;
      if (g.tipo === 'SMART WORKING') smartWorkingMin += totG;

      if (g.tuttaGiornata) {
        intervalliGiust.push({ ini: 0, fin: 24 * 60, dur: totG, tipo: g.tipo, isFull: true });
      } else if (iniRaw !== null && finRaw !== null && finRaw > iniRaw) {
        const effIni = Math.max(0, iniRaw - tPrima);
        let effFin = finRaw + tDopo;
        // Se la fine del giustificativo coincide con la timbratura effettiva d'entrata (es. 10:29), copre fino allo scatto normalizzato (10:30)
        if (entrataRawMin !== null && Math.abs(effFin - entrataRawMin) <= 1 && entrataNormMin !== null && entrataNormMin > effFin) {
          effFin = entrataNormMin;
        }
        intervalliGiust.push({ ini: effIni, fin: effFin, dur: totG, tipo: g.tipo, isFull: false });
      } else {
        minutiGiustSenzaOrario += totG;
      }
    });
  }

  const oreAssenzaGiustificataMin = Math.max(0, oreGiustificateMin - smartWorkingMin);

  const swGiusts = giustificativiGiorno.filter(g => g.tipo === 'SMART WORKING');
  const swFullDay = swGiusts.some(g => g.tuttaGiornata);
  const isSwMattina = !swFullDay && smartWorkingMin > 0 && (
    swGiusts.some(g => { const ini = parseTimeToMinutes(g.oraInizio); return ini !== null && ini < (12 * 60 + 15); }) ||
    (entrataNormMin !== null && entrataNormMin >= (12 * 60 + 15))
  );
  const isSwPomeriggio = !swFullDay && smartWorkingMin > 0 && !isSwMattina;

  // 5. Pausa Effettiva / In corso
  const hasStraordPausa = giustificativiGiorno.some(g => g.tipo === 'STRAORDINARIO PAUSA');
  const hasPausaNonTimbrata = giustificativiGiorno.some(g => g.tipo === 'PAUSA NON TIMBRATA');
  const hasSmartWorking = smartWorkingMin > 0;
  const isVisitaMedicaPranzo = giustificativiGiorno.some(g => g.tipo === 'VISITA MEDICA') && uscitaIntermediaMin !== null && finePausaMin !== null && inizioPausaMin === null;

  let pausaEffettivaMin = 0;
  let pausaConvertitaStraordMin = 0;
  let isPausaInCorso = false;

  if (isVenerdi) {
    if (inizioPausaMin !== null && finePausaNormMin !== null) {
      const durataTimbrata = Math.max(0, finePausaNormMin - inizioPausaMin);
      pausaEffettivaMin = Math.max(PARAMETRI.pausaMinimaMinuti, durataTimbrata);
    } else {
      // Regola Inaz per il venerdì continuato: NON detrae mai i 30 min di pausa obbligatoria.
      pausaEffettivaMin = 0;
    }
  } else if (isWeekend) {
    if (inizioPausaMin !== null && finePausaNormMin !== null) {
      const durataTimbrata = Math.max(0, finePausaNormMin - inizioPausaMin);
      pausaEffettivaMin = Math.max(PARAMETRI.pausaMinimaMinuti, durataTimbrata);
    } else {
      pausaEffettivaMin = 0;
    }
  } else if (ingressoSoloPomeriggio) {
    // Ingresso pomeridiano senza E mattutina (es. 21/04 E 12:53): nessuna pausa da dedurre
    pausaEffettivaMin = 0;
  } else if (isVisitaMedicaPranzo) {
    // Visita medica a cavallo del pranzo (es. 05/03: U 11:31 per visita medica fine 12:45, E PAUSA 14:00)
    // La pausa effettiva va dalla fine della visita medica (12:45) al rientro (14:00) = 75 min
    const gVisita = giustificativiGiorno.find(g => g.tipo === 'VISITA MEDICA');
    const finVisita = gVisita ? (parseTimeToMinutes(gVisita.oraFine) || (uscitaIntermediaMin + 75)) : (uscitaIntermediaMin + 75);
    pausaEffettivaMin = Math.max(PARAMETRI.pausaMinimaMinuti, Math.max(0, finePausaMin - finVisita));
  } else if ((isSwPomeriggio || isSwMattina) && inizioPausaMin === null && finePausaMin === null) {
    // Giornata mista Ufficio + Smart Working (mattina o pomeriggio): la pausa di 30 min è gestita tra le due modalità
    pausaEffettivaMin = 0;
  } else {
    if (inizioPausaMin !== null && finePausaNormMin !== null) {
      // Inaz: se rientra dopo le 14:15 la pausa effettiva comprende il rientro effettivo normalizzato a scatti di 15 min
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
      } else if (oreGiustificateMin > 0 && entrataNormMin !== null && ultimaUscitaMin !== null && (ultimaUscitaMin - entrataNormMin) <= (6 * 60)) {
        pausaEffettivaMin = 0;
      } else if (entrataNormMin !== null && ultimaUscitaMin !== null && (ultimaUscitaMin - entrataNormMin) <= (6 * 60) && ultimaUscitaMin <= PARAMETRI.pausaFineFinestra) {
        pausaEffettivaMin = 0;
      } else if (entrataNormMin !== null && entrataNormMin >= (12 * 60 + 15) && ultimaUscitaMin !== null && (ultimaUscitaMin - entrataNormMin) <= (6 * 60)) {
        // Ingresso pomeridiano (dopo le 12:15) con <= 6h continuative: nessuna pausa da dedurre
        pausaEffettivaMin = 0;
      } else {
        pausaEffettivaMin = PARAMETRI.pausaMinimaMinuti;
        if (ultimaUscitaMin !== null) {
          attenzioni.push('Pausa non timbrata: dedotti 30 min d’ufficio');
        }
      }
    }
  }

  // 6. SCENARI MATTUTINI E STRATEGIE DI USCITA
  let uscitaTeoricaMin = null;
  let pausaMassimaPerUscitaMinima = null;
  let orarioFine8hConPausaMin = null;
  let anticipoRispettoPalettoMin = 0;
  let oraScatto30m = null, oraScatto45m = null, oraScatto60m = null;
  let swPomeriggioInizioPrevisto = null, swPomeriggioFinePrevista = null;

  if (entrataNormMin !== null) {
    const baseCalcolo = Math.min(PARAMETRI.fasciaIngressoFine, entrataNormMin);
    const oreLavoroNecessarie = Math.max(0, oreDovute - oreGiustificateMin);

    if (isVenerdi || isWeekend) {
      uscitaTeoricaMin = entrataNormMin + oreLavoroNecessarie;
      oraScatto30m = uscitaTeoricaMin + 30;
      oraScatto45m = uscitaTeoricaMin + 45;
      oraScatto60m = uscitaTeoricaMin + 60;
    } else if (isSwPomeriggio) {
      orarioFine8hConPausaMin = baseCalcolo + oreLavoroNecessarie + PARAMETRI.pausaMinimaMinuti;
      pausaMassimaPerUscitaMinima = PARAMETRI.pausaMinimaMinuti;
      uscitaTeoricaMin = entrataNormMin + oreLavoroNecessarie;
      swPomeriggioInizioPrevisto = uscitaTeoricaMin + PARAMETRI.pausaMinimaMinuti;
      swPomeriggioFinePrevista = swPomeriggioInizioPrevisto + smartWorkingMin;
      oraScatto30m = uscitaTeoricaMin + 30;
      oraScatto45m = uscitaTeoricaMin + 45;
      oraScatto60m = uscitaTeoricaMin + 60;
    } else {
      orarioFine8hConPausaMin = baseCalcolo + oreLavoroNecessarie + PARAMETRI.pausaMinimaMinuti;
      const pausaPossibileGrezza = PARAMETRI.uscitaMinimaLunGio - (baseCalcolo + oreLavoroNecessarie);
      pausaMassimaPerUscitaMinima = Math.max(PARAMETRI.pausaMinimaMinuti, pausaPossibileGrezza);

      const orarioCompletamentoEffettivo = entrataNormMin + oreLavoroNecessarie + pausaEffettivaMin;
      if (oreGiustificateMin > 0 && pausaEffettivaMin === 0 && !ingressoSoloPomeriggio && entrataNormMin < (12 * 60 + 15)) {
        uscitaTeoricaMin = orarioCompletamentoEffettivo;
      } else {
        uscitaTeoricaMin = Math.max(PARAMETRI.uscitaMinimaLunGio, orarioCompletamentoEffettivo);
      }

      if (oreGiustificateMin === 0 && orarioCompletamentoEffettivo < PARAMETRI.uscitaMinimaLunGio) {
        anticipoRispettoPalettoMin = PARAMETRI.uscitaMinimaLunGio - orarioCompletamentoEffettivo;
      }

      oraScatto30m = Math.max(PARAMETRI.uscitaMinimaLunGio, orarioCompletamentoEffettivo + 30);
      oraScatto45m = Math.max(PARAMETRI.uscitaMinimaLunGio + 15, orarioCompletamentoEffettivo + 45);
      oraScatto60m = Math.max(PARAMETRI.uscitaMinimaLunGio + 30, orarioCompletamentoEffettivo + 60);
    }
  }

  // 7. Verifica copertura ritardo ingresso [09:00 .. entrataNormMin] e ritardo pausa [14:15 .. finePausaNormMin]
  let poolSenzaOrario = minutiGiustSenzaOrario;

  function calcolaNonCopertoIntervallo(winIni, winFin) {
    if (winFin <= winIni) return { scopertoMin: 0, iniScoperto: winIni, finScoperto: winFin };
    // Calcola minuti coperti da intervalli espliciti
    let coperto = 0;
    let maxFinCopertoDaInizio = winIni;
    const sorted = [...intervalliGiust].sort((a, b) => a.ini - b.ini);
    sorted.forEach(iv => {
      const ovIni = Math.max(winIni, iv.ini);
      const ovFin = Math.min(winFin, iv.fin);
      if (ovFin > ovIni) {
        coperto += (ovFin - ovIni);
        if (ovIni <= maxFinCopertoDaInizio + 1) {
          maxFinCopertoDaInizio = Math.max(maxFinCopertoDaInizio, ovFin);
        }
      }
    });
    let scoperto = Math.max(0, (winFin - winIni) - coperto);
    if (scoperto > 0 && poolSenzaOrario > 0) {
      const usa = Math.min(scoperto, poolSenzaOrario);
      scoperto -= usa;
      poolSenzaOrario -= usa;
      maxFinCopertoDaInizio = Math.min(winFin, maxFinCopertoDaInizio + usa);
    }
    if (scoperto <= 1) return { scopertoMin: 0, iniScoperto: winFin, finScoperto: winFin };
    const scop15 = Math.max(15, Math.ceil(scoperto / 15) * 15);
    const finScop = winFin;
    const iniScop = Math.max(winIni, finScop - scop15);
    return { scopertoMin: scop15, iniScoperto: iniScop, finScoperto: finScop };
  }

  const infoRitIngresso = (ritardoIngressoMin > 0 && entrataNormMin !== null && entrataRawMin < (12 * 60 + 15))
    ? calcolaNonCopertoIntervallo(PARAMETRI.fasciaIngressoFine, entrataNormMin)
    : { scopertoMin: 0, iniScoperto: 0, finScoperto: 0 };

  const infoRitPausa = (ritardoPausaMin > 0 && finePausaNormMin !== null)
    ? calcolaNonCopertoIntervallo(PARAMETRI.pausaFineFinestra, finePausaNormMin)
    : { scopertoMin: 0, iniScoperto: 0, finScoperto: 0 };

  // 8. Ore Lavorate Effettive e Regola Uscita Anticipata
  let oreLavorateMin = 0;
  let isLive = false;
  let uscitaConteggiataMin = ultimaUscitaMin;
  let minutiGiustificativoRichiesti = 0;
  let reqPaletto1715Scoperto = 0;

  if (entrataNormMin !== null && ultimaUscitaMin !== null) {
    const lavoroGrezzoMin = Math.max(0, ultimaUscitaMin - entrataNormMin - pausaEffettivaMin);
    const uscitaPrima1715LunGio = (!isVenerdi && !isWeekend && ultimaUscitaMin < PARAMETRI.uscitaMinimaLunGio);
    // È uscita anticipata se esce prima delle 17:15 (Lun-Gio) OPPURE se (lavoro + giustificativi + eventuale ritardo mattutino da giustificare) non copre le ore dovute
    const mancaFineGiornata = oreDovute > 0 && (lavoroGrezzoMin + oreGiustificateMin + infoRitIngresso.scopertoMin + infoRitPausa.scopertoMin) < oreDovute;

    if (isVenerdi && oreGiustificateMin === 0) {
      // Regola venerdì Inaz continuato:
      // se tra 6h01m e 6h29m: arrotonda per difetto a 6h00m (straordinario = 0).
      // da 6h30m in su: riconosce tutto lo straordinario a scatti di 15m (6h30 -> +0:30, 6h50 -> +0:45)
      const eccessoVen = lavoroGrezzoMin - oreDovute;
      if (eccessoVen > 0 && eccessoVen < PARAMETRI.scattoMinimoStraordinario) {
        oreLavorateMin = oreDovute;
        uscitaConteggiataMin = entrataNormMin + oreDovute;
        attenzioni.push(`Venerdì: ${eccessoVen} min oltre le 6 ore non riconosciuti (arrotondato per difetto a 6h, nessuna pausa detratta)`);
      } else {
        oreLavorateMin = lavoroGrezzoMin;
        uscitaConteggiataMin = ultimaUscitaMin;
      }
    } else if ((swFullDay || isSwPomeriggio) && ultimaUscitaMin !== null) {
      // Giornata mista Ufficio + Smart Working pomeridiano (o SW intera giornata):
      // Inaz calcola le ore lavorate in sede direttamente dall'orario di uscita normalizzato
      // e assegna la quota residua allo smart working (al netto della pausa obbligatoria di 30 min)
      const lavSedeGrezzo = Math.max(0, ultimaUscitaMin - entrataNormMin);
      oreLavorateMin = Math.floor(lavSedeGrezzo / 15) * 15;
      uscitaConteggiataMin = entrataNormMin + oreLavorateMin;
      const targetTotale = oreDovute > 0 ? oreDovute : 480;
      if (oreLavorateMin + smartWorkingMin > targetTotale) {
        smartWorkingMin = Math.max(0, targetTotale - oreLavorateMin);
        oreGiustificateMin = smartWorkingMin;
        giustPerTipo['SMART WORKING'] = smartWorkingMin;
      }
    } else if (uscitaPrima1715LunGio && lavoroGrezzoMin < oreDovute) {
      // Uscita anticipata con meno delle ore intere (es. 17/11: E 08:23, U 13:10 -> 4h47m -> 4h45m, uscita conteggiata 13:08)
      oreLavorateMin = Math.floor(lavoroGrezzoMin / 15) * 15;
      uscitaConteggiataMin = entrataNormMin + pausaEffettivaMin + oreLavorateMin;
    } else if (uscitaPrima1715LunGio && lavoroGrezzoMin >= oreDovute) {
      // Ha già svolto >= 8h (es. E 08:00, pausa 30m) ma esce prima delle 17:15 (es. 17:10 -> 17:00, servono 15m)
      const anticipoPaletto = PARAMETRI.uscitaMinimaLunGio - ultimaUscitaMin;
      const reqPalettoMin = Math.max(15, Math.ceil(anticipoPaletto / 15) * 15);
      uscitaConteggiataMin = PARAMETRI.uscitaMinimaLunGio - reqPalettoMin;
      if (oreGiustificateMin < reqPalettoMin) {
        reqPaletto1715Scoperto = Math.max(15, Math.ceil((reqPalettoMin - oreGiustificateMin) / 15) * 15);
        oreLavorateMin = Math.max(0, oreDovute - reqPalettoMin);
      } else {
        oreLavorateMin = oreDovute;
      }
    } else if (mancaFineGiornata) {
      // Uscita dopo le 17:15 (o di venerdì) ma senza aver completato le ore necessarie
      oreLavorateMin = Math.floor(lavoroGrezzoMin / 15) * 15;
      uscitaConteggiataMin = entrataNormMin + pausaEffettivaMin + oreLavorateMin;
    } else {
      // Uscita regolare (incluso il caso del 4 novembre: E 10:29 + Ferie 09:00-10:30 + U 17:51!)
      oreLavorateMin = lavoroGrezzoMin;
      uscitaConteggiataMin = ultimaUscitaMin;
    }
  } else if (entrataNormMin !== null && nowMinutes !== null) {
    isLive = true;
    const lordo = Math.max(0, nowMinutes - entrataNormMin);
    oreLavorateMin = Math.max(0, lordo - pausaEffettivaMin);
  } else if (entrataNormMin !== null && ultimaUscitaMin === null && nowMinutes === null) {
    attenzioni.push('Uscita mancante');
  }

  // Se c'è un ritardo mattutino d'ingresso scoperto non giustificato (> 09:00, es. 03/09 E 09:01),
  // l'orario ordinario massimo dovuto per la giornata viene decurtato di tale ritardo
  const ritardoIngressoScopertoMin = infoRitIngresso.scopertoMin;
  const targetOrdinarioGiorno = Math.max(0, oreDovute - ritardoIngressoScopertoMin);

  // Riduzione delle FERIE mattutine parziali se il lavoro prolungato copre le ore (es. 23/04, 14/09)
  let ferieEffettiveMin = giustPerTipo['FERIE'] || 0;
  const gFerie = giustificativiGiorno.find(g => g.tipo === 'FERIE' && !g.tuttaGiornata);
  if (gFerie && ferieEffettiveMin > 0 && oreDovute > 0 && !isFestivo) {
    const totSvoltoGrezzo = oreLavorateMin + oreGiustificateMin;
    if (totSvoltoGrezzo > targetOrdinarioGiorno) {
      const eccedenzaAssorbibile = Math.floor((totSvoltoGrezzo - targetOrdinarioGiorno) / 15) * 15;
      const riduzione = Math.min(ferieEffettiveMin, eccedenzaAssorbibile);
      if (riduzione > 0) {
        ferieEffettiveMin -= riduzione;
        oreGiustificateMin -= riduzione;
        giustPerTipo['FERIE'] = ferieEffettiveMin;
      }
    }
  }

  // Quota netta di PERMESSO NON RETRIBUITO (non genera ore retribuite ma copre lo scoperto)
  const permessoNonRetrGrezzo = giustPerTipo['PERMESSO NON RETRIBUITO'] || 0;
  let permessoNonRetrNettoMin = 0;
  if (permessoNonRetrGrezzo > 0) {
    oreGiustificateMin = Math.max(0, oreGiustificateMin - permessoNonRetrGrezzo);
    giustPerTipo['PERMESSO NON RETRIBUITO'] = 0;
    permessoNonRetrNettoMin = permessoNonRetrGrezzo;
  }

  const oreTotaliSvolteMin = oreLavorateMin + oreGiustificateMin;
  const oreOrdinarieMin = Math.min(targetOrdinarioGiorno, oreTotaliSvolteMin);

  // 9. Calcolo Straordinario ed eliminazione doppio addebito ritardo pausa
  const uscitaPrimaPalettoLunGio = (!isVenerdi && !isWeekend && ultimaUscitaMin !== null && ultimaUscitaMin < PARAMETRI.uscitaMinimaLunGio);
  let straordinarioNettoMin = 0;
  const eccedenzaGrezzaMin = uscitaPrimaPalettoLunGio ? pausaConvertitaStraordMin : Math.max(0, oreTotaliSvolteMin - targetOrdinarioGiorno);
  if (eccedenzaGrezzaMin >= PARAMETRI.scattoMinimoStraordinario) {
    straordinarioNettoMin = Math.floor(eccedenzaGrezzaMin / PARAMETRI.scattoSuccessivoStraordinario) * PARAMETRI.scattoSuccessivoStraordinario;
  }

  // Se la giornata complessiva copre l'orario dovuto (o il target ordinario),
  // il rientro dalla pausa oltre le 14:15 non lascia scoperti non giustificati
  let ritIngrScopertoFinale = ritardoIngressoScopertoMin;
  let ritPausaScopertoFinale = infoRitPausa.scopertoMin;
  if (oreTotaliSvolteMin >= oreDovute) {
    ritPausaScopertoFinale = 0;
  }
  if (permessoNonRetrNettoMin > 0) {
    if (ritIngrScopertoFinale > 0) {
      const c = Math.min(ritIngrScopertoFinale, permessoNonRetrNettoMin);
      ritIngrScopertoFinale -= c;
    }
    if (ritPausaScopertoFinale > 0) {
      const c = Math.min(ritPausaScopertoFinale, permessoNonRetrNettoMin);
      ritPausaScopertoFinale -= c;
    }
  }

  // Costruzione fasce orarie scoperte (quando la giornata ha l'uscita timbrata)
  if (ultimaUscitaMin !== null && oreDovute > 0) {
    if (ritIngrScopertoFinale > 0) {
      const finS = infoRitIngresso.finScoperto;
      const iniS = Math.max(PARAMETRI.fasciaIngressoFine, finS - ritIngrScopertoFinale);
      const sIni = formatMinutesToTime(iniS), sFin = formatMinutesToTime(finS);
      scopertiOrari.push({
        tipoScoperto: 'ritardo_ingresso',
        inizio: sIni,
        fine: sFin,
        durataMin: ritIngrScopertoFinale,
        label: `Ritardo ingresso: scoperto ${sIni}–${sFin} (${formatMinutesToHoursMins(ritIngrScopertoFinale)})`
      });
    }

    if (ritPausaScopertoFinale > 0) {
      const finS = infoRitPausa.finScoperto;
      const iniS = Math.max(PARAMETRI.pausaFineFinestra, finS - ritPausaScopertoFinale);
      const sIni = formatMinutesToTime(iniS), sFin = formatMinutesToTime(finS);
      scopertiOrari.push({
        tipoScoperto: 'ritardo_pausa',
        inizio: sIni,
        fine: sFin,
        durataMin: ritPausaScopertoFinale,
        label: `Rientro pausa oltre 14:15: scoperto ${sIni}–${sFin} (${formatMinutesToHoursMins(ritPausaScopertoFinale)})`
      });
    }

    const giaSegnalatoMin = ritIngrScopertoFinale + ritPausaScopertoFinale;
    if (reqPaletto1715Scoperto > 0 && reqPaletto1715Scoperto > giaSegnalatoMin) {
      const restMin = Math.max(15, Math.ceil((reqPaletto1715Scoperto - giaSegnalatoMin) / 15) * 15);
      const finS = PARAMETRI.uscitaMinimaLunGio;
      const iniS = finS - restMin;
      const sIni = formatMinutesToTime(iniS), sFin = formatMinutesToTime(finS);
      scopertiOrari.push({
        tipoScoperto: 'uscita_anticipata',
        inizio: sIni,
        fine: sFin,
        durataMin: restMin,
        label: `Uscita ${formatMinutesToTime(ultimaUscitaMin)} (<17:15): scoperto ${sIni}–${sFin} (${formatMinutesToHoursMins(restMin)})`
      });
    } else if ((oreTotaliSvolteMin + giaSegnalatoMin) < oreDovute) {
      const gapRes = oreDovute - (oreTotaliSvolteMin + giaSegnalatoMin);
      const restMin = Math.max(15, Math.ceil(gapRes / 15) * 15);
      let iniS, finS;
      if (ingressoSoloPomeriggio || (entrataNormMin !== null && entrataNormMin >= (12 * 60 + 15))) {
        // Assenza mattutina (es. ingresso direttamente nel pomeriggio): fascia scoperta dalle 09:00
        iniS = PARAMETRI.fasciaIngressoFine;
        finS = iniS + restMin;
      } else {
        // Uscita anticipata o ore mancanti a fine giornata: parte dall'uscita conteggiata
        iniS = uscitaConteggiataMin !== null ? uscitaConteggiataMin : ultimaUscitaMin;
        // Se c'è già un giustificativo pomeridiano che parte da iniS, trasla dopo la fine di quel giustificativo
        intervalliGiust.sort((a, b) => a.ini - b.ini).forEach(iv => {
          if (iv.ini <= iniS + 1 && iv.fin > iniS) iniS = iv.fin;
        });
        const pIni = PARAMETRI.pausaInizioFinestra || 735;
        if (!isVenerdi && !isWeekend && pausaEffettivaMin === 0 && iniS < pIni && (iniS + restMin) > PARAMETRI.pausaFineFinestra) {
          finS = iniS + restMin + PARAMETRI.pausaMinimaMinuti;
        } else {
          finS = iniS + restMin;
        }
      }
      const sIni = formatMinutesToTime(iniS), sFin = formatMinutesToTime(finS);
      const arrotTxt = (uscitaConteggiataMin !== null && uscitaConteggiataMin !== ultimaUscitaMin && !(ingressoSoloPomeriggio || entrataNormMin >= 735))
        ? `Uscita ${formatMinutesToTime(ultimaUscitaMin)} (→${formatMinutesToTime(uscitaConteggiataMin)}): `
        : 'Ore mancanti: ';
      scopertiOrari.push({
        tipoScoperto: 'ore_mancanti',
        inizio: sIni,
        fine: sFin,
        durataMin: restMin,
        label: `${arrotTxt}scoperto ${sIni}–${sFin} (${formatMinutesToHoursMins(restMin)})`
      });
    }
  }

  minutiGiustificativoRichiesti = scopertiOrari.reduce((acc, s) => acc + s.durataMin, 0);

  // Minuti oltre l'orario e calcolo prossimo scatto live
  let minutiOltreOrario = eccedenzaGrezzaMin;
  let minutiAlProssimoScatto = 0;
  let orarioProssimoScatto = null;
  let valoreProssimoScatto = 0;

  if (nowMinutes !== null && entrataNormMin !== null && ultimaUscitaMin === null) {
    if (eccedenzaGrezzaMin < PARAMETRI.scattoMinimoStraordinario) {
      minutiAlProssimoScatto = PARAMETRI.scattoMinimoStraordinario - eccedenzaGrezzaMin;
      valoreProssimoScatto = PARAMETRI.scattoMinimoStraordinario;
      orarioProssimoScatto = nowMinutes + minutiAlProssimoScatto;
    } else {
      const step = PARAMETRI.scattoSuccessivoStraordinario;
      const residuoScatto = eccedenzaGrezzaMin % step;
      minutiAlProssimoScatto = (residuoScatto === 0) ? step : (step - residuoScatto);
      valoreProssimoScatto = straordinarioNettoMin + step;
      orarioProssimoScatto = nowMinutes + minutiAlProssimoScatto;
    }
  }

  const ticket = ((oreLavorateMin + smartWorkingMin) >= 4 * 60);

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
    uscitaConteggiata: formatMinutesToTime(uscitaConteggiataMin),
    minutiGiustificativoRichiesti,
    scopertiOrari,
    pausaEffettivaMin,
    oreLavorateMin,
    oreOrdinarieMin,
    ferieEffettiveMin,
    permessoNonRetrNettoMin,
    giustPerTipo,
    oreGiustificateMin,
    smartWorkingMin,
    isSwMattina,
    isSwPomeriggio,
    swPomeriggioInizioPrevisto: formatMinutesToTime(swPomeriggioInizioPrevisto),
    swPomeriggioFinePrevista: formatMinutesToTime(swPomeriggioFinePrevista),
    oreAssenzaGiustificataMin,
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
