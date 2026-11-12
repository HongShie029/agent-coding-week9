// 결정적(같은 입력 → 같은 출력) 난수 도구. Math.random 은 쓰지 않는다.
function hash(...nums) {
  let h = 2166136261 >>> 0;
  for (const n of nums) {
    h ^= (Math.floor(n) | 0) + 0x9e3779b9;
    h = Math.imul(h, 16777619) >>> 0;
    h ^= h >>> 15;
  }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rngFor = (...key) => mulberry32(hash(...key));
function gauss(r) {
  let u = 0;
  while (u === 0) u = r();
  const v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function poisson(r, lambda) {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= r(); } while (p > L);
  return k - 1;
}
// 이항분포 근사: 평균이 작으면 포아송, 크면 정규 근사
function binom(r, n, p) {
  if (n <= 0 || p <= 0) return 0;
  if (p >= 1) return n;
  const mean = n * p;
  if (mean < 15) return Math.min(n, poisson(r, mean));
  const sd = Math.sqrt(n * p * (1 - p));
  return Math.max(0, Math.min(n, Math.round(mean + sd * gauss(r))));
}
module.exports = { hash, mulberry32, rngFor, gauss, poisson, binom };
