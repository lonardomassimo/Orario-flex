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

// Calcolo deterministico della singola giornata con fasce orarie giustificativi e calcolo scoperti
function calcolaGiornata(dataStr, timbratureGiorno, giustificativiGiorno, nowMinutes = null) {
  const dateObj = new Date(dataStr + 'T12:00:00');
  const dayOfWeek = dateObj.getDay(); // 0=Dom, 1=Lun, ..., 5=Ven, 6=Sab
  const isVenerdi = (dayOfWeek === 5);
  const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
  const oreDovute = isWeekend ? 0 : (isVenerdi ? PARAMETRI.oreTeoricheVenerdi : PARAMETRI.oreTeoricheLunGio);

  const attenzioni = [];
  const scopertiOrari = []; // [{ tipoScoperto, inizio, fine, durataMin, label }]

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

  // 2. Normalizzazione Entrata (incluso caso ingresso pomeridiano timbrato come E PAUSA senza E mattutina, es. 21/04)
  let entrataRawMin = null;
  let entrataNormMin = null;
  let ritardoIngressoMin = 0;
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
  const intervalliGiust = []; // [{ ini, fin, dur, tipo }]
  let minutiGiustSenzaOrario = 0;

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

    const totG = dur + tPrima + tDopo;
    oreGiustificateMin += totG;
    if (g.tipo === 'SMART WORKING') smartWorkingMin += totG;

    if (g.tuttaGiornata) {
      intervalliGiust.push({ ini: 0, fin: 24 * 60, dur: totG, tipo: g.tipo });
    } else if (iniRaw !== null && finRaw !== null && finRaw > iniRaw) {
      const effIni = Math.max(0, iniRaw - tPrima);
      let effFin = finRaw + tDopo;
      // Se la fine del giustificativo coincide con la timbratura effettiva d'entrata (es. 10:29), copre fino allo scatto normalizzato (10:30)
      if (entrataRawMin !== null && Math.abs(effFin - entrataRawMin) <= 1 && entrataNormMin !== null && entrataNormMin > effFin) {
        effFin = entrataNormMin;
      }
      intervalliGiust.push({ ini: effIni, fin: effFin, dur: totG, tipo: g.tipo });
    } else {
      minutiGiustSenzaOrario += totG;
    }
  });

  const oreAssenzaGiustificataMin = Math.max(0, oreGiustificateMin - smartWorkingMin);

  // 5. Pausa Effettiva / In corso
  const hasStraordPausa = giustificativiGiorno.some(g => g.tipo === 'STRAORDINARIO PAUSA');
  const hasPausaNonTimbrata = giustificativiGiorno.some(g => g.tipo === 'PAUSA NON TIMBRATA');

  let pausaEffettivaMin = 0;
  let pausaConvertitaStraordMin = 0;
  let isPausaInCorso = false;

  if (isVenerdi || isWeekend || ingressoSoloPomeriggio) {
    if (!ingressoSoloPomeriggio && inizioPausaMin !== null && finePausaNormMin !== null) {
      const durataTimbrata = Math.max(0, finePausaNormMin - inizioPausaMin);
      pausaEffettivaMin = Math.max(PARAMETRI.pausaMinimaMinuti, durataTimbrata);
    } else if (isVenerdi) {
      const orarioCorrente = (ultimaUscitaMin !== null) ? ultimaUscitaMin : (nowMinutes !== null ? nowMinutes : null);
      // Pausa di 30 min detratta solo se si raggiungono 30 min di straordinario oltre le ore dovute;
      // altrimenti il conteggio si arrotonda per difetto alle 6 ore (nessuna pausa detratta).
      if (entrataNormMin !== null && orarioCorrente !== null && (orarioCorrente - entrataNormMin) > oreDovute) {
        const eccesso = (orarioCorrente - entrataNormMin) - oreDovute;
        if (eccesso >= PARAMETRI.scattoMinimoStraordinario) {
          pausaEffettivaMin = PARAMETRI.pausaMinimaMinuti;
          attenzioni.push('Pausa obbligatoria di 30 min applicata (raggiunti 30 min di straordinario oltre le 6 ore di venerdì)');
        } else {
          pausaEffettivaMin = eccesso;
          attenzioni.push(`Venerdì: ${eccesso} min oltre le 6 ore non riconosciuti (arrotondato per difetto a 6h, nessuna pausa detratta)`);
        }
      } else {
        pausaEffettivaMin = 0;
      }
    }
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

  if (entrataNormMin !== null) {
    const baseCalcolo = Math.min(PARAMETRI.fasciaIngressoFine, entrataNormMin);
    const oreLavoroNecessarie = Math.max(0, oreDovute - oreGiustificateMin);

    if (isVenerdi || isWeekend) {
      uscitaTeoricaMin = entrataNormMin + oreLavoroNecessarie;
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

    if (uscitaPrima1715LunGio && lavoroGrezzoMin < oreDovute) {
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

  const oreTotaliSvolteMin = oreLavorateMin + oreGiustificateMin;

  // 9. Compensazione ritardi con eventuale straordinario (a quarti d'ora) e generazione scopertiOrari esatti
  const uscitaPrimaPalettoLunGio = (!isVenerdi && !isWeekend && ultimaUscitaMin !== null && ultimaUscitaMin < PARAMETRI.uscitaMinimaLunGio);
  const eccedenzaGrezzaMin = uscitaPrimaPalettoLunGio ? pausaConvertitaStraordMin : Math.max(0, oreTotaliSvolteMin - oreDovute);
  const eccedenzaCompensabileQuarti = Math.floor(eccedenzaGrezzaMin / 15) * 15;

  let ritIngrScopertoFinale = infoRitIngresso.scopertoMin;
  let ritPausaScopertoFinale = infoRitPausa.scopertoMin;
  let compUsata = 0;

  if (ritIngrScopertoFinale > 0 && eccedenzaCompensabileQuarti > 0) {
    const c1 = Math.min(ritIngrScopertoFinale, eccedenzaCompensabileQuarti);
    ritIngrScopertoFinale -= c1;
    compUsata += c1;
  }
  if (ritPausaScopertoFinale > 0 && (eccedenzaCompensabileQuarti - compUsata) > 0) {
    const c2 = Math.min(ritPausaScopertoFinale, eccedenzaCompensabileQuarti - compUsata);
    ritPausaScopertoFinale -= c2;
    compUsata += c2;
  }

  const ritardoTotaleNonCoperto = infoRitIngresso.scopertoMin + infoRitPausa.scopertoMin;
  const eccedenzaNettaMin = Math.max(0, eccedenzaGrezzaMin - ritardoTotaleNonCoperto);

  let straordinarioNettoMin = 0;
  if (eccedenzaNettaMin >= PARAMETRI.scattoMinimoStraordinario) {
    straordinarioNettoMin = Math.floor(eccedenzaNettaMin / PARAMETRI.scattoSuccessivoStraordinario) * PARAMETRI.scattoSuccessivoStraordinario;
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

  if (compUsata > 0 && ritIngrScopertoFinale === 0 && ritPausaScopertoFinale === 0) {
    attenzioni.push(`Ritardo compensato (${compUsata} min)`);
  }

  // Minuti oltre l'orario e calcolo prossimo scatto live
  let minutiOltreOrario = eccedenzaNettaMin;
  let minutiAlProssimoScatto = 0;
  let orarioProssimoScatto = null;
  let valoreProssimoScatto = 0;

  if (nowMinutes !== null && entrataNormMin !== null && ultimaUscitaMin === null) {
    if (eccedenzaNettaMin < PARAMETRI.scattoMinimoStraordinario) {
      minutiAlProssimoScatto = PARAMETRI.scattoMinimoStraordinario - eccedenzaNettaMin;
      valoreProssimoScatto = PARAMETRI.scattoMinimoStraordinario;
      orarioProssimoScatto = nowMinutes + minutiAlProssimoScatto;
    } else {
      const step = PARAMETRI.scattoSuccessivoStraordinario;
      const residuoScatto = eccedenzaNettaMin % step;
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
    oreGiustificateMin,
    smartWorkingMin,
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
