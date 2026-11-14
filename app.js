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

/* ---------------- diskusi & tanya jawab di akhir materi (3.1.2) ---------------- */
// Contoh diskusi (dummy) per materi — hanya ahli yang dapat merespon.
const DISKUSI = {
  m1: { q: "Anak saya tantrum di tempat umum, apa yang sebaiknya saya lakukan pertama kali?", a: "Tetap tenang, dekati anak, dan akui emosinya terlebih dahulu sebelum membahas perilakunya. Setelah anak tenang, barulah bicarakan batasannya dengan nada yang lembut dan jelas.", ahli: "dr. Ratna Wijaya, S.Psi., M.Psi., Psikolog" },
  m2: { q: "Apakah wajar jika anak usia 2 tahun belum bisa melompat dengan dua kaki?", a: "Setiap anak berkembang dengan kecepatannya sendiri, tetapi bila sampai usia 2 tahun belum ada kemajuan motorik kasar sama sekali, sebaiknya konsultasikan ke ahli tumbuh kembang untuk skrining lebih lanjut.", ahli: "dr. Lina Marlina, S.Psi., M.Psi., Psikolog" },
  m3: { q: "Anak saya usia 3 tahun masih sulit merangkai dua kata, apakah perlu khawatir?", a: "Ajak anak berbicara setiap hari, bacakan buku bergambar, dan beri waktu ia merespons. Bila dalam beberapa bulan tidak ada tambahan kosakata, bawa ke ahli untuk penilaian bahasa.", ahli: "dr. Sari Dewi, S.Psi., M.Psi., Psikolog" },
  m4: { q: "Bagaimana membedakan sikap tegas dengan sikap keras saat menerapkan aturan?", a: "Tegas berarti aturan jelas dan konsisten, disampaikan dengan nada tenang dan alasan yang masuk akal. Keras berarti memakai bentakan atau hukuman yang membuat anak takut, bukan paham.", ahli: "dr. Budi Santoso, S.Psi., M.Psi., Psikolog" },
  m5: { q: "Berapa lama waktu layar yang wajar untuk anak usia sekolah?", a: "Batasi waktu layar rekreasional sekitar satu jam per hari, seimbangkan dengan gerak, tidur cukup, dan makan bergizi. Yang lebih penting dari durasi adalah isi dan pendampingan orang tua.", ahli: "dr. Andi Pratama, S.Psi., M.Psi., Psikolog" },
  m6: { q: "Anak saya sulit fokus saat belajar, bagaimana cara melatihnya?", a: "Bagi tugas belajar menjadi potongan singkat sekitar 15 sampai 20 menit, selingi dengan gerak, dan kurangi gangguan di sekitarnya. Konsistensi rutinitas lebih membantu daripada sesi belajar yang panjang.", ahli: "dr. Rudi Hartono, S.Psi., M.Psi., Psikolog" },
  m7: { q: "Anak saya sering berkata \"aku tidak bisa\", bagaimana membangun rasa mampunya?", a: "Berikan tugas yang sesuai kemampuan, rayakan usaha bukan hanya hasil, dan hindari membandingkan dengan anak lain. Rasa mampu tumbuh dari pengalaman berhasil, sekecil apa pun.", ahli: "dr. Maya Kusuma, S.Psi., M.Psi., Psikolog" },
  m8: { q: "Kapan anak boleh mulai dilibatkan membuat aturan di rumah?", a: "Sejak usia sekolah, anak sudah bisa diajak berdiskusi tentang aturan sederhana dan konsekuensinya. Libatkan mereka menyusun aturan agar mereka merasa memiliki dan lebih mudah mematuhinya.", ahli: "dr. Dedi Kurniawan, S.Psi., M.Psi., Psikolog" },
  m9: { q: "Remaja saya jadi mudah tersinggung sejak pubertas, apakah ini normal?", a: "Ya, perubahan hormon dan perkembangan otak remaja membuat emosi lebih reaktif. Yang dibutuhkan adalah orang tua yang tetap tenang, mendengarkan dulu, dan menasihati setelah emosi mereda.", ahli: "dr. Ratna Wijaya, S.Psi., M.Psi., Psikolog" },
  m10: { q: "Remaja saya merasa semua orang memperhatikan penampilannya, bagaimana menanggapinya?", a: "Itu bagian dari cara berpikir remaja yang merasa menjadi pusat perhatian. Akui perasaannya tanpa mengejek, lalu bantu ia melihat bukti nyata bahwa orang lain tidak sefokus itu padanya.", ahli: "dr. Maya Kusuma, S.Psi., M.Psi., Psikolog" },
  m11: { q: "Remaja saya sering berganti minat dan gaya, apakah ini bagian dari pencarian identitas?", a: "Ya, mencoba berbagai peran adalah cara remaja menemukan jati dirinya. Dukung eksplorasinya selama aman, dan jadilah tempat pulang yang tidak menghakimi.", ahli: "dr. Budi Santoso, S.Psi., M.Psi., Psikolog" },
  m12: { q: "Bagaimana memberi kebebasan pada remaja tanpa kehilangan koneksi dengannya?", a: "Beri kebebasan bertahap sesuai tanggung jawab yang ia tunjukkan, dan jaga koneksi lewat obrolan rutin tanpa agenda. Otonomi dan kedekatan bisa berjalan bersama.", ahli: "dr. Ratna Wijaya, S.Psi., M.Psi., Psikolog" },
};

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
    const formatHTML = '<h2>Format materi ini</h2>'
      + '<p>Satu materi, beberapa format — sesuai hasil survei, format yang paling disetujui adalah video pendek, tanya jawab ahli, audio/podcast, infografik, dan teks.</p>'
      + '<div class="format-row">'
      + '<span class="format-chip ada">Teks · Tersedia</span>'
      + '<span class="format-chip">Video pendek · Segera</span>'
      + '<span class="format-chip">Audio / Podcast · Segera</span>'
      + '<span class="format-chip">Infografik · Segera</span>'
      + '<span class="format-chip ada">Tanya jawab ahli · Bertanya Parenting</span>'
      + '</div>';
    const d = DISKUSI[m.id];
    const diskusiHTML = '<h2>Diskusi &amp; Tanya Jawab</h2>'
      + '<p class="diskusi-intro">Punya pertanyaan tentang materi ini? Hanya ahli yang dapat merespon, dan diskusi dapat dilihat oleh orang lain.</p>'
      + (d ? '<div class="diskusi-item"><p class="diskusi-q">' + esc(d.q) + '</p><p class="diskusi-a"><span class="diskusi-ahli">' + esc(d.ahli) + ' · Ahli</span>' + esc(d.a) + '</p></div>' : '')
      + '<p class="dummy-note">Diskusi di atas adalah contoh (dummy) untuk prototipe.</p>'
      + '<button type="button" class="btn btn-amber" data-ask-open>Ajukan Pertanyaan</button>';
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
      + formatHTML + diskusiHTML
      + relHTML
      + "</div>"
      + '<aside><div class="side-card"><h3>Refleksi untuk orang tua</h3><ul>' + refl + "</ul>"
      + '<div class="fact"><strong>Catatan Santrock</strong>' + esc(m.fakta) + "</div>"
      + '<div class="fact" style="margin-top:10px"><strong>Sumber materi</strong>' + esc(SUMBER_SITASI) + " — " + esc(m.bab) + ".</div>"
      + '<div class="fact" style="margin-top:10px"><strong>Kurasi ahli</strong>Materi ini disusun berdasarkan Santrock (2018) dan dikurasi oleh ahli sebelum diterbitkan.</div>'
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
      sub: "TemanParenting merangkum ilmu perkembangan anak menjadi materi singkat yang bisa dibaca di sela kesibukan — dengan prioritas pada masa balita.",
      img: "assets/img/hero-reading.jpg",
      alt: "Seorang ibu membacakan buku cerita kepada balitanya di sofa rumah",
      badge: "12 materi siap dibaca", badgeSub: "Disusun dari Santrock (2018) & hasil survei kebutuhan",
      tab: "Materi Parenting", cta: "Jelajahi Materi", href: "materi.html" },
    { kicker: "Berita Parenting",
      title: "Aktivitas seru bersama si kecil, dibagikan antar orang tua",
      sub: "Kumpulan aktivitas bersama anak — memasak, membaca, dan bermain — yang dibagikan sesama orang tua sebagai inspirasi untuk dicoba di rumah.",
      img: "assets/img/family-cooking.jpg",
      alt: "Keluarga menyiapkan makanan bersama di dapur",
      badge: "Cerita & aktivitas", badgeSub: "Dibagikan oleh sesama orang tua",
      tab: "Berita Parenting", cta: "Lihat Berita", href: "artikel.html" },
    { kicker: "Kegiatan Komunitas",
      title: "Komunitas yang belajar dan tumbuh bersama",
      sub: "Laporan dan dokumentasi kegiatan komunitas TemanParenting di berbagai wilayah — seminar, temu komunitas, dan cerita dari lapangan.",
      img: "assets/img/family-park.jpg",
      alt: "Ayah dan ibu menggandeng tangan anak mereka berjalan di taman",
      badge: "5 kota di Indonesia", badgeSub: "Seminar & temu komunitas",
      tab: "Kegiatan Komunitas", cta: "Lihat Kegiatan", href: "komunitas.html" },
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

/* ---------------- Bertanya Parenting — menjawab dari materi di Firestore ---------------- */
const ASK_STOP = ["yang", "dan", "di", "ke", "dari", "untuk", "apa", "bagaimana", "cara",
  "anak", "saya", "itu", "ini", "dengan", "pada", "adalah", "agar", "bisa", "harus",
  "kenapa", "mengapa", "kapan", "apakah", "tolong", "tentang", "atau", "tidak",
  "secara", "dalam", "usia", "tahun", "nya", "sejak", "mulai"];
// Kata/frasa kunci per materi — diambil dari judul + ringkasan tiap materi di
// Firestore. Dipakai sebagai dorongan skor agar jawaban Bertanya Parenting jatuh ke materi
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

// Basis pengetahuan Bertanya Parenting: seluruh materi Firestore (judul + ringkasan + isi + praktik).
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
  label.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5 14 9l6.5 3L14 15l-2 6.5L10 15 3.5 12 10 9z"/></svg> Jawaban Bertanya Parenting';
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
  // Delegasi: tombol data-ask-open yang dirender belakangan (mis. di akhir
  // materi) ikut terbuka tanpa perlu diikat ulang.
  document.addEventListener("click", function (e) {
    const b = e.target.closest("[data-ask-open]");
    if (b) { e.preventDefault(); openAsk(); }
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
        ai.innerHTML = "<h4>Bertanya Parenting belum bisa memuat materi</h4>Periksa koneksi internet Anda, lalu coba lagi. Anda tetap bisa menjelajah <a class=\"aa-link\" href=\"materi.html\">semua materi</a>.";
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

  // Bagian Bertanya Parenting di beranda.
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

/* ---------------- Komunitas & Konsultasi dengan Ahli (prototipe: data dummy) ---------------- */
// Prototipe: hanya Yogyakarta yang aktif; kota lain tombolnya digelapkan
// dan menampilkan pemberitahuan prototipe saat diklik.
const KOTA_AKTIF = "yogyakarta";
const KOTA_LIST = [
  { slug: "yogyakarta", nama: "Yogyakarta", img: "assets/img/kota/yogyakarta.jpg", landmark: "Keraton Yogyakarta", anggota: 248, kegiatan: 12, ahli: 8, seminar: "Gedung Taman Budaya Yogyakarta", temu: "Taman Pintar Yogyakarta" },
  { slug: "bandung", nama: "Bandung", img: "assets/img/kota/bandung.jpg", landmark: "Jembatan Layang Pasupati", anggota: 187, kegiatan: 9, ahli: 6, seminar: "Yayasan Pusat Kebudayaan, Bandung", temu: "Taman Lansia, Bandung" },
  { slug: "jakarta", nama: "Jakarta", img: "assets/img/kota/jakarta.jpg", landmark: "Bundaran HI", anggota: 312, kegiatan: 15, ahli: 10, seminar: "Balai Sarbini, Jakarta Selatan", temu: "Taman Menteng, Jakarta Pusat" },
  { slug: "surabaya", nama: "Surabaya", img: "assets/img/kota/surabaya.jpg", landmark: "Jembatan Suroboyo", anggota: 164, kegiatan: 8, ahli: 5, seminar: "Balai Pemuda Surabaya", temu: "Taman Bungkul Surabaya" },
  { slug: "semarang", nama: "Semarang", img: "assets/img/kota/semarang.jpg", landmark: "Lawang Sewu", anggota: 121, kegiatan: 6, ahli: 4, seminar: "Gedung Wanita Semarang", temu: "Taman Indonesia Kaya, Semarang" },
];

const ACARA_LIST = [
  { jenis: "Seminar", segmen: "Balita", judul: "Menangani Anak Tantrum: Tenang di Tengah Badai Emosi", tgl: "Sabtu, 21 November 2026", jam: "09.00–11.00 WIB", peran: "Pembicara", ahli: "dr. Ratna Wijaya, S.Psi., M.Psi., Psikolog", desk: "Mengapa tantrum terjadi, apa yang sebenarnya dibutuhkan anak saat tantrum, dan langkah tenang yang bisa dilakukan orang tua." },
  { jenis: "Temu Komunitas", segmen: "Balita", judul: "Ngobrol Santai: Berbagi Cerita Mengasuh Balita", tgl: "Minggu, 22 November 2026", jam: "15.00–17.00 WIB", peran: "Pemandu", ahli: "dr. Budi Santoso, S.Psi., M.Psi., Psikolog", maks: 20, desk: "Sesi berbagi antar orang tua balita: cerita, keluhan, dan strategi yang sudah dicoba di rumah masing-masing." },
  { jenis: "Seminar", segmen: "Balita", judul: "Disiplin Positif Tanpa Teriakan", tgl: "Sabtu, 28 November 2026", jam: "09.00–11.00 WIB", peran: "Pembicara", ahli: "dr. Sari Dewi, S.Psi., M.Psi., Psikolog", desk: "Cara menerapkan disiplin positif pada balita: batas yang jelas, nada yang tenang, dan konsekuensi yang masuk akal — tanpa bentakan." },
  { jenis: "Temu Komunitas", segmen: "Balita", judul: "Ayah Ikut Mengasuh: Berbagi Peran di Rumah", tgl: "Minggu, 29 November 2026", jam: "15.00–17.00 WIB", peran: "Pemandu", ahli: "dr. Rudi Hartono, S.Psi., M.Psi., Psikolog", maks: 20, desk: "Diskusi khusus para ayah tentang pembagian peran pengasuhan dan cara hadir secara nyata di keseharian anak." },
  { jenis: "Seminar", segmen: "Balita", judul: "Stimulasi Bahasa Anak Usia Dini lewat Bermain", tgl: "Sabtu, 5 Desember 2026", jam: "09.00–11.00 WIB", peran: "Pembicara", ahli: "dr. Lina Marlina, S.Psi., M.Psi., Psikolog", desk: "Teknik sederhana menstimulasi bahasa balita lewat bermain, bercerita, dan percakapan sehari-hari." },
];

const AHLI_LIST = [
  { nama: "dr. Ratna Wijaya, S.Psi., M.Psi., Psikolog", singkat: "Ratna Wijaya", inisial: "RW", bidang: "Psikolog Anak & Remaja", praktik: "Klinik Tumbuh Kembang Ceria", jadwal: "Senin–Jumat, 09.00–17.00" },
  { nama: "dr. Budi Santoso, S.Psi., M.Psi., Psikolog", singkat: "Budi Santoso", inisial: "BS", bidang: "Psikolog Keluarga", praktik: "Praktik Psikologi Keluarga Harmoni", jadwal: "Senin–Sabtu, 10.00–18.00" },
  { nama: "dr. Sari Dewi, S.Psi., M.Psi., Psikolog", singkat: "Sari Dewi", inisial: "SD", bidang: "Psikolog Anak Usia Dini", praktik: "Klinik Anak Ceria", jadwal: "Senin–Jumat, 08.00–16.00" },
  { nama: "dr. Andi Pratama, S.Psi., M.Psi., Psikolog", singkat: "Andi Pratama", inisial: "AP", bidang: "Konselor Pernikahan & Keluarga", praktik: "Praktik Psikologi Andi Pratama", jadwal: "Selasa–Sabtu, 09.00–17.00" },
  { nama: "dr. Maya Kusuma, S.Psi., M.Psi., Psikolog", singkat: "Maya Kusuma", inisial: "MK", bidang: "Psikolog Remaja", praktik: "Klinik Remaja Sehat", jadwal: "Senin–Jumat, 10.00–18.00" },
  { nama: "dr. Rudi Hartono, S.Psi., M.Psi., Psikolog", singkat: "Rudi Hartono", inisial: "RH", bidang: "Psikolog Pendidikan", praktik: "Praktik Psikologi Rudi Hartono", jadwal: "Senin–Sabtu, 09.00–17.00" },
  { nama: "dr. Lina Marlina, S.Psi., M.Psi., Psikolog", singkat: "Lina Marlina", inisial: "LM", bidang: "Psikolog Anak & Kehamilan", praktik: "Klinik Ibu & Anak Ceria", jadwal: "Senin–Jumat, 08.00–15.00" },
  { nama: "dr. Dedi Kurniawan, S.Psi., M.Psi., Psikolog", singkat: "Dedi Kurniawan", inisial: "DK", bidang: "Psikolog Perkembangan", praktik: "Praktik Psikologi Dedi Kurniawan", jadwal: "Rabu–Minggu, 09.00–17.00" },
];

function kotaCard(k) {
  const aktif = k.slug === KOTA_AKTIF;
  return '<article class="kota-card">'
    + '<img src="' + k.img + '" alt="Landmark ' + k.landmark + ' di ' + k.nama + '" loading="lazy" />'
    + '<span class="body"><span class="kota-landmark">' + k.landmark + '</span>'
    + '<h3>' + k.nama + '</h3>'
    + '<span class="kota-stats"><span><b>' + k.anggota + '</b>Anggota</span><span><b>' + k.kegiatan + '</b>Kegiatan aktif</span><span><b>' + k.ahli + '</b>Ahli</span></span>'
    + '<button type="button" class="btn btn-amber kota-pilih' + (aktif ? '' : ' dim') + '" data-kota="' + k.slug + '">Pilih Kota ini</button>'
    + '</span></article>';
}

function showToast(msg) {
  let t = document.getElementById("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    t.setAttribute("role", "status");
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(function () { t.classList.remove("show"); }, 3200);
}

function initKotaPicker(gridId, onPick) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  // Kartu sudah ditulis statis di HTML agar selalu tampil; JS hanya
  // mengikat klik. Bila grid kosong (mis. halaman lama), render dari data.
  if (!grid.querySelector("[data-kota]")) {
    grid.innerHTML = KOTA_LIST.map(kotaCard).join("");
  }
  grid.querySelectorAll("[data-kota]").forEach(function (b) {
    b.addEventListener("click", function () {
      const kota = KOTA_LIST.find(function (k) { return k.slug === b.dataset.kota; });
      if (kota.slug !== KOTA_AKTIF) {
        showToast("Belum dibangun karena masih bersifat prototipe");
        return;
      }
      onPick(kota);
    });
  });
}

export function initKomunitas() {
  const kotaStep = document.getElementById("kotaStep");
  const acaraStep = document.getElementById("acaraStep");
  const grid = document.getElementById("acaraGrid");
  const title = document.getElementById("acaraTitle");
  const sub = document.getElementById("acaraSub");
  if (!kotaStep || !acaraStep || !grid) return;
  initKotaPicker("kotaGrid", function (kota) {
    title.textContent = "Acara di " + kota.nama;
    sub.textContent = "Seminar dan temu komunitas di " + kota.nama + " — setiap acara dipandu oleh ahli di bidangnya.";
    grid.innerHTML = ACARA_LIST.map(function (a) {
      const tempat = a.jenis === "Seminar" ? kota.seminar : kota.temu;
      return '<article class="acara-card">'
        + '<div class="acara-top"><span class="acara-jenis ' + (a.jenis === "Seminar" ? "seminar" : "temu") + '">' + a.jenis + '</span>'
        + '<span class="acara-segmen">Segmen ' + a.segmen + '</span></div>'
        + '<h3>' + a.judul + '</h3>'
        + '<p class="acara-meta">' + a.tgl + ' · ' + a.jam + '</p>'
        + '<p class="acara-meta">' + tempat + '</p>'
        + (a.maks ? '<p class="acara-meta">Maksimal ' + a.maks + ' orang</p>' : '')
        + '<p class="acara-ahli">' + a.peran + ': ' + a.ahli + '</p>'
        + '<p class="acara-desk">' + a.desk + '</p>'
        + '</article>';
    }).join("");
    kotaStep.hidden = true;
    acaraStep.hidden = false;
    acaraStep.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  document.getElementById("gantiKotaBtn").addEventListener("click", function () {
    acaraStep.hidden = true;
    kotaStep.hidden = false;
    kotaStep.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

export function initKonsultasi() {
  const kotaStep = document.getElementById("kotaStepKonsul");
  const ahliStep = document.getElementById("ahliStep");
  const grid = document.getElementById("ahliGrid");
  const title = document.getElementById("ahliTitle");
  const sub = document.getElementById("ahliSub");
  const bar = document.getElementById("pilihBar");
  const barText = document.getElementById("pilihText");
  if (!kotaStep || !ahliStep || !grid) return;
  initKotaPicker("kotaGridKonsul", function (kota) {
    const idx = KOTA_LIST.indexOf(kota);
    const ahli = [0, 2, 4, 6].map(function (o) { return AHLI_LIST[(idx + o) % AHLI_LIST.length]; });
    title.textContent = "Ahli di " + kota.nama;
    sub.textContent = "Psikolog dan konselor yang praktik di " + kota.nama + " — pilih salah satu untuk melihat detailnya.";
    bar.hidden = true;
    grid.innerHTML = ahli.map(function (a) {
      return '<article class="ahli-card">'
        + '<span class="ahli-avatar">' + a.inisial + '</span>'
        + '<h3>' + a.nama + '</h3>'
        + '<p class="ahli-bidang">' + a.bidang + '</p>'
        + '<p class="ahli-praktik">Tempat praktik: ' + a.praktik + ', ' + kota.nama + '</p>'
        + '<p class="ahli-jadwal">Jadwal: ' + a.jadwal + '</p>'
        + '<button type="button" class="btn btn-amber ahli-pilih" data-ahli="' + a.singkat + '">Pilih Ahli</button>'
        + '</article>';
    }).join("");
    grid.querySelectorAll("[data-ahli]").forEach(function (b) {
      b.addEventListener("click", function () {
        const a = ahli.find(function (x) { return x.singkat === b.dataset.ahli; });
        grid.querySelectorAll(".ahli-card").forEach(function (c) { c.classList.remove("selected"); });
        b.closest(".ahli-card").classList.add("selected");
        b.textContent = "Ahli Dipilih ✓";
        grid.querySelectorAll(".ahli-pilih").forEach(function (x) { if (x !== b) x.textContent = "Pilih Ahli"; });
        barText.textContent = "Anda memilih " + a.nama + " (" + a.bidang + ") — " + a.praktik + ", " + kota.nama + ".";
        bar.hidden = false;
        bar.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    });
    kotaStep.hidden = true;
    ahliStep.hidden = false;
    ahliStep.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  document.getElementById("gantiKotaBtnKonsul").addEventListener("click", function () {
    ahliStep.hidden = true;
    kotaStep.hidden = false;
    kotaStep.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

/* ---------------- garis waktu tahap tumbuh kembang (beranda) ---------------- */
// Fase mengikuti pengelompokan laporan: pertanyaan F1 (usia krusial:
// Kehamilan, 1–2, 3–5, 6–7, 13–18 — rentang 8–12 tidak tersedia di
// formulir) dan butir 4A (Masih dalam kandungan, 0–1, 3–5, 6–12, 13–18).
// Rentang 6–12 mencakup 6–7 (F1) sekaligus 8–12 yang hilang di F1.
// Tautan tiap fase memakai filter usia materi yang sudah ada (?usia=).
const TAHAP_LIST = [
  { slug: "hamil", nama: "Hamil", rentang: "Kehamilan & persiapan", usia: "0-5",
    desk: "1000 hari pertama kehidupan dimulai sejak dalam kandungan — gizi ibu, kesehatan kehamilan, dan persiapan menyambut bayi.",
    isu: ["Gizi ibu hamil", "Persiapan menyambut bayi", "1000 hari pertama"] },
  { slug: "bayi", nama: "Bayi", rentang: "0–1 tahun", usia: "0-5",
    desk: "Bayi belajar lewat indra dan gerakan; kelekatan yang aman dengan pengasuh menjadi fondasi perkembangan selanjutnya.",
    isu: ["Kelekatan & rasa aman", "Tumbuh kembang fisik", "Stimulasi indra"] },
  { slug: "batita", nama: "Batita", rentang: "1–2 tahun", usia: "0-5",
    desk: "Anak mulai berjalan dan mengucapkan kata pertama; rasa ingin tahu dan kemandirian awal mulai tumbuh.",
    isu: ["Kata pertama", "Tantrum pertama", "Kemandirian awal"] },
  { slug: "balita", nama: "Balita", rentang: "3–5 tahun", usia: "0-5",
    desk: "Bahasa meledak, imajinasi berkembang, dan anak belajar aturan lewat bermain — masa emas stimulasi.",
    isu: ["Tantrum & emosi", "Ledakan bahasa", "Disiplin positif"] },
  { slug: "anak", nama: "Anak", rentang: "6–12 tahun", usia: "6-12",
    desk: "Anak sekolah: berpikir konkret, belajar membaca-menulis-berhitung, serta harga diri dan dunia teman sebaya mulai terbentuk.",
    isu: ["Harga diri", "Teman sebaya", "Belajar di sekolah"] },
  { slug: "remaja", nama: "Remaja", rentang: "13–18 tahun", usia: "13-18",
    desk: "Pubertas, pencarian identitas, dan hubungan dengan teman sebaya; orang tua beralih dari mengatur menjadi mendampingi.",
    isu: ["Pubertas", "Pencarian identitas", "Otonomi & komunikasi"] },
];

export function initTimeline() {
  const track = document.getElementById("timeline");
  const panel = document.getElementById("tahapPanel");
  if (!track || !panel) return;
  const nodes = Array.from(track.querySelectorAll("[data-tahap]"));
  function pilih(slug) {
    const t = TAHAP_LIST.find(function (x) { return x.slug === slug; });
    if (!t) return;
    nodes.forEach(function (n) {
      n.setAttribute("aria-selected", n.dataset.tahap === slug ? "true" : "false");
    });
    panel.innerHTML = '<span class="tahap-rentang">' + t.rentang + '</span>'
      + '<h3>' + t.nama + '</h3>'
      + '<p>' + t.desk + '</p>'
      + '<div class="tahap-isu" role="list" aria-label="Isu populer pada tahap ini">'
      + t.isu.map(function (s) { return '<span role="listitem">' + s + '</span>'; }).join("")
      + '</div>'
      + '<a class="btn btn-amber" href="materi.html?usia=' + t.usia + '">Pelajari Parenting Usia ini</a>';
    // Di layar kecil (gulir horizontal), geser node terpilih ke tengah.
    const node = nodes.find(function (n) { return n.dataset.tahap === slug; });
    if (node && node.scrollIntoView) node.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }
  nodes.forEach(function (n) {
    n.addEventListener("click", function () { pilih(n.dataset.tahap); });
  });
}
