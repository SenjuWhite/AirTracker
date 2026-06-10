// Єдине джерело порогів небезпеки газів та кольорової логіки.
// Колір ніде не зберігається — він завжди рахується з концентрацій,
// тому зміна порогів автоматично перемальовує і живі дані, і архів.

export const GAS_CONFIG = {
  co2:     { warn: 16000, danger: 24000, label: "CO2" },
  ch4:     { warn: 300,   danger: 500,   label: "CH4" },
  co:      { warn: 25,    danger: 50,    label: "CO" },
  alcohol: { warn: 50,    danger: 100,   label: "Alcohol" },
  nh3:     { warn: 15,    danger: 30,    label: "NH3" },
};

// 0 — безпечно (зелений), 1 — попередження (помаранчевий), 2 — небезпека (червоний)
export const LEVEL_COLOR = ["#10b981", "#f97316", "#ef4444"];

// Дістає п'ять значень газів зі структури sensors.gases (mq4 / mq135).
export function extractGasValues(gases) {
  if (!gases) return { co2: 0, ch4: 0, co: 0, alcohol: 0, nh3: 0 };
  return {
    co2:     gases.mq135?.co2 ?? 0,
    ch4:     gases.mq4?.ch4 ?? 0,
    co:      gases.mq135?.co ?? 0,
    alcohol: gases.mq135?.alcohol ?? 0,
    nh3:     gases.mq135?.nh3 ?? 0,
  };
}

// Рівень небезпеки одного газу за його власними порогами.
export function gasLevel(id, value) {
  const c = GAS_CONFIG[id];
  if (!c) return 0;
  if (value >= c.danger) return 2;
  if (value >= c.warn) return 1;
  return 0;
}

// Найгірший рівень серед усіх п'яти газів.
export function worstLevel(gases) {
  const vals = extractGasValues(gases);
  let worst = 0;
  for (const id of Object.keys(GAS_CONFIG)) {
    const lvl = gasLevel(id, vals[id]);
    if (lvl > worst) worst = lvl;
  }
  return worst;
}
