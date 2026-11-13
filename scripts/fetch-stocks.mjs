// Daily fetch of Bursa Malaysia large caps + market context into data/stocks.json.
// Runs on GitHub Actions (Node 20+, no dependencies). Source: Yahoo Finance public chart & timeseries endpoints.
import { writeFileSync, mkdirSync } from 'node:fs';

const LIST = [
  ['1155', '马银行', 'Maybank', '银行', '金'], ['1295', '大众银行', 'Public Bank', '银行', '金'], ['1023', '联昌国际', 'CIMB', '银行', '金'],
  ['5819', '丰隆银行', 'Hong Leong Bank', '银行', '金'], ['1082', '丰隆金融', 'HL Financial', '银行', '金'], ['1066', '兴业银行', 'RHB Bank', '银行', '金'],
  ['1015', '大马银行', 'AMMB', '银行', '金'], ['1818', '马交所', 'Bursa Malaysia', '金融', '金'],
  ['5347', '国家能源', 'Tenaga', '电力', '火'], ['6742', '杨忠礼电力', 'YTL Power', '电力', '火'], ['4677', '杨忠礼机构', 'YTL Corp', '综合', '土'],
  ['5225', '综合保健', 'IHH Healthcare', '医疗', '木'], ['5878', 'KPJ 医疗', 'KPJ Healthcare', '医疗', '木'],
  ['5183', '国油化学', 'Petronas Chemicals', '油气化工', '火'], ['6033', '国油气体', 'Petronas Gas', '油气', '火'], ['5681', '国油贸易', 'Petronas Dagangan', '油气零售', '火'], ['7277', '迪讯', 'Dialog', '油气服务', '火'],
  ['8869', '齐力工业', 'Press Metal', '铝业', '金'], ['4197', '森那美', 'Sime Darby', '汽车工业', '金'],
  ['6947', '天地通数码', 'CelcomDigi', '电讯', '水'], ['6012', '明讯', 'Maxis', '电讯', '水'], ['6888', '亚通', 'Axiata', '电讯', '水'], ['4863', '马电讯', 'Telekom', '电讯', '水'],
  ['5211', '双威', 'Sunway', '综合', '土'], ['5398', '金务大', 'Gamuda', '建筑', '土'], ['5249', 'IOI 产业', 'IOI Properties', '房地产', '土'],
  ['1961', 'IOI 集团', 'IOI Corp', '种植', '木'], ['2445', '吉隆坡甲洞', 'KLK', '种植', '木'], ['5285', '森达美种植', 'SD Guthrie', '种植', '木'], ['2089', '联合种植', 'United Plantations', '种植', '木'],
  ['4707', '雀巢', 'Nestle', '消费食品', '水'], ['4065', '玻璃市种植', 'PPB', '消费食品', '土'], ['7084', '全利资源', 'QL Resources', '消费食品', '水'], ['5296', 'MR DIY', 'MR DIY', '零售', '土'],
  ['3816', '国际航运', 'MISC', '航运', '水'], ['5246', '西港', 'Westports', '港口', '水'],
  ['3182', '云顶', 'Genting', '休闲', '火'], ['4715', '云顶大马', 'Genting Malaysia', '休闲', '火'],
  ['0166', '益纳利', 'Inari', '半导体', '火'], ['0128', '华德科', 'Frontken', '半导体', '火'],
  ['5168', '贺特佳', 'Hartalega', '手套', '木'], ['7113', '顶级手套', 'Top Glove', '手套', '木']
];
const MKT = [['^KLSE', '综合指数 KLCI'], ['MYR=X', '美元兑令吉'], ['^GSPC', '美国标普 500'], ['^HSI', '香港恒生指数']];
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; zen-bazi-data/1.0)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const r2 = x => x == null || !isFinite(x) ? null : Math.round(x * 1000) / 1000;

async function get(url) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url, { headers: UA }); if (r.ok) return await r.json(); console.log('HTTP', r.status, url); } catch (e) { console.log('ERR', e.message, url); }
    await sleep(1500 * (i + 1));
  }
  return null;
}
async function chart(sym) {
  const j = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=2y&interval=1d&events=div`);
  const res = j && j.chart && j.chart.result && j.chart.result[0]; if (!res) return null;
  const q = res.indicators.quote[0], t = res.timestamp || [], rows = [];
  for (let i = 0; i < t.length; i++) if (q.close[i] != null) rows.push([new Date(t[i] * 1000).toISOString().slice(0, 10), r2(q.close[i]), q.volume ? q.volume[i] || 0 : 0]);
  const divs = Object.values((res.events && res.events.dividends) || {}).map(d => [new Date(d.date * 1000).toISOString().slice(0, 10), r2(d.amount)]).sort();
  return { cur: res.meta.currency, d: rows.map(x => x[0]), c: rows.map(x => x[1]), v: rows.map(x => x[2]), div: divs };
}
async function fund(sym) {
  const types = ['trailingPeRatio', 'trailingPbRatio', 'trailingMarketCap', 'annualTotalRevenue', 'annualNetIncome', 'annualDilutedEPS', 'annualTotalDebt', 'annualStockholdersEquity'];
  const p2 = Math.floor(Date.now() / 1000), p1 = p2 - 6 * 365 * 86400;
  const j = await get(`https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(sym)}?symbol=${encodeURIComponent(sym)}&type=${types.join(',')}&period1=${p1}&period2=${p2}`);
  const out = {}; const res = j && j.timeseries && j.timeseries.result; if (!res) return out;
  for (const r of res) {
    const k = r.meta && r.meta.type && r.meta.type[0]; if (!k || !r[k]) continue;
    const v = r[k].filter(Boolean).map(x => [x.asOfDate, x.reportedValue && x.reportedValue.raw]).filter(x => x[1] != null).sort();
    if (v.length) out[k] = k.startsWith('trailing') ? v[v.length - 1][1] : v.slice(-4);
  }
  return out;
}

const out = { updated: new Date().toISOString(), source: 'Yahoo Finance', market: {}, stocks: {} };
for (const [sym, name] of MKT) { const c = await chart(sym); if (c) out.market[sym] = { name, ...c }; await sleep(400); }
for (const [code, zh, en, sector, el] of LIST) {
  const sym = code + '.KL', c = await chart(sym); await sleep(400);
  const f = await fund(sym); await sleep(400);
  if (c && c.c.length > 60) out.stocks[code] = { zh, en, sector, el, ...c, f };
  console.log(code, en, c ? c.c.length : 'no chart', Object.keys(f).length, 'fund fields');
}
mkdirSync('data', { recursive: true });
writeFileSync('data/stocks.json', JSON.stringify(out));
console.log('stocks', Object.keys(out.stocks).length, 'market', Object.keys(out.market).length);
if (Object.keys(out.stocks).length < 10) process.exit(1);
