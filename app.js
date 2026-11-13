// app.js — logika sisi klien TemanParenting.
// Data (materi, artikel, kuis) dibaca dari Firestore. Tanpa login,
// tanpa pengumpulan data pengguna.
// Firebase JS SDK v10 (modular) dimuat dari CDN; tidak ada build step,
// jadi file ini bisa langsung dibuka lewat server lokal / Firebase Hosting.
// Fungsi yang dipakai onclick inline di HTML diekspos ke window di akhir
// file, karena module script tidak membuat fungsi jadi global.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, getDocs, doc, getDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// Sitasi sumber seluruh isi materi/artikel (Santrock 2018).
export const SUMBER_SITASI = "Santrock, J. W. (2018). A Topical Approach to Life-Span Development (9th ed.). McGraw-Hill Education.";

const DOMAIN_LIST = ["Fisik", "Kognitif", "Sosioemosional", "Keluarga & Pengasuhan"];
const AGE_META = {
  "0-5": { label: "Balita · 0–5 tahun", cls: "badge-05" },
  "6-12": { label: "Anak · 6–12 tahun", cls: "badge-612" },
  "13-18": { label: "Remaja · 13–18 tahun", cls: "badge-1318" },
};
// Materi & artikel pilihan di beranda.
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
  // Urutan tampil mengikuti field "order".
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
    refreshReveals();
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
  refreshReveals();
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
    // Langkah praktik mengandung <strong> dari data seed — ditampilkan apa adanya.
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
    refreshReveals();
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
    refreshReveals();
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
    refreshReveals();
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
    + '<p style="font-size:.85rem;color:var(--muted)">Hasil ini adalah bahan refleksi umum, bukan penilaian atau diagnosis. Kerangka pola respons mengikuti pembahasan pola asuh dalam Santrock (2018, Bab 14).</p>'
    + '<button class="btn btn-ghost" onclick="restartQuiz()">Ulangi Kuis</button> '
    + '<button class="btn btn-primary" onclick="location.href=\'materi.html\'">Pelajari Materinya</button>'
    + "</div>";
}


/* ---------------- chrome bersama: menu burger + newsletter ---------------- */
export function initChrome() {
  const burger = document.getElementById("burger");
  const menu = document.getElementById("mobileMenu");
  if (burger && menu) {
    burger.addEventListener("click", function () {
      const open = menu.classList.toggle("open");
      burger.setAttribute("aria-expanded", open ? "true" : "false");
      burger.setAttribute("aria-label", open ? "Tutup menu" : "Buka menu");
    });
    menu.addEventListener("click", function (e) {
      if (e.target.closest("a") || e.target.closest("[data-ask-open]")) {
        menu.classList.remove("open");
        burger.setAttribute("aria-expanded", "false");
        burger.setAttribute("aria-label", "Buka menu");
      }
    });
  }
  const newsForm = document.getElementById("newsForm");
  if (newsForm) {
    newsForm.addEventListener("submit", function (e) {
      e.preventDefault();
      const email = document.getElementById("newsEmail").value.trim();
      if (!email) return;
      const subject = encodeURIComponent("Daftar kabar TemanParenting");
      const body = encodeURIComponent("Halo TemanParenting,\n\nSaya ingin menerima kabar materi dan artikel baru.\nEmail saya: " + email + "\n\nTerima kasih.");
      window.location.href = "mailto:halo@temanparenting.my.id?subject=" + subject + "&body=" + body;
    });
  }
}

/* ---------------- animasi scroll ala iMotions ---------------- */
let scrollFXReady = false;
let revealObserver = null;

export function initScrollFX() {
  if (scrollFXReady) return;
  scrollFXReady = true;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const progressBar = document.getElementById("scrollProgress");
  const heroImgEl = document.getElementById("heroImg");
  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      const st = window.scrollY || document.documentElement.scrollTop;
      const h = document.documentElement.scrollHeight - window.innerHeight;
      if (progressBar && h > 0) progressBar.style.width = (st / h * 100) + "%";
      if (heroImgEl && !reduced && st < 900) {
        heroImgEl.style.transform = "translateY(" + (st * 0.045) + "px) scale(1.04)";
      }
      ticking = false;
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Tanpa IntersectionObserver / reduced motion: semua langsung terlihat.
  if (reduced || !("IntersectionObserver" in window)) return;

  revealObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        entry.target.querySelectorAll("[data-count]").forEach(runCount);
        if (entry.target.hasAttribute("data-count")) runCount(entry.target);
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.14, rootMargin: "0px 0px -6% 0px" });

  function runCount(el) {
    if (el._counted) return;
    el._counted = true;
    const target = parseFloat(el.getAttribute("data-count"));
    const decimals = el.getAttribute("data-decimals") ? parseInt(el.getAttribute("data-decimals"), 10) : 0;
    const start = performance.now();
    function step(ts) {
      const p = Math.min((ts - start) / 1100, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = (target * eased).toFixed(decimals).replace(".", ",");
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = target.toFixed(decimals).replace(".", ",");
    }
    requestAnimationFrame(step);
  }

  function mark(selector, cls, stagger) {
    document.querySelectorAll(selector).forEach(function (el, idx) {
      if (el.classList.contains("reveal") || el.classList.contains("reveal-left")
        || el.classList.contains("reveal-right") || el.classList.contains("reveal-scale")) return;
      el.classList.add(cls || "reveal");
      if (stagger) el.style.setProperty("--d", ((idx % 5) * 0.09) + "s");
      revealObserver.observe(el);
    });
  }

  mark(".sec-head", "reveal", false);
  mark(".intro-media", "reveal-scale", false);
  mark(".stat", "reveal", true);
  mark(".insight-card", "reveal", true);
  mark(".age-card", "reveal", true);
  mark(".pr-item", "reveal", false);
  mark(".mcard", "reveal", true);
  mark(".acard", "reveal", true);
  mark(".aud-card", "reveal", true);
  mark(".finding", "reveal", true);
  mark(".quiz-band", "reveal-scale", false);
  mark(".quiz-box", "reveal-scale", false);
  mark(".ask-wrap", "reveal-scale", false);
  mark(".news-grid > div", "reveal", true);
  mark(".page-head", "reveal", false);
  mark(".detail-head", "reveal", false);
  mark(".side-card", "reveal", false);
  mark(".method-card", "reveal", true);
  mark("footer .foot-grid > *", "reveal", true);
  mark(".quote-sec blockquote", "reveal", false);
}

// Dipanggil setelah konten dinamis (kartu materi/artikel, detail) dirender.
export function refreshReveals() {
  if (!revealObserver) return;
  document.querySelectorAll(".mcard, .acard, .age-card").forEach(function (el, idx) {
    if (el.dataset.observed) return;
    el.dataset.observed = "1";
    el.classList.add("reveal");
    el.style.setProperty("--d", ((idx % 5) * 0.07) + "s");
    revealObserver.observe(el);
  });
  document.querySelectorAll(".detail-head, .detail-grid, .side-card").forEach(function (el) {
    if (el.dataset.observed) return;
    el.dataset.observed = "1";
    el.classList.add("reveal");
    revealObserver.observe(el);
  });
}

/* ---------------- tab sorotan hero (beranda) ---------------- */
export function initHeroTabs() {
  const tabsUl = document.getElementById("heroTabs");
  if (!tabsUl) return;
  const slides = [
    { kicker: "Website Edukasi Pengasuhan",
      title: "Menemukan arah pengasuhan, satu tahap tumbuh kembang dalam satu waktu",
      sub: "TemanParenting merangkum ilmu perkembangan anak usia 0–18 tahun menjadi materi singkat yang bisa dibaca di sela kesibukan — dengan prioritas pada masa balita 0–5 tahun.",
      img: "assets/img/hero-reading.jpg",
      alt: "Seorang ibu membacakan buku cerita kepada balitanya di sofa rumah",
      badge: "12 materi siap dibaca", badgeSub: "Disusun dari Santrock (2018) & hasil survei kebutuhan",
      tab: "Materi per tahap usia 0–18 tahun", cta: "Jelajahi Materi", href: "materi.html" },
    { kicker: "Kuis Refleksi",
      title: "Lima pertanyaan untuk bercermin sebagai orang tua",
      sub: "Refleksi singkat tentang kebiasaan pengasuhan Anda — tanpa skor yang menghakimi, dilengkapi saran materi lanjutan yang paling relevan.",
      img: "assets/img/mother-teen.jpg",
      alt: "Ibu berbincang hangat dengan putri remajanya",
      badge: "5 soal refleksi", badgeSub: "Selesai dalam waktu kurang dari dua menit",
      tab: "Refleksi pola asuh Anda", cta: "Mulai Kuis Refleksi", href: "kuis.html" },
    { kicker: "Artikel Pendamping",
      title: "Cerita dan sudut pandang baru, dibaca dalam lima menit",
      sub: "Enam artikel pendek menemani materi utama: dari memasak bersama anak sampai mendampingi remaja yang mulai mencari ruang sendiri.",
      img: "assets/img/family-cooking.jpg",
      alt: "Keluarga menyiapkan makanan bersama di dapur",
      badge: "6 artikel pendek", badgeSub: "Pendamping materi utama TemanParenting",
      tab: "Artikel pendek", cta: "Baca Artikel", href: "artikel.html" },
    { kicker: "Satu Wadah Terpusat",
      title: "Tidak perlu lagi berburu informasi pengasuhan ke mana-mana",
      sub: "Kebutuhan tertinggi responden survei kami (3,9 dari 4,0) adalah satu wadah terpusat yang kredibel. TemanParenting dirancang untuk menjawab kebutuhan itu.",
      img: "assets/img/family-park.jpg",
      alt: "Ayah dan ibu menggandeng tangan anak mereka berjalan di taman",
      badge: "Skor kebutuhan 3,9 / 4,0", badgeSub: "Satu wadah terpusat yang kredibel",
      tab: "Wadah terpusat yang kredibel", cta: "Tentang TemanParenting", href: "tentang.html" },
  ];
  const heroImg = document.getElementById("heroImg");
  slides.forEach(function (s, i) {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.className = "hero-tab" + (i === 0 ? " active" : "");
    b.textContent = s.tab;
    b.setAttribute("aria-pressed", i === 0 ? "true" : "false");
    b.addEventListener("click", function () {
      document.getElementById("heroKicker").textContent = s.kicker;
      document.getElementById("heroTitle").textContent = s.title;
      document.getElementById("heroSub").textContent = s.sub;
      heroImg.src = s.img;
      heroImg.alt = s.alt;
      const badge = document.getElementById("heroBadge");
      badge.childNodes[0].textContent = s.badge;
      badge.querySelector("span").textContent = s.badgeSub;
      const cta = document.getElementById("heroCta");
      cta.textContent = s.cta;
      cta.setAttribute("href", s.href);
      tabsUl.querySelectorAll(".hero-tab").forEach(function (t, j) {
        t.classList.toggle("active", j === i);
        t.setAttribute("aria-pressed", j === i ? "true" : "false");
      });
    });
    li.appendChild(b);
    tabsUl.appendChild(li);
  });
}

/* ---------------- Ask AI — menjawab dari materi di Firestore ---------------- */
const ASK_STOP = ["yang", "dan", "di", "ke", "dari", "untuk", "apa", "bagaimana", "cara",
  "anak", "saya", "itu", "ini", "dengan", "pada", "adalah", "agar", "bisa", "harus",
  "kenapa", "mengapa", "kapan", "apakah", "tolong", "tentang", "atau", "tidak",
  "secara", "dalam", "usia", "tahun", "nya", "sejak", "mulai"];
// Kata/frasa kunci per materi — diambil dari judul + ringkasan tiap materi di
// Firestore. Dipakai sebagai dorongan skor agar jawaban Ask AI jatuh ke materi
// yang topiknya paling dekat (bukan sekadar yang paling banyak mengandung kata).
const ASK_HINTS = {
  m1: ["tantrum", "emosi", "mengamuk", "marah", "menangis", "balita", "sosioemosional", "emosi pertama", "kelekatan", "ikatan", "rasa aman", "aman"],
  m2: ["motorik", "tengkurap", "merangkak", "berjalan", "duduk", "tumbuh pesat", "otak", "gizi", "tidur", "fisik balita"],
  m3: ["bahasa", "bicara", "kata", "kosakata", "membaca", "cerita", "stimulasi", "terlambat bicara", "prakoperasional"],
  m4: ["disiplin", "otoritatif", "tegas", "hangat", "aturan", "batas", "teriakan", "hukuman", "konsisten", "pola asuh"],
  m5: ["gizi", "sehat", "aktif", "olahraga", "makan", "anak sekolah", "motorik halus"],
  m6: ["belajar", "sekolah", "konkret", "berhitung", "fokus", "memori", "piaget", "operasional konkret"],
  m7: ["harga diri", "percaya diri", "teman sebaya", "perundungan", "bully", "rasa mampu", "inferioritas"],
  m8: ["mengelola bersama", "tanggung jawab", "kemandirian", "tugas", "ko-regulasi", "mengatur"],
  m9: ["pubertas", "hormon", "pertumbuhan", "menstruasi", "otak remaja"],
  m10: ["abstrak", "berpikir", "diawasi", "egosentris", "argumen", "logika"],
  m11: ["identitas", "jati diri", "erikson", "marcia", "siapa aku", "pencarian"],
  m12: ["otonomi", "mandiri", "ruang pribadi", "privasi", "koneksi", "mendampingi remaja", "konflik", "putus koneksi"],
};
const ASK_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5 9.5 18 20 6.5"/></svg>';
let askKB = null;
let askKBPromise = null;

function askNormalize(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function stripTags(s) {
  const d = document.createElement("div");
  d.innerHTML = s || "";
  return d.textContent || "";
}

// Basis pengetahuan Ask AI: seluruh materi Firestore (judul + ringkasan + isi + praktik).
async function ensureAskKB() {
  if (askKB) return askKB;
  if (!askKBPromise) {
    askKBPromise = (async function () {
      if (!configReady()) throw new Error("Konfigurasi Firebase belum diisi.");
      const mats = await loadCollection("materials");
      return mats.map(function (m) {
        const praktikText = (m.praktik || []).map(stripTags).join(" ");
        const isiText = (m.isi || []).join(" ");
        const hay = askNormalize(m.judul + " " + m.ringkas + " " + isiText + " " + praktikText
          + " " + m.domain + " " + m.tahap + " " + m.usia + " " + m.bab);
        return { m, hay };
      });
    })();
  }
  askKB = await askKBPromise;
  return askKB;
}

function findAskAnswer(q, kb) {
  const nq = askNormalize(q);
  const tokens = nq.split(" ").filter(function (w) { return w.length > 1 && ASK_STOP.indexOf(w) === -1; });
  let best = null, bestScore = 0;
  kb.forEach(function (entry) {
    let score = 0;
    tokens.forEach(function (w) {
      if ((" " + entry.hay + " ").indexOf(" " + w + " ") > -1) score += 1;
    });
    // Dorongan bila kata kunci muncul di judul materi.
    const titleHay = askNormalize(entry.m.judul);
    tokens.forEach(function (w) {
      if ((" " + titleHay + " ").indexOf(" " + w + " ") > -1) score += 1.5;
    });
    // Dorongan bila frasa kunci topik materi muncul di pertanyaan.
    (ASK_HINTS[entry.m.id] || []).forEach(function (h) {
      if (nq.indexOf(h) > -1) score += 2;
    });
    if (score > bestScore) { bestScore = score; best = entry.m; }
  });
  if (best && bestScore >= 1) return best;
  return null;
}

function askPointsList(m) {
  const ul = document.createElement("ul");
  (m.praktik || []).slice(0, 3).forEach(function (pt) {
    const li = document.createElement("li");
    li.innerHTML = ASK_CHECK;
    const sp = document.createElement("span");
    sp.textContent = stripTags(pt);
    li.appendChild(sp);
    ul.appendChild(li);
  });
  return ul;
}

function askSourceNote() {
  return "Dirangkum dari materi TemanParenting berdasarkan Santrock (2018). "
    + "Untuk kondisi medis atau perkembangan yang mengkhawatirkan, konsultasikan ke dokter anak atau psikolog.";
}

function fillAnswerBox(box, m) {
  box.innerHTML = "";
  if (!m) {
    const h = document.createElement("h3");
    h.textContent = "Saya belum menemukan materi yang pas untuk pertanyaan itu";
    const p = document.createElement("p");
    p.textContent = "Coba sebutkan usia anak dan hal spesifiknya — misalnya \u201ctantrum usia 2 tahun\u201d, \u201cstimulasi bahasa bayi\u201d, atau \u201cdisiplin tanpa teriakan\u201d. Atau jelajahi langsung daftar materi yang tersedia.";
    const a = document.createElement("a");
    a.className = "aa-link";
    a.href = "materi.html";
    a.textContent = "Lihat semua materi \u2192";
    box.appendChild(h);
    box.appendChild(p);
    box.appendChild(a);
    return;
  }
  const label = document.createElement("span");
  label.className = "aa-label";
  label.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5 14 9l6.5 3L14 15l-2 6.5L10 15 3.5 12 10 9z"/></svg> Jawaban Ask AI';
  const h3 = document.createElement("h3");
  const link = document.createElement("a");
  link.href = "materi-detail.html?id=" + m.id;
  link.textContent = m.judul;
  link.style.cssText = "color:inherit;text-decoration:none";
  h3.appendChild(link);
  const p2 = document.createElement("p");
  p2.textContent = m.ringkas;
  box.appendChild(label);
  box.appendChild(h3);
  box.appendChild(p2);
  if (m.praktik && m.praktik.length) box.appendChild(askPointsList(m));
  const src = document.createElement("p");
  src.className = "aa-src";
  src.textContent = askSourceNote();
  box.appendChild(src);
  const a = document.createElement("a");
  a.className = "aa-link";
  a.href = "materi-detail.html?id=" + m.id;
  a.textContent = "Baca materi selengkapnya \u2192";
  box.appendChild(a);
}

export function initAskAI() {
  const askPanel = document.getElementById("askPanel");
  if (!askPanel) return;
  const askOverlay = document.getElementById("askOverlay");
  const askBody = document.getElementById("askBody");
  const askTyping = document.getElementById("askTyping");
  const askPanelInput = document.getElementById("askPanelInput");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let askLastFocus = null;

  function openAsk() {
    askLastFocus = document.activeElement;
    askPanel.classList.add("open");
    askOverlay.classList.add("open");
    askPanel.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    setTimeout(function () { askPanelInput.focus(); }, reduced ? 0 : 380);
  }
  function closeAsk() {
    askPanel.classList.remove("open");
    askOverlay.classList.remove("open");
    askPanel.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (askLastFocus && askLastFocus.focus) askLastFocus.focus();
  }
  document.querySelectorAll("[data-ask-open]").forEach(function (b) {
    b.addEventListener("click", openAsk);
  });
  document.getElementById("askClose").addEventListener("click", closeAsk);
  askOverlay.addEventListener("click", closeAsk);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && askPanel.classList.contains("open")) closeAsk();
  });

  async function askInPanel(question) {
    const q = (question || "").trim();
    if (!q) return;
    const user = document.createElement("div");
    user.className = "ask-msg user";
    user.textContent = q;
    askBody.insertBefore(user, askTyping);
    askTyping.classList.add("show");
    askBody.scrollTop = askBody.scrollHeight;
    let m = null;
    try {
      const kb = await ensureAskKB();
      m = findAskAnswer(q, kb);
    } catch (e) {
      m = "error";
    }
    setTimeout(function () {
      askTyping.classList.remove("show");
      const ai = document.createElement("div");
      ai.className = "ask-msg ai";
      if (m === "error") {
        ai.innerHTML = "<h4>Ask AI belum bisa memuat materi</h4>Periksa koneksi internet Anda, lalu coba lagi. Anda tetap bisa menjelajah <a class=\"aa-link\" href=\"materi.html\">semua materi</a>.";
      } else if (!m) {
        ai.innerHTML = "<h4>Belum ketemu materi yang pas</h4>Coba sebutkan usia anak dan hal spesifiknya — misalnya \u201ctantrum usia 2 tahun\u201d, \u201cstimulasi bahasa bayi\u201d, atau \u201cdisiplin tanpa teriakan\u201d. Anda juga bisa melihat <a class=\"aa-link\" href=\"materi.html\">semua materi</a>.";
      } else {
        const h = document.createElement("h4");
        const link = document.createElement("a");
        link.href = "materi-detail.html?id=" + m.id;
        link.textContent = m.judul;
        link.style.cssText = "color:inherit";
        h.appendChild(link);
        ai.appendChild(h);
        const tx = document.createElement("span");
        tx.textContent = m.ringkas;
        ai.appendChild(tx);
        ai.appendChild(askPointsList(m));
        const src = document.createElement("p");
        src.className = "aa-src";
        src.textContent = "Sumber: materi TemanParenting (Santrock, 2018). Bukan pengganti konsultasi profesional.";
        ai.appendChild(src);
      }
      askBody.insertBefore(ai, askTyping);
      askBody.scrollTop = askBody.scrollHeight;
    }, reduced ? 60 : 750);
  }

  document.getElementById("askPanelForm").addEventListener("submit", function (e) {
    e.preventDefault();
    askInPanel(askPanelInput.value);
    askPanelInput.value = "";
  });

  // Tautan materi di dalam panel menutup panel dulu.
  askBody.addEventListener("click", function (e) {
    if (e.target.closest('a[href^="materi"]')) closeAsk();
  });

  // Bagian Ask AI di beranda.
  const askSectionAnswer = document.getElementById("askSectionAnswer");
  const askSectionForm = document.getElementById("askSectionForm");
  if (askSectionForm && askSectionAnswer) {
    askSectionForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      const q = document.getElementById("askSectionInput").value.trim();
      if (!q) return;
      let m = null;
      try {
        const kb = await ensureAskKB();
        m = findAskAnswer(q, kb);
      } catch (err) {
        m = null;
      }
      fillAnswerBox(askSectionAnswer, m);
      askSectionAnswer.classList.add("show");
      askSectionAnswer.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "nearest" });
    });
  }

  // Chip contoh pertanyaan: di panel menjawab di panel, di seksi halaman menjawab di tempat.
  document.querySelectorAll("[data-ask-q]").forEach(function (chip) {
    chip.addEventListener("click", function () {
      const q = chip.getAttribute("data-ask-q");
      if (chip.closest(".ask-panel")) {
        askInPanel(q);
      } else if (askSectionForm && askSectionAnswer) {
        document.getElementById("askSectionInput").value = q;
        askSectionForm.dispatchEvent(new Event("submit", { cancelable: true }));
      } else {
        askInPanel(q);
      }
    });
  });
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
