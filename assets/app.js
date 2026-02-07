/* ========= CONFIG =========
   Optional Firebase:
   - If you want real login + cloud progress, fill FIREBASE_CONFIG below.
   - If left blank, the site uses DEMO login + localStorage progress.
=========================== */

const FIREBASE_CONFIG = null; 
// Example:
// const FIREBASE_CONFIG = {
//   apiKey: "…",
//   authDomain: "…",
//   projectId: "…",
// };

const APP_EMBED_URL = "https://ai-edu-hub.replit.app";

/* ---------- State ---------- */
const LS_AUTH_KEY = "aihub_auth_user";
const LS_PROGRESS_PREFIX = "aihub_progress_";

let firebaseReady = false;
let fb = {};

/* ---------- Utilities ---------- */
function qs(sel, el=document){ return el.querySelector(sel); }
function qsa(sel, el=document){ return [...el.querySelectorAll(sel)]; }

function safeEmailKey(email){
  return String(email || "guest").toLowerCase().replace(/[^a-z0-9]/g, "_");
}

function getAuthUser(){
  try { return JSON.parse(localStorage.getItem(LS_AUTH_KEY) || "null"); } catch { return null; }
}
function setAuthUser(user){
  localStorage.setItem(LS_AUTH_KEY, JSON.stringify(user));
  refreshAuthUI();
}
function clearAuthUser(){
  localStorage.removeItem(LS_AUTH_KEY);
  refreshAuthUI();
}

function progressKeyFor(email){
  return LS_PROGRESS_PREFIX + safeEmailKey(email);
}

function getProgress(email){
  const key = progressKeyFor(email);
  try {
    return JSON.parse(localStorage.getItem(key) || "{}");
  } catch {
    return {};
  }
}
function setProgress(email, data){
  const key = progressKeyFor(email);
  localStorage.setItem(key, JSON.stringify(data));
}

/* ---------- Tutor Drawer (mobile) ---------- */
function openTutorDrawer(){
  const drawer = qs("#tutorDrawer");
  if(!drawer) return;
  drawer.style.display = "block";
}
function closeTutorDrawer(){
  const drawer = qs("#tutorDrawer");
  if(!drawer) return;
  drawer.style.display = "none";
}

/* ---------- Login Modal ---------- */
function openLogin(){
  const m = qs("#loginModal");
  if(m) m.style.display = "block";
}
function closeLogin(){
  const m = qs("#loginModal");
  if(m) m.style.display = "none";
}

function demoLogin(email){
  if(!email) throw new Error("Enter an email to continue.");
  setAuthUser({ email, mode: "demo" });
}

async function initFirebaseIfConfigured(){
  if(!FIREBASE_CONFIG) return false;

  // Lazy-load Firebase (modular) from CDN
  const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js");
  const { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } =
    await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js");
  const { getFirestore, doc, getDoc, setDoc, updateDoc } =
    await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js");

  const app = initializeApp(FIREBASE_CONFIG);
  fb.auth = getAuth(app);
  fb.db = getFirestore(app);
  fb.signIn = signInWithEmailAndPassword;
  fb.signUp = createUserWithEmailAndPassword;
  fb.signOut = signOut;
  fb.doc = doc;
  fb.getDoc = getDoc;
  fb.setDoc = setDoc;
  fb.updateDoc = updateDoc;
  fb.onAuthStateChanged = onAuthStateChanged;

  firebaseReady = true;

  // Sync Firebase auth -> UI
  fb.onAuthStateChanged(fb.auth, (user) => {
    if(user?.email){
      setAuthUser({ email: user.email, mode: "firebase" });
    }else{
      // If firebase logs out, clear local auth too
      const u = getAuthUser();
      if(u?.mode === "firebase") clearAuthUser();
      refreshAuthUI();
    }
  });

  return true;
}

async function firebaseLogin(email, password, isSignup=false){
  if(!firebaseReady) throw new Error("Firebase not configured.");
  if(!email || !password) throw new Error("Email and password required.");
  if(isSignup){
    await fb.signUp(fb.auth, email, password);
  } else {
    await fb.signIn(fb.auth, email, password);
  }
  // onAuthStateChanged will update UI
}

async function firebaseLogout(){
  if(!firebaseReady) { clearAuthUser(); return; }
  await fb.signOut(fb.auth);
  clearAuthUser();
}

/* ---------- Cloud Progress (optional) ---------- */
async function loadCloudProgress(email){
  if(!firebaseReady) return null;
  const ref = fb.doc(fb.db, "progress", safeEmailKey(email));
  const snap = await fb.getDoc(ref);
  return snap.exists() ? snap.data() : null;
}
async function saveCloudProgress(email, data){
  if(!firebaseReady) return false;
  const ref = fb.doc(fb.db, "progress", safeEmailKey(email));
  await fb.setDoc(ref, data, { merge: true });
  return true;
}

/* ---------- Progress helpers ---------- */
function ensureProgressShape(p){
  return {
    lessons: p.lessons || {},
    projects: p.projects || {},
    updatedAt: new Date().toISOString(),
  };
}

async function getUnifiedProgress(email){
  // prefer cloud if firebase user
  const u = getAuthUser();
  if(u?.mode === "firebase" && firebaseReady){
    const cloud = await loadCloudProgress(email);
    if(cloud) {
      // also cache locally
      setProgress(email, cloud);
      return ensureProgressShape(cloud);
    }
  }
  return ensureProgressShape(getProgress(email));
}

async function setUnifiedProgress(email, p){
  const shaped = ensureProgressShape(p);
  setProgress(email, shaped);
  const u = getAuthUser();
  if(u?.mode === "firebase" && firebaseReady){
    await saveCloudProgress(email, shaped);
  }
}

/* ---------- UI wiring ---------- */
function refreshAuthUI(){
  const user = getAuthUser();
  const badge = qs("#userBadge");
  const loginBtn = qs("#loginBtn");
  const logoutBtn = qs("#logoutBtn");

  if(badge){
    badge.textContent = user?.email ? `Signed in: ${user.email}` : "Not signed in";
  }
  if(loginBtn) loginBtn.style.display = user?.email ? "none" : "inline-flex";
  if(logoutBtn) logoutBtn.style.display = user?.email ? "inline-flex" : "none";
}

function bindGlobalUI(){
  // Tutor FAB + drawer
  const fab = qs("#tutorFab");
  if(fab) fab.addEventListener("click", openTutorDrawer);
  const closeDrawerBtn = qs("#closeTutorDrawer");
  if(closeDrawerBtn) closeDrawerBtn.addEventListener("click", closeTutorDrawer);
  const drawer = qs("#tutorDrawer");
  if(drawer){
    drawer.addEventListener("click", (e)=>{ if(e.target === drawer) closeTutorDrawer(); });
  }

  // Login modal
  const loginBtn = qs("#loginBtn");
  if(loginBtn) loginBtn.addEventListener("click", openLogin);
  const closeLoginBtn = qs("#closeLogin");
  if(closeLoginBtn) closeLoginBtn.addEventListener("click", closeLogin);
  const modal = qs("#loginModal");
  if(modal){
    modal.addEventListener("click", (e)=>{ if(e.target === modal) closeLogin(); });
  }

  const logoutBtn = qs("#logoutBtn");
  if(logoutBtn){
    logoutBtn.addEventListener("click", async () => {
      const u = getAuthUser();
      if(u?.mode === "firebase") await firebaseLogout();
      else clearAuthUser();
    });
  }

  const demoBtn = qs("#demoLoginBtn");
  if(demoBtn){
    demoBtn.addEventListener("click", () => {
      const email = qs("#loginEmail")?.value?.trim();
      try{
        demoLogin(email);
        closeLogin();
      }catch(err){
        alert(err.message || String(err));
      }
    });
  }

  const fbLoginBtn = qs("#firebaseLoginBtn");
  if(fbLoginBtn){
    fbLoginBtn.addEventListener("click", async () => {
      try{
        const email = qs("#loginEmail")?.value?.trim();
        const pass = qs("#loginPassword")?.value;
        await firebaseLogin(email, pass, false);
        closeLogin();
      }catch(err){
        alert(err.message || String(err));
      }
    });
  }

  const fbSignupBtn = qs("#firebaseSignupBtn");
  if(fbSignupBtn){
    fbSignupBtn.addEventListener("click", async () => {
      try{
        const email = qs("#loginEmail")?.value?.trim();
        const pass = qs("#loginPassword")?.value;
        await firebaseLogin(email, pass, true);
        closeLogin();
      }catch(err){
        alert(err.message || String(err));
      }
    });
  }
}

/* ---------- Page-specific Progress ---------- */
async function initProgressUI(){
  const user = getAuthUser();
  const email = user?.email || "guest@local";

  const progress = await getUnifiedProgress(email);

  // Apply checkboxes (lessons/projects)
  qsa("[data-progress-type][data-progress-id]").forEach(el => {
    const type = el.getAttribute("data-progress-type");
    const id = el.getAttribute("data-progress-id");
    const checked = !!(progress[type] && progress[type][id]);
    if(el.type === "checkbox") el.checked = checked;

    el.addEventListener("change", async () => {
      const p = await getUnifiedProgress(email);
      p[type] = p[type] || {};
      p[type][id] = !!el.checked;
      p.updatedAt = new Date().toISOString();
      await setUnifiedProgress(email, p);
      await renderProgressBars();
    });
  });

  await renderProgressBars();
}

async function renderProgressBars(){
  const user = getAuthUser();
  const email = user?.email || "guest@local";
  const p = await getUnifiedProgress(email);

  // lessons progress bar
  const lessonIds = qsa("[data-progress-type='lessons'][data-progress-id]").map(x=>x.getAttribute("data-progress-id"));
  const projectIds = qsa("[data-progress-type='projects'][data-progress-id]").map(x=>x.getAttribute("data-progress-id"));

  const lessonDone = lessonIds.filter(id => p.lessons?.[id]).length;
  const projectDone = projectIds.filter(id => p.projects?.[id]).length;

  const lessonPct = lessonIds.length ? Math.round((lessonDone/lessonIds.length)*100) : 0;
  const projectPct = projectIds.length ? Math.round((projectDone/projectIds.length)*100) : 0;

  const lb = qs("#lessonsBarFill");
  const lt = qs("#lessonsBarText");
  if(lb) lb.style.width = `${lessonPct}%`;
  if(lt) lt.textContent = `${lessonPct}% complete`;

  const pb = qs("#projectsBarFill");
  const pt = qs("#projectsBarText");
  if(pb) pb.style.width = `${projectPct}%`;
  if(pt) pt.textContent = `${projectPct}% complete`;

  const updated = qs("#progressUpdatedAt");
  if(updated) updated.textContent = p.updatedAt ? `Last updated: ${new Date(p.updatedAt).toLocaleString()}` : "";
}

/* ---------- PDF Exports ---------- */
async function exportLessonPDF(lessonId){
  // Uses jsPDF already loaded from CDN on the page
  const container = qs(`#lesson-${lessonId}`);
  if(!container){
    alert("Lesson content not found.");
    return;
  }

  const { jsPDF } = window.jspdf || {};
  if(!jsPDF){
    alert("PDF library not loaded.");
    return;
  }

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const margin = 36;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("AI Education Hub — Lesson Export", margin, 54);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);

  // Convert content to plain text (fast + reliable for static sites)
  const title = container.querySelector("h3")?.innerText || `Lesson ${lessonId}`;
  const body = container.innerText
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  let y = 80;
  doc.setFont("helvetica", "bold");
  doc.text(title, margin, y);
  y += 16;

  doc.setFont("helvetica", "normal");
  const lines = doc.splitTextToSize(body, 612 - margin*2);
  doc.text(lines, margin, y);

  doc.save(`AI_Education_Hub_${lessonId}.pdf`);
}

/* ---------- Boot ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  // Set iframe src everywhere (desktop + drawer)
  qsa("iframe[data-tutor]").forEach(f => f.src = APP_EMBED_URL);

  await initFirebaseIfConfigured(); // safe if not configured
  bindGlobalUI();
  refreshAuthUI();

  // progress only if the page has progress controls
  if(qs("[data-progress-type]")) {
    await initProgressUI();
  }

  // wire PDF buttons
  qsa("[data-export-pdf]").forEach(btn => {
    btn.addEventListener("click", () => exportLessonPDF(btn.getAttribute("data-export-pdf")));
  });
});