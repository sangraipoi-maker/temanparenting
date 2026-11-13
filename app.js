// app.js — logika sisi klien TemanParenting.
// Data (materi, artikel, kuis) dibaca dari Firestore. Tanpa login,
// tanpa pengumpulan data pengguna — sama seperti prototipe.
// Firebase JS SDK v10 (modular) dimuat dari CDN; tidak ada build step,
// jadi file ini bisa langsung dibuka lewat server lokal / Firebase Hosting.
// Fungsi yang dipakai onclick inline di HTML diekspos ke window di akhir
// file, karena module script tidak membuat fungsi jadi global.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, getDocs, doc, getDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// Sitasi sumber seluruh isi materi/artikel (Santrock 2018) — sama seperti prototipe.
export const SUMBER_SITASI = "Santrock, J. W. (2018). A Topical Approach to Life-Span Development (9th ed.). McGraw-Hill Education.";

const DOMAIN_LIST = ["Fisik", "Kognitif", "Sosioemosional", "Keluarga & Pengasuhan"];
const AGE_META = {
  "0-5": { label: "Balita · 0–5 tahun", cls: "badge-05" },
  "6-12": { label: "Anak · 6–12 tahun", cls: "badge-612" },
  "13-18": { label: "Remaja · 13–18 tahun", cls: "badge-1318" },
};
// Materi & artikel pilihan di beranda — sama seperti prototipe.
const FEATURED_MATERI = ["m1", "m6", "m12"];
const FEATURED_ARTIKEL = ["a1", "a3", "a6"];

let db = null;
const cache = {};

export function configReady() {
  return Boolean(firebaseConfig.apiKey);
}

function getDb() {
  if (!db) {
    initializeApp(firebaseConfig);
    db = getFirestore();
  }
  return db;
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function configNoticeHTML() {
  return '<div class="empty-state" style="display:block"><strong>Konfigurasi Firebase belum diisi.</strong> '
    + "Isi dulu <code>firebase-config.js</code> dengan config dari Firebase Console "
    + "(Project settings &gt; Your apps &gt; Web app). Caranya ada di README.md.</div>";
}

function errorHTML(msg) {
  return '<div class="empty-state" style="display:block"><strong>Gagal memuat data.</strong> ' + esc(msg) + "</div>";
}

async function loadCollection(name) {
  if (cache[name]) return cache[name];
  const snap = await getDocs(collection(getDb(), name));
  const items = [];
  snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
  // Urutan tampil mengikuti field "order" (urutan di prototipe).
  items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  cache[name] = items;
  return items;
}

async function loadQuiz() {
  if (cache.quiz) return cache.quiz;
  const snap = await getDoc(doc(getDb(), "quiz", "refleksi"));
  if (!snap.exists()) throw new Error('Dokumen "quiz/refleksi" tidak ditemukan di Firestore. Jalankan tools/seed.mjs dulu (lihat README.md).');
  cache.quiz = snap.data();
  return cache.quiz;
}

function badgeHTML(usia) {
  const m = AGE_META[usia] || { label: usia, cls: "" };
  return '<span class="badge-age ' + m.cls + '">' + esc(m.label) + "</span>";
}

function materiCard(m) {
  return '<button class="mcard" onclick="location.href=\'materi-detail.html?id=' + m.id + '\'">'
    + '<img src="' + esc(m.img) + '" alt="' + esc(m.alt) + '" />'
    + '<span class="body">'
    + '<span class="meta-row">' + badgeHTML(m.usia) + '<span class="badge-tema">' + esc(m.domain) + "</span></span>"
    + "<h3>" + esc(m.judul) + "</h3>"
    + "<p>" + esc(m.ringkas) + "</p>"
    + '<span class="meta-foot"><span>' + esc(m.durasi) + ' baca</span><span>Level ' + esc(m.level) + '</span><span class="read">Pelajari \u2192</span></span>'
    + "</span></button>";
}

function artikelCard(a) {
  return '<button class="acard" onclick="location.href=\'artikel-detail.html?id=' + a.id + '\'">'
    + '<img src="' + esc(a.img) + '" alt="' + esc(a.alt) + '" />'
    + '<span class="body">'
    + '<span class="meta-row"><span class="badge-tema" style="color:var(--peach-dark);font-weight:800">' + esc(a.kategori).toUpperCase() + '</span><span class="badge-tema">' + esc(a.usia) + "</span></span>"
    + "<h3>" + esc(a.judul) + "</h3>"
    + "<p>" + esc(a.excerpt) + "</p>"
    + '<span class="meta-foot"><span>' + esc(a.menit) + ' baca</span><span class="read">Baca \u2192</span></span>'
    + "</span></button>";
}

/* ---------------- beranda ---------------- */
export async function initBeranda() {
  const fm = document.getElementById("featured-materi");
  const fa = document.getElementById("featured-artikel");
  const qb = document.getElementById("quiz-box");
  if (!configReady()) {
    if (fm) fm.innerHTML = configNoticeHTML();
    if (fa) fa.innerHTML = configNoticeHTML();
    if (qb) qb.innerHTML = configNoticeHTML();
    return;
  }
  try {
    const [mats, arts] = await Promise.all([loadCollection("materials"), loadCollection("articles")]);
    const byId = (list, id) => list.find((x) => x.id === id);
    if (fm) fm.innerHTML = FEATURED_MATERI.map((id) => byId(mats, id)).filter(Boolean).map(materiCard).join("");
    if (fa) fa.innerHTML = FEATURED_ARTIKEL.map((id) => byId(arts, id)).filter(Boolean).map(artikelCard).join("");
  } catch (e) {
    if (fm) fm.innerHTML = errorHTML(e.message);
    if (fa) fa.innerHTML = errorHTML(e.message);
  }
  if (qb) {
    quizBoxEl = qb;
    try {
      quizData = await loadQuiz();
      renderQuiz(qb);
    } catch (e) {
      qb.innerHTML = errorHTML(e.message);
    }
  }
}

/* ---------------- daftar materi (filter + cari) ---------------- */
let curAge = "semua";
let curDomain = "semua";
let materiData = [];

export async function initMateriList() {
  const grid = document.getElementById("materi-grid");
  if (!configReady()) { grid.innerHTML = configNoticeHTML(); return; }
  try {
    materiData = await loadCollection("materials");
    const usiaParam = new URLSearchParams(location.search).get("usia");
    if (usiaParam && (usiaParam === "semua" || AGE_META[usiaParam])) curAge = usiaParam;
    document.querySelectorAll("[data-age]").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-age") === curAge);
    });
    renderTemaChips();
    renderMateri();
  } catch (e) {
    grid.innerHTML = errorHTML(e.message);
  }
}

function renderTemaChips() {
  let html = '<button class="chip' + (curDomain === "semua" ? " active" : "") + '" onclick="setDomainFilter(\'semua\')">Semua Domain</button>';
  DOMAIN_LIST.forEach(function (d) {
    html += '<button class="chip' + (curDomain === d ? " active" : "") + '" onclick="setDomainFilter(\'' + d + '\')">' + d + "</button>";
  });
  document.getElementById("tema-chips").innerHTML = html;
}

export function setAgeFilter(age) {
  curAge = age;
  document.querySelectorAll("[data-age]").forEach(function (b) {
    b.classList.toggle("active", b.getAttribute("data-age") === age);
  });
  renderMateri();
}

export function setDomainFilter(d) {
  curDomain = d;
  renderTemaChips();
  renderMateri();
}

export function renderMateri() {
  const q = (document.getElementById("materi-search").value || "").toLowerCase().trim();
  const list = materiData.filter(function (m) {
    if (curAge !== "semua" && m.usia !== curAge) return false;
    if (curDomain !== "semua" && m.domain !== curDomain) return false;
    if (q) {
      const hay = (m.judul + " " + m.ringkas + " " + m.domain + " " + m.tahap + " " + m.bab).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });
  document.getElementById("materi-grid").innerHTML = list.map(materiCard).join("");
  document.getElementById("materi-empty").style.display = list.length ? "none" : "block";
  document.getElementById("materi-info").textContent =
    "Menampilkan " + list.length + " dari " + materiData.length + " materi · Seluruh materi bersumber dari Santrock (2018), A Topical Approach to Life-Span Development (9th ed.).";
}

/* ---------------- detail materi ---------------- */
export async function initMateriDetail() {
  const wrap = document.getElementById("materi-detail-content");
  if (!configReady()) { wrap.innerHTML = configNoticeHTML(); return; }
  const id = new URLSearchParams(location.search).get("id");
  try {
    const all = await loadCollection("materials");
    const m = all.find((x) => x.id === id);
    if (!m) {
      wrap.innerHTML = '<div class="empty-state" style="display:block"><strong>Materi tidak ditemukan.</strong> <a href="materi.html">Kembali ke Daftar Materi</a></div>';
      return;
    }
    const goals = m.tujuan.map((t) => "<li>" + esc(t) + "</li>").join("");
    const isi = m.isi.map((p) => "<p>" + esc(p) + "</p>").join("");
    // Langkah praktik mengandung <strong> dari data seed — ditampilkan apa adanya (seperti prototipe).
    const steps = m.praktik.map((s) => "<li>" + s + "</li>").join("");
    const say = m.kalimat.map((k) =>
      '<div class="say-row ' + k.tipe + '"><span class="tag">' + (k.tipe === "good" ? "Katakan" : "Hindari") + '</span><span class="txt">' + esc(k.teks) + "</span></div>"
    ).join("");
    const refl = m.refleksi.map((r) => "<li>" + esc(r) + "</li>").join("");
    const related = all.filter((x) => x.usia === m.usia && x.id !== m.id).slice(0, 2);
    const relHTML = related.length
      ? '<h2>Materi lain untuk usia ini</h2><div class="card-grid" style="grid-template-columns:1fr 1fr">' + related.map(materiCard).join("") + "</div>"
      : "";
    wrap.innerHTML =
      '<div class="detail-head">'
      + '<button class="back-btn" onclick="location.href=\'materi.html\'">\u2190 Kembali ke Daftar Materi</button>'
      + '<div class="meta-row">' + badgeHTML(m.usia) + '<span class="badge-tema">' + esc(m.domain) + " · " + esc(m.tahap) + "</span></div>"
      + '<h1 class="detail-title">' + esc(m.judul) + "</h1>"
      + '<p class="detail-lead">' + esc(m.ringkas) + "</p>"
      + '<div class="meta-row" style="margin-top:10px"><span class="badge-tema">' + esc(m.durasi) + " baca · Level " + esc(m.level) + " · Sumber: " + esc(m.bab) + "</span></div>"
      + '<div class="detail-hero"><img src="' + esc(m.img) + '" alt="' + esc(m.alt) + '" /></div>'
      + "</div>"
      + '<div class="detail-grid"><div class="detail-body">'
      + '<h2>Tujuan pembelajaran</h2><ul class="goals">' + goals + '</ul>'
      + "<h2>Isi materi</h2>" + isi
      + '<h2>Coba praktikkan</h2><ol class="steps">' + steps + '</ol>'
      + '<h2>Contoh kalimat</h2><div class="say-box">' + say + '</div>'
      + relHTML
      + "</div>"
      + '<aside><div class="side-card"><h3>Refleksi untuk orang tua</h3><ul>' + refl + "</ul>"
      + '<div class="fact"><strong>Catatan Santrock</strong>' + esc(m.fakta) + "</div>"
      + '<div class="fact" style="margin-top:10px"><strong>Sumber materi</strong>' + esc(SUMBER_SITASI) + " — " + esc(m.bab) + ".</div>"
      + "</div></aside></div>";
  } catch (e) {
    wrap.innerHTML = errorHTML(e.message);
  }
}

/* ---------------- daftar artikel ---------------- */
export async function initArtikelList() {
  const grid = document.getElementById("artikel-grid");
  if (!configReady()) { grid.innerHTML = configNoticeHTML(); return; }
  try {
    const arts = await loadCollection("articles");
    grid.innerHTML = arts.map(artikelCard).join("");
  } catch (e) {
    grid.innerHTML = errorHTML(e.message);
  }
}

/* ---------------- detail artikel ---------------- */
export async function initArtikelDetail() {
  const wrap = document.getElementById("artikel-detail-content");
  if (!configReady()) { wrap.innerHTML = configNoticeHTML(); return; }
  const id = new URLSearchParams(location.search).get("id");
  try {
    const all = await loadCollection("articles");
    const a = all.find((x) => x.id === id);
    if (!a) {
      wrap.innerHTML = '<div class="empty-state" style="display:block"><strong>Artikel tidak ditemukan.</strong> <a href="artikel.html">Kembali ke Daftar Artikel</a></div>';
      return;
    }
    const body = a.body.map((p) => "<p>" + esc(p) + "</p>").join("");
    const tips = a.tips.map((t) => "<li>" + esc(t) + "</li>").join("");
    const others = all.filter((x) => x.id !== a.id).slice(0, 2);
    wrap.innerHTML =
      '<div class="detail-head">'
      + '<button class="back-btn" onclick="location.href=\'artikel.html\'">\u2190 Kembali ke Daftar Artikel</button>'
      + '<div class="meta-row"><span class="badge-tema" style="color:var(--peach-dark);font-weight:800">' + esc(a.kategori).toUpperCase() + '</span><span class="badge-tema">' + esc(a.usia) + " · " + esc(a.menit) + " baca</span></div>"
      + '<h1 class="detail-title">' + esc(a.judul) + "</h1>"
      + '<p class="detail-lead">' + esc(a.excerpt) + "</p>"
      + '<div class="detail-hero"><img src="' + esc(a.img) + '" alt="' + esc(a.alt) + '" /></div>'
      + "</div>"
      + '<div class="detail-grid"><div class="detail-body">' + body
      + '<div class="tips-box"><h3>Tips yang bisa langsung dicoba</h3><ul>' + tips + "</ul></div>"
      + "</div>"
      + '<aside><div class="side-card"><h3>Artikel lainnya</h3>'
      + others.map((o) =>
        '<p style="margin-bottom:12px"><a href="artikel-detail.html?id=' + o.id + '" style="font-weight:700;text-decoration:none">' + esc(o.judul) + '</a><br /><small style="color:var(--muted)">' + esc(o.menit) + " baca · " + esc(o.bab) + "</small></p>"
      ).join("")
      + '<div class="fact"><strong>Sumber artikel</strong>' + esc(SUMBER_SITASI) + " — " + esc(a.bab) + ".</div>"
      + "</div></aside></div>";
  } catch (e) {
    wrap.innerHTML = errorHTML(e.message);
  }
}

/* ---------------- kuis refleksi ---------------- */
let quizData = null;
let quizIdx = 0;
let quizAnswers = [];
let quizBoxEl = null;

export async function initQuizPage() {
  const box = document.getElementById("quiz-box");
  quizBoxEl = box;
  if (!configReady()) { box.innerHTML = configNoticeHTML(); return; }
  try {
    quizData = await loadQuiz();
    renderQuiz(box);
  } catch (e) {
    box.innerHTML = errorHTML(e.message);
  }
}

function renderQuiz(box) {
  if (quizIdx >= quizData.questions.length) { renderQuizResult(box); return; }
  const item = quizData.questions[quizIdx];
  const pct = Math.round((quizIdx / quizData.questions.length) * 100);
  const opts = item.opts.map(function (o, i) {
    const picked = quizAnswers[quizIdx] === i ? " picked" : "";
    return '<button class="quiz-opt' + picked + '" onclick="pickQuiz(' + i + ')">' + esc(o.t) + "</button>";
  }).join("");
  const canNext = typeof quizAnswers[quizIdx] === "number";
  box.innerHTML =
    '<div class="quiz-progress"><i style="width:' + pct + '%"></i></div>'
    + '<p class="q-count">Situasi ' + (quizIdx + 1) + " dari " + quizData.questions.length + "</p>"
    + "<h3>" + esc(item.q) + "</h3>"
    + opts
    + '<div class="quiz-nav">'
    + (quizIdx > 0 ? '<button class="btn btn-ghost" onclick="quizBack()">\u2190 Sebelumnya</button>' : "<span></span>")
    + '<button class="btn btn-primary" ' + (canNext ? "" : 'disabled style="opacity:.45"') + ' onclick="quizNext()">' + (quizIdx === quizData.questions.length - 1 ? "Lihat Hasil" : "Berikutnya \u2192") + "</button>"
    + "</div>";
}

export function pickQuiz(i) { quizAnswers[quizIdx] = i; renderQuiz(quizBoxEl); }
export function quizBack() { if (quizIdx > 0) { quizIdx--; renderQuiz(quizBoxEl); } }
export function quizNext() {
  if (typeof quizAnswers[quizIdx] !== "number") return;
  quizIdx++; renderQuiz(quizBoxEl);
}
export function restartQuiz() { quizIdx = 0; quizAnswers = []; renderQuiz(quizBoxEl); }

function renderQuizResult(box) {
  let score = 0;
  quizData.questions.forEach(function (item, i) {
    const a = quizAnswers[i];
    if (typeof a === "number") score += item.opts[a].s;
  });
  let res = quizData.results[quizData.results.length - 1];
  quizData.results.forEach(function (r) { if (score >= r.min && score <= r.max) res = r; });
  box.innerHTML =
    '<div class="quiz-result"><div class="quiz-progress"><i style="width:100%"></i></div>'
    + '<p class="q-count">Hasil refleksi · Skor ' + score + " dari 10</p>"
    + "<h3>" + esc(res.judul) + "</h3>"
    + "<p>" + esc(res.teks) + "</p>"
    + '<p style="font-size:.85rem;color:var(--muted)">Hasil ini adalah bahan refleksi umum untuk prototipe, bukan penilaian atau diagnosis. Kerangka pola respons mengikuti pembahasan pola asuh dalam Santrock (2018, Bab 14).</p>'
    + '<button class="btn btn-ghost" onclick="restartQuiz()">Ulangi Kuis</button> '
    + '<button class="btn btn-primary" onclick="location.href=\'materi.html\'">Pelajari Materinya</button>'
    + "</div>";
}

// Diekspos ke window agar onclick inline di HTML bisa memanggilnya
// (situs ini tanpa build step; module script tidak membuat fungsi global).
window.setAgeFilter = setAgeFilter;
window.setDomainFilter = setDomainFilter;
window.renderMateri = renderMateri;
window.pickQuiz = pickQuiz;
window.quizBack = quizBack;
window.quizNext = quizNext;
window.restartQuiz = restartQuiz;
