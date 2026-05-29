let sections = [];
let activeSectionIdx = 0;
let combinedClasses = [];
let lastResult = null;
let activeResultTab = 0;

const TYPE_COLOR = { Lecture: "#6c63ff", Practical: "#10b981", Tutorial: "#f59e0b" };
const TYPE_ICON  = { Lecture: "📖", Practical: "🧪", Tutorial: "✏️" };

// ---- SECTIONS ----
function addSection() {
  const input = document.getElementById("sectionName");
  const name = input.value.trim();
  if (!name) { showToast("Enter a section name", "error"); return; }
  if (sections.find(s => s.name.toLowerCase() === name.toLowerCase())) { showToast("Already exists", "error"); return; }
  sections.push({ name, teachers: [] });
  activeSectionIdx = sections.length - 1;
  input.value = "";
  renderSectionTabs(); renderTeacherList(); renderCombinedPanel(); updateGenerateBtn();
  showToast(`"${name}" added`, "success");
}

function selectSection(idx) {
  activeSectionIdx = idx;
  renderSectionTabs(); renderTeacherList();
}

function removeSection(idx) {
  const name = sections[idx].name;
  sections.splice(idx, 1);
  combinedClasses = combinedClasses.map(c => ({ ...c, sections: c.sections.filter(s => s !== name) }))
                                   .filter(c => c.sections.length >= 2);
  if (activeSectionIdx >= sections.length) activeSectionIdx = Math.max(0, sections.length - 1);
  renderSectionTabs(); renderTeacherList(); renderCombinedPanel(); renderCombinedList(); updateGenerateBtn();
}

function renderSectionTabs() {
  const container = document.getElementById("sectionTabs");
  const label = document.getElementById("formSectionLabel");
  if (!sections.length) { container.innerHTML = `<p class="muted-hint">No sections yet</p>`; label.textContent = ""; return; }
  label.textContent = sections[activeSectionIdx]?.name || "";
  container.innerHTML = sections.map((s, i) => `
    <div class="sec-tab ${i === activeSectionIdx ? "active" : ""}" onclick="selectSection(${i})">
      <span>${escHtml(s.name)}</span>
      <button class="sec-tab-remove" onclick="event.stopPropagation();removeSection(${i})">✕</button>
    </div>`).join("");
}

// ---- TEACHERS ----
function addTeacher() {
  if (!sections.length) { showToast("Add a section first", "error"); return; }
  const name    = document.getElementById("teacherName").value.trim();
  const subject = document.getElementById("subject").value.trim();
  const type    = document.getElementById("classType").value;
  const periods = parseInt(document.getElementById("classPeriods").value);
  const weekly  = parseInt(document.getElementById("weeklyClasses").value);
  if (!name || !subject || !weekly) { showToast("Fill in all fields", "error"); return; }
  sections[activeSectionIdx].teachers.push({ name, subject, type, periods, weekly_classes: weekly });
  renderTeacherList(); updateGenerateBtn();
  document.getElementById("teacherName").value = "";
  document.getElementById("subject").value = "";
  document.getElementById("weeklyClasses").value = "3";
  showToast(`${name} added`, "success");
}

function removeTeacher(idx) {
  sections[activeSectionIdx].teachers.splice(idx, 1);
  renderTeacherList(); updateGenerateBtn();
}

function renderTeacherList() {
  const container = document.getElementById("teacherItems");
  const count = document.getElementById("teacherCount");
  const sec = sections[activeSectionIdx];
  if (!sec) { count.textContent = 0; container.innerHTML = `<p class="muted-hint">Select a section first</p>`; return; }
  count.textContent = sec.teachers.length;
  if (!sec.teachers.length) { container.innerHTML = `<p class="muted-hint">No teachers in this section</p>`; return; }
  container.innerHTML = sec.teachers.map((t, i) => {
    const color = TYPE_COLOR[t.type] || "#888";
    const periodsLabel = t.periods === 2 ? " · 2 periods" : "";
    return `<div class="teacher-card">
      <div class="teacher-card-info">
        <div class="name">${escHtml(t.name)}</div>
        <div class="meta">${escHtml(t.subject)} &bull; ${t.weekly_classes}x/week
          <span class="type-badge" style="background:${color}22;color:${color}">${t.type}${periodsLabel}</span>
        </div>
      </div>
      <button class="teacher-card-remove" onclick="removeTeacher(${i})">✕</button>
    </div>`;
  }).join("");
}

// ---- COMBINED ----
function renderCombinedPanel() {
  document.getElementById("combinedPanel").style.display = sections.length >= 2 ? "block" : "none";
  renderCombinedSectionChecks();
}

function renderCombinedSectionChecks() {
  document.getElementById("cbSectionChecks").innerHTML = sections.map(s => `
    <label class="cb-check">
      <input type="checkbox" value="${escHtml(s.name)}" checked/> ${escHtml(s.name)}
    </label>`).join("");
}

function toggleCombinedForm() {
  const f = document.getElementById("combinedForm");
  f.style.display = f.style.display === "none" ? "block" : "none";
  renderCombinedSectionChecks();
}

function addCombined() {
  const teacher = document.getElementById("cbTeacher").value.trim();
  const subject = document.getElementById("cbSubject").value.trim();
  const type    = document.getElementById("cbType").value;
  const periods = parseInt(document.getElementById("cbPeriods").value);
  const weekly  = parseInt(document.getElementById("cbWeekly").value);
  const checked = [...document.querySelectorAll("#cbSectionChecks input:checked")].map(el => el.value);
  if (!teacher || !subject || !weekly) { showToast("Fill all fields", "error"); return; }
  if (checked.length < 2) { showToast("Select at least 2 sections", "error"); return; }
  combinedClasses.push({ teacher, subject, type, periods, weekly_classes: weekly, sections: checked });
  document.getElementById("cbTeacher").value = "";
  document.getElementById("cbSubject").value = "";
  document.getElementById("cbWeekly").value = "2";
  document.getElementById("combinedForm").style.display = "none";
  renderCombinedList(); updateGenerateBtn();
  showToast("Combined class added", "success");
}

function removeCombined(idx) { combinedClasses.splice(idx, 1); renderCombinedList(); }

function renderCombinedList() {
  const container = document.getElementById("combinedList");
  if (!combinedClasses.length) { container.innerHTML = ""; return; }
  container.innerHTML = combinedClasses.map((c, i) => {
    const color = TYPE_COLOR[c.type] || "#888";
    return `<div class="combined-item">
      <div>
        <span class="combined-subject">${escHtml(c.subject)}</span>
        <span class="combined-meta">${escHtml(c.teacher)} &bull; ${c.weekly_classes}x/week &bull; ${c.sections.join(", ")}
          <span class="type-badge" style="background:${color}22;color:${color}">${c.type}</span>
        </span>
      </div>
      <button class="teacher-card-remove" onclick="removeCombined(${i})">✕</button>
    </div>`;
  }).join("");
}

function updateGenerateBtn() {
  const hasContent = sections.some(s => s.teachers.length > 0) || combinedClasses.length > 0;
  document.getElementById("generateBtn").disabled = sections.length === 0 || !hasContent;
}

// ---- GENERATE ----
async function generateTimetable() {
  resetEmptyState();
  setView("loading");
  document.getElementById("generateBtn").disabled = true;
  const config = {
    start:          document.getElementById("cfgStart").value    || "09:30",
    end:            document.getElementById("cfgEnd").value      || "16:25",
    duration:       parseInt(document.getElementById("cfgDuration").value) || 50,
    lunch_duration: parseInt(document.getElementById("cfgLunch").value)    || 60,
  };
  try {
    const res  = await fetch("/api/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sections, combined: combinedClasses, config })
    });
    const data = await res.json();
    if (!res.ok) {
      showError(data.error || "Generation failed");
      setView(lastResult ? "table" : "empty");
      return;
    }
    lastResult = data;
    activeResultTab = 0;
    renderResultTabs(data);
    renderTimetable(data.sections[0], data.days, data.day_slots);
    updateStats(data.stats);
    showToast("Timetables generated", "success");
  } catch (e) {
    showToast("Server error", "error");
    setView(lastResult ? "table" : "empty");
  }
}

// ---- RENDER TIMETABLE ----
function renderResultTabs(data) {
  const bar = document.getElementById("resultTabBar");
  bar.style.display = "flex";
  bar.innerHTML = data.sections.map((s, i) => `
    <button class="result-tab ${i === 0 ? "active" : ""}" onclick="switchResultTab(${i})">
      ${escHtml(s.section)}
      ${s.stats.unscheduled > 0 ? `<span class="warn-dot">!</span>` : ""}
    </button>`).join("");
}

function switchResultTab(idx) {
  activeResultTab = idx;
  document.querySelectorAll(".result-tab").forEach((el, i) => el.classList.toggle("active", i === idx));
  renderTimetable(lastResult.sections[idx], lastResult.days, lastResult.day_slots);
}

function renderTimetable(secData, days, daySlots) {
  const maxRows = Math.max(...days.map(d => (daySlots[d] || []).length));

  document.getElementById("timetableHead").innerHTML = `<tr>
    <th class="time-col">Slot</th>
    ${days.map(d => `<th>${d}</th>`).join("")}
  </tr>`;

  let rows = "";
  for (let i = 0; i < maxRows; i++) {
    // Collect this row's slot info per day
    const dayData = days.map(d => (daySlots[d] || [])[i] || null);

    // Is this a lunch row for at least one day?
    const anyLunch = dayData.some(s => s && s.is_lunch);

    // Time label: use first non-null slot's time
    const firstSlot = dayData.find(s => s);
    const timeLabel = firstSlot ? `${firstSlot.slot}–${firstSlot.end}` : "";

    let cells = days.map((d, di) => {
      const s = dayData[di];
      if (!s) return `<td></td>`;
      if (s.is_lunch) {
        return `<td class="lunch-cell-day">🍽 Lunch<br/><span class="time-range">${s.slot}–${s.end}</span></td>`;
      }
      return renderCell(secData.grid[d]?.[i], s);
    }).join("");

    const rowClass = anyLunch ? ' class="lunch-row"' : "";
    rows += `<tr${rowClass}><td class="time-cell">${timeLabel}</td>${cells}</tr>`;
  }

  document.getElementById("timetableBody").innerHTML = rows;
  setView("table");
  document.getElementById("generateBtn").disabled = false;
  document.getElementById("mainTitle").textContent = `Timetable — ${secData.section}`;
  document.getElementById("mainSubtitle").textContent =
    `${secData.stats.scheduled} scheduled${secData.stats.unscheduled ? `, ${secData.stats.unscheduled} unscheduled` : ""}`;
  document.getElementById("headerActions").style.display = "flex";
}

function renderCell(slotData, s) {
  if (!slotData) return `<td></td>`;
  const e = slotData.entry;
  if (!e) return `<td><span class="cell-free">—</span></td>`;

  const color = TYPE_COLOR[e.type] || "#888";
  const icon  = TYPE_ICON[e.type]  || "📌";
  const combinedTag = e.combined ? `<div class="combined-tag">🔗 combined</div>` : "";
  const timeRange = s ? `<div class="time-range">${s.slot}–${s.end}</div>` : "";

  if (e.continuation) {
    // Show a continuation bar — same color, no header, just time range
    return `<td>
      <div class="cell-content cell-continuation" style="border-color:${color}44;background:${color}18;border-top:2px dashed ${color}66">
        <div class="cont-label" style="color:${color}99">↕ continued</div>
        ${timeRange}
      </div>
    </td>`;
  }

  return `<td>
    <div class="cell-content" style="border-color:${color}44;background:${color}18">
      <div class="cell-top">
        <span class="cell-subject" style="color:${color}">${escHtml(e.subject)}</span>
        <span class="type-badge" style="background:${color}33;color:${color}">${icon} ${e.type}</span>
      </div>
      <div class="cell-teacher">${escHtml(e.teacher)}</div>
      ${timeRange}
      ${combinedTag}
    </div>
  </td>`;
}

// ---- STATS ----
function updateStats(stats) {
  document.getElementById("statScheduled").textContent = stats.total_scheduled;
  document.getElementById("statUnscheduled").textContent = stats.total_unscheduled;
  document.getElementById("statUnscheduledPill").style.display = stats.total_unscheduled > 0 ? "inline-flex" : "none";
}

// ---- EXPORT ----
async function exportCSV() {
  if (!lastResult) return;
  const secData = lastResult.sections[activeResultTab];
  const res = await fetch("/api/export/csv", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grid: secData.grid, days: lastResult.days, section: secData.section })
  });
  const blob = await res.blob();
  const a = Object.assign(document.createElement("a"),
    { href: URL.createObjectURL(blob), download: `timetable_${secData.section}.csv` });
  a.click();
  showToast("CSV downloaded", "success");
}

// ---- VIEW ----
function showError(msg) {
  document.getElementById("mainTitle").textContent = "Cannot Generate";
  document.getElementById("mainSubtitle").textContent = msg;
  document.getElementById("headerActions").style.display = "none";
  setView("empty");
  document.getElementById("emptyState").innerHTML = `
    <div class="error-state">
      <div style="font-size:2.5rem">⚠️</div>
      <p class="error-msg">${escHtml(msg)}</p>
    </div>`;
  // Reset empty state after next generate
}

function resetEmptyState() {
  document.getElementById("emptyState").innerHTML = `
    <div class="empty-icon">🗓️</div>
    <p>Your timetable will appear here</p>`;
}

function setView(view) {
  document.getElementById("emptyState").style.display       = view === "empty"   ? "flex"  : "none";
  document.getElementById("loadingState").style.display     = view === "loading" ? "flex"  : "none";
  document.getElementById("timetableWrapper").style.display = view === "table"   ? "flex"  : "none";
}

// ---- UTILS ----
function showToast(msg, type = "") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove("show"), 3000);
}

function escHtml(str) {
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

document.addEventListener("DOMContentLoaded", () => {
  ["teacherName","subject","weeklyClasses"].forEach(id =>
    document.getElementById(id).addEventListener("keydown", e => { if (e.key === "Enter") addTeacher(); }));
  document.getElementById("sectionName").addEventListener("keydown", e => { if (e.key === "Enter") addSection(); });

  // Auto-set periods when type changes
  document.getElementById("classType").addEventListener("change", e => {
    document.getElementById("classPeriods").value = e.target.value === "Practical" ? "2" : "1";
  });
  document.getElementById("cbType").addEventListener("change", e => {
    document.getElementById("cbPeriods").value = e.target.value === "Practical" ? "2" : "1";
  });

  renderSectionTabs(); renderTeacherList();
});
