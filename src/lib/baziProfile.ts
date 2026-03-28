import mystilight from 'mystilight-8char';
import type { EightCharJSON, GetCurrentEightCharJSONOpts } from 'mystilight-8char';
import { getCityLongitude, calculateTrueSolarTime, formatTimeCorrection } from './cityLongitudes';

const { getCurrentEightCharJSON } = mystilight as unknown as {
  getCurrentEightCharJSON: (opts: GetCurrentEightCharJSONOpts) => EightCharJSON;
};

/** 详细排盘信息 */
export interface BaziSummaryForPrompt {
  // 基本信息
  pillars: string;
  dayMaster: string;
  // 出生地
  birthPlace?: string;
  // 真太阳时校正信息
  solarTimeCorrection?: string;
  correctedTime?: string;
  // 四柱详细
  yearPillar: { gan: string; zhi: string };
  monthPillar: { gan: string; zhi: string };
  dayPillar: { gan: string; zhi: string };
  hourPillar: { gan: string; zhi: string };
  // 五行
  wuXingPower: Record<string, number>;
  // 大运流年
  currentDaYun: string | null;
  currentDaYunGanZhi: string | null;
  currentLiuNian: string | null;
  currentLiuNianGanZhi: string | null;
  // 分析
  xiYongShenHints: string[];
  yunStart: string;
}

function pillarLine(p: EightCharJSON['pillars']): string {
  return `年${p.year.gan}${p.year.zhi} 月${p.month.gan}${p.month.zhi} 日${p.day.gan}${p.day.zhi} 时${p.time.gan}${p.time.zhi}`;
}

export function computeBaziSummary(
  birth: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
    gender: 0 | 1;
    sect: 1 | 2;
    yunSect: 1 | 2;
    birthPlace?: {
      province: string;
      city: string;
    };
  },
  now = new Date(),
): BaziSummaryForPrompt {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();

  // 真太阳时校正
  let correctedHour = birth.hour;
  let correctedMinute = birth.minute;
  let correctedSecond = birth.second;
  let solarTimeCorrection: string | undefined;
  let correctedTime: string | undefined;
  let longitude: number | null = null;

  if (birth.birthPlace) {
    longitude = getCityLongitude(birth.birthPlace.province, birth.birthPlace.city);
    if (longitude !== null) {
      const corrected = calculateTrueSolarTime(
        longitude,
        birth.hour,
        birth.minute,
        birth.second,
      );
      correctedHour = corrected.hour;
      correctedMinute = corrected.minute;
      correctedSecond = corrected.second;

      solarTimeCorrection = formatTimeCorrection(
        longitude,
        birth.hour,
        birth.minute,
        correctedHour,
        correctedMinute,
      );
      correctedTime = `${String(correctedHour).padStart(2, '0')}:${String(correctedMinute).padStart(2, '0')}`;
    }
  }

  const ec = getCurrentEightCharJSON({
    year: birth.year,
    month: birth.month,
    day: birth.day,
    hour: correctedHour,
    minute: correctedMinute,
    second: correctedSecond,
    gender: birth.gender,
    sect: birth.sect,
    yunSect: birth.yunSect,
    currentYear,
    currentMonth,
    currentDay,
  }) as EightCharJSON;

  const dm = ec.pillars.dayMasterGan ?? ec.pillars.day.gan;
  const dy = ec.currentYun?.daYun;
  const ln = ec.currentYun?.liuNian;

  const currentDaYun = dy
    ? `${dy.ganZhi[0]}${dy.ganZhi[1]}（约 ${dy.startYear}-${dy.endYear}）`
    : null;
  const currentDaYunGanZhi = dy ? `${dy.ganZhi[0]}${dy.ganZhi[1]}` : null;
  const currentLiuNian = ln ? `${ln.ganZhi[0]}${ln.ganZhi[1]}（${ln.year}）` : null;
  const currentLiuNianGanZhi = ln ? `${ln.ganZhi[0]}${ln.ganZhi[1]}` : null;

  // 构建出生地信息
  const birthPlaceStr = birth.birthPlace
    ? `${birth.birthPlace.province}${birth.birthPlace.city ? ' ' + birth.birthPlace.city : ''}`
    : undefined;

  return {
    pillars: pillarLine(ec.pillars),
    dayMaster: dm,
    birthPlace: birthPlaceStr,
    solarTimeCorrection,
    correctedTime,
    yearPillar: { gan: ec.pillars.year.gan, zhi: ec.pillars.year.zhi },
    monthPillar: { gan: ec.pillars.month.gan, zhi: ec.pillars.month.zhi },
    dayPillar: { gan: ec.pillars.day.gan, zhi: ec.pillars.day.zhi },
    hourPillar: { gan: ec.pillars.time.gan, zhi: ec.pillars.time.zhi },
    wuXingPower: ec.wuXingPower as Record<string, number>,
    currentDaYun,
    currentDaYunGanZhi,
    currentLiuNian,
    currentLiuNianGanZhi,
    xiYongShenHints: ec.analysis?.XiYongShen ?? [],
    yunStart: ec.yun?.startSolar ?? '',
  };
}

export function formatBaziSummaryForLlm(s: BaziSummaryForPrompt): string {
  const wx = Object.entries(s.wuXingPower)
    .map(([k, v]) => `${k}:${v}`)
    .join(', ');
  return [
    `四柱：${s.pillars}`,
    `日主：${s.dayMaster}`,
    `五行力量：${wx}`,
    s.currentDaYun ? `当前大运：${s.currentDaYun}` : '',
    s.currentLiuNian ? `流年：${s.currentLiuNian}` : '',
    s.xiYongShenHints.length ? `喜用神提示：${s.xiYongShenHints.join('；')}` : '',
    s.yunStart ? `起运：${s.yunStart}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** 生成详细的排盘文本（用于用户画像展示） */
export function formatBaziDetailText(s: BaziSummaryForPrompt): string {
  const sortedWx = Object.entries(s.wuXingPower).sort((a, b) => b[1] - a[1]);

  const parts: string[] = [];

  // 排盘信息
  parts.push(`【排盘信息】`);
  parts.push(`日主：${s.dayMaster}`);
  parts.push(`四柱：${s.pillars}`);
  parts.push(`年柱：${s.yearPillar.gan}${s.yearPillar.zhi} | 月柱：${s.monthPillar.gan}${s.monthPillar.zhi}`);
  parts.push(`日柱：${s.dayPillar.gan}${s.dayPillar.zhi} | 时柱：${s.hourPillar.gan}${s.hourPillar.zhi}`);
  if (s.birthPlace) {
    parts.push(`出生地：${s.birthPlace}`);
  }
  if (s.solarTimeCorrection) {
    parts.push(`真太阳时：${s.solarTimeCorrection}`);
  }
  if (s.correctedTime) {
    parts.push(`校正后时辰：${s.correctedTime}`);
  }

  // 五行力量
  const wxDesc = sortedWx.map(([k, v]) => {
    const level = v >= 35 ? '旺' : v >= 25 ? '相' : v >= 15 ? '休' : '弱';
    return `${k}${v}%(${level})`;
  }).join('、');
  parts.push(`【五行力量】${wxDesc}`);

  // 大运流年
  if (s.currentDaYun || s.currentLiuNian) {
    parts.push(`【运程】`);
    if (s.currentDaYun) parts.push(`大运：${s.currentDaYun}`);
    if (s.currentLiuNian) parts.push(`流年：${s.currentLiuNian}`);
  }

  // 喜用神
  if (s.xiYongShenHints.length > 0) {
    parts.push(`【喜用神】${s.xiYongShenHints.join('；')}`);
  }

  // 起运时间
  if (s.yunStart) {
    parts.push(`【起运】${s.yunStart}`);
  }

  return parts.join('\n');
}
