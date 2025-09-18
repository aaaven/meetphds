import React, { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { ChevronDown, CalendarDays, Upload, LinkIcon, Filter, RefreshCw, AlertCircle, Search } from "lucide-react";

/**
 * PhD Supervisory Meeting Records – Single‑Page App (SPA)
 * by Aven Le zhou
 * ------------------------------------------------------
 * What this does
 *  - Reads a CSV (either from a published Google Sheet CSV URL or manual upload)
 *  - Groups records by Project
 *  - Sorts each project's records by Date (newest → oldest) as a timeline
 *  - Shows Topic, Subtopics/Agenda, and "My Inputs & Suggestions" per meeting
 *  - Provides filters (by student, project, date range, free‑text search)
 *  - Optional: link back to the original Google Form response URL (if present)
 *
 * How to use (quick start)
 *  1) If you publish your Google Sheet to the web (File → Share → Publish to web → CSV),
 *     paste the CSV URL into the "CSV Source URL" box and click Load.
 *     OR click "Upload CSV" and select a CSV exported from Google Sheets.
 *  2) Adjust the CSV column mapping below (COLUMN_MAP) to match your sheet headers.
 *  3) The app will parse, group by Project, and render a clean timeline view.
 *
 * Expected CSV schema (customize via COLUMN_MAP below):
 *  - date:            e.g., 2025-09-18, 18/09/2025, or any recognizable date string
 *  - student:         full name or short name
 *  - project:         project title or short code (used for grouping)
 *  - topic:           main topic of the meeting
 *  - subtopics:       semicolon- or comma-separated subtopics/agenda items
 *  - my_inputs:       your inputs and suggestions
 *  - link (optional): a URL to more artifacts (slides, doc, etc.)
 *  - meeting_id (optional): stable unique id if you have one
 *
 * PRO TIP – Automating from Google Sheets
 *  If your Sheet is private, consider creating an Apps Script web app to serve CSV securely.
 *  For a fast path, use "Publish to the web" → CSV URL (not private). You can also
 *  keep it manual by periodically exporting CSV and using Upload.
 */

/************************************
 * 1) CONFIGURE YOUR COLUMN NAMES HERE
 ************************************/
const COLUMN_MAP = {
  timestamp: "Timestamp", 
  date: "Date of Meeting", // header text in your CSV
  student: "Student Name (be consistent)",
  project: "Discussed Project Title  (be consistent)",
  topic: "Meeting Topic",
  subtopics: "Subtopics / Agenda Items",
  my_inputs: "Supervisor Inputs & Suggestions",
  link: "Link to Additional Materials (Optional)",
  action_points: "Action Points",
};

// Optional: prefill a CSV URL here (e.g., your published Google Sheet CSV link)
const DEFAULT_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR3iDeJ3NzOCT_0_YZ9fE8Io9uLm_rpnNhj38EQdSHNd9O8PtJeGY31otTwmztIPKkcaPilrjjpSwWR/pub?output=csv";

/************************************
 * 2) TYPES & HELPERS
 ************************************/
function pickColumn(raw, preferredName, regex) {
  // Try preferred mapping first
  if (preferredName && Object.prototype.hasOwnProperty.call(raw, preferredName)) {
    return raw[preferredName];
  }
  // Fallback: scan keys with a regex (case-insensitive)
  const keys = Object.keys(raw || {});
  for (const k of keys) {
    if (regex.test(k)) return raw[k];
  }
  return undefined;
}

function parseDateLoose(v) {
  if (!v) return null;
  // Try multiple formats by relying on Date parse; for consistent sort, normalize to yyyy-mm-dd
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d;
}

function toYMD(d) {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function splitList(text) {
  if (!text) return [];
  // split on semicolons or newlines, trim, and drop empties
  return String(text)
    .split(/[;\n]/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeRecord(raw) {
  const dateRawPrimary = raw[COLUMN_MAP.date];
  const dateRawFallback = raw[COLUMN_MAP.timestamp];
  const dateRaw = dateRawPrimary || dateRawFallback;
  const date = parseDateLoose(dateRaw);
  const actionRaw = pickColumn(
    raw,
    COLUMN_MAP.action_points,
    /action\s*(points?|items?|to\s*-?\s*dos?|todos?)/i
  ) || "";
  const action_items = splitList(actionRaw);
  return {
    meeting_id: raw[COLUMN_MAP.meeting_id] || "",
    date,
    date_label: date ? toYMD(date) : String(dateRaw || ""),
    student: raw[COLUMN_MAP.student] || "",
    project: raw[COLUMN_MAP.project] || "Unspecified Project",
    topic: raw[COLUMN_MAP.topic] || "(No topic)",
    subtopics: splitList(raw[COLUMN_MAP.subtopics] || ""),
    my_inputs: raw[COLUMN_MAP.my_inputs] || "(No inputs)",
    link: raw[COLUMN_MAP.link] || "",
    action_items,
    _raw: raw,
  };
}

function groupByProject(records) {
  const map = new Map();
  records.forEach((r) => {
    const key = r.project || "Unspecified Project";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  });
  // sort each project's entries by date DESC (new → old)
  for (const [k, arr] of map) {
    arr.sort((a, b) => {
      const ta = a.date ? a.date.getTime() : 0;
      const tb = b.date ? b.date.getTime() : 0;
      return tb - ta;
    });
  }
  return map;
}

/************************************
 * 3) UI BUILDING BLOCKS (no external UI kit needed)
 ************************************/
function Section({ title, children, right }) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-semibold">{title}</h2>
        {right}
      </div>
      <div className="rounded-2xl border p-4 shadow-sm">{children}</div>
    </div>
  );
}

function Chip({ children }) {
  return (
    <span className="inline-block rounded-full border px-2 py-0.5 text-xs mr-2 mb-1">
      {children}
    </span>
  );
}

function Accordion({ title, subtitle, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border mb-4 overflow-hidden">
      <button
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="text-left">
          <div className="text-lg font-semibold">{title}</div>
          {subtitle && <div className="text-sm text-gray-500">{subtitle}</div>}
        </div>
        <ChevronDown className={`transition-transform ${open ? "rotate-180" : "rotate-0"}`} />
      </button>
      {open && <div className="p-4 border-t bg-white">{children}</div>}
    </div>
  );
}

/************************************
 * 4) MAIN APP
 ************************************/
export default function App() {
  const [csvUrl, setCsvUrl] = useState(DEFAULT_CSV_URL);
  const [rawRows, setRawRows] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Filters
  const [projectFilter, setProjectFilter] = useState("ALL");
  const [studentFilter, setStudentFilter] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [q, setQ] = useState("");

  // Auto-load from DEFAULT_CSV_URL on mount
  useEffect(() => {
    if (DEFAULT_CSV_URL) {
      loadFromUrl();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Parse & normalize
  const records = useMemo(() => rawRows.map(normalizeRecord), [rawRows]);

  // Distinct projects & students for filters
  const { projects, students } = useMemo(() => {
    const pset = new Set();
    const sset = new Set();
    records.forEach((r) => {
      if (r.project) pset.add(r.project);
      if (r.student) sset.add(r.student);
    });
    return { projects: ["ALL", ...Array.from(pset).sort()], students: ["ALL", ...Array.from(sset).sort()] };
  }, [records]);

  // Filtered view
  const filteredRecords = useMemo(() => {
    const df = dateFrom ? new Date(dateFrom) : null;
    const dt = dateTo ? new Date(dateTo) : null;
    const ql = q.trim().toLowerCase();

    return records.filter((r) => {
      if (projectFilter !== "ALL" && r.project !== projectFilter) return false;
      if (studentFilter !== "ALL" && r.student !== studentFilter) return false;

      if (df && r.date && r.date < df) return false;
      if (dt && r.date && r.date > dt) return false;

      if (ql) {
        const hay = [r.student, r.project, r.topic, r.subtopics.join(" "), r.my_inputs].join(" \n ").toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      return true;
    });
  }, [records, projectFilter, studentFilter, dateFrom, dateTo, q]);

  const sortedRecords = useMemo(() => {
    return [...filteredRecords].sort((a, b) => {
      const ta = a.date ? a.date.getTime() : 0;
      const tb = b.date ? b.date.getTime() : 0;
      return tb - ta; // newest first
    });
  }, [filteredRecords]);

  function handleCsvFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError("");
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        setRawRows(res.data || []);
        setLoading(false);
      },
      error: (err) => {
        setError(err.message || "Failed to parse CSV");
        setLoading(false);
      },
    });
  }

  async function loadFromUrl() {
    if (!csvUrl) {
      setError("Please enter a CSV URL.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const bust = `${Date.now()}`;
      const url = csvUrl.includes("?") ? `${csvUrl}&t=${bust}` : `${csvUrl}?t=${bust}`;
      const resp = await fetch(url, { cache: 'no-store' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => {
          setRawRows(res.data || []);
          console.log('Loaded rows:', (res.data || []).length, 'Columns:', Object.keys((res.data || [])[0] || {}));
          setLoading(false);
        },
        error: (err) => {
          setError(err.message || "Failed to parse CSV from URL");
          setLoading(false);
        },
      });
    } catch (e) {
      setError(e.message || "Failed to fetch CSV");
      setLoading(false);
    }
  }

  function resetFilters() {
    setProjectFilter("ALL");
    setStudentFilter("ALL");
    setDateFrom("");
    setDateTo("");
    setQ("");
  }

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <header className="flex items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Supervisory Meeting Records</h1>
        </div>
      </header>

      {/* Results */}
      <Section title="Records">
        {sortedRecords.length === 0 ? (
          <div className="text-sm text-gray-600">No records to show. Load a CSV or adjust filters.</div>
        ) : (
          <div className="space-y-4">
            {sortedRecords.map((r, idx) => (
              <div key={r.meeting_id || `${r.project}-${idx}`} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <CalendarDays size={16} />
                    <span className="font-medium">{r.date_label || "(no date)"}</span>
                    <span>•</span>
                    <span>{r.student || "(no student)"}</span>
                    <span>•</span>
                    <span className="italic">{r.project || "Unspecified Project"}</span>
                  </div>
                </div>

                <div className="mt-3">
                  <div>
                    <div className="text-sm uppercase tracking-wide text-gray-500 mb-1">Meeting Topic</div>
                    <div className="text-base font-semibold">{r.topic}</div>
                  </div>
                  {r.subtopics.length > 0 && (
                    <div className="mt-3">
                      <div className="text-sm uppercase tracking-wide text-gray-500 mb-1">Agenda</div>
                      <div>
                        {r.subtopics.map((s, i) => (
                          <Chip key={i}>{s}</Chip>
                        ))}
                      </div>
                    </div>
                  )}
                  {r.link && (
                    <div className="mt-3">
                      <div className="text-sm uppercase tracking-wide text-gray-500 mb-1">External Materials</div>
                      <a className="text-sm underline break-all" href={r.link} target="_blank" rel="noreferrer">{r.link}</a>
                    </div>
                  )}
                  <div className="mt-3">
                    <div className="text-sm uppercase tracking-wide text-gray-500 mb-1">Supervisor's Inputs & Suggestions</div>
                    <div className="prose prose-sm max-w-none">
                      <p>{r.my_inputs}</p>
                    </div>
                  </div>
                  {r.action_items && r.action_items.length > 0 && (
                    <div className="mt-3">
                      <div className="text-sm uppercase tracking-wide text-gray-500 mb-1">Action Points</div>
                      <ul className="list-disc pl-5">
                        {r.action_items.map((a, i) => (
                          <li key={i}>{a}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Filters */}
      <Section title="Filters">
        <div className="grid md:grid-cols-5 gap-3">
          <div className="md:col-span-1">
            <label className="block text-xs font-medium mb-1">Project</label>
            <select className="w-full rounded-xl border px-3 py-2" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
              {projects.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-1">
            <label className="block text-xs font-medium mb-1">Student</label>
            <select className="w-full rounded-xl border px-3 py-2" value={studentFilter} onChange={(e) => setStudentFilter(e.target.value)}>
              {students.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-1">
            <label className="block text-xs font-medium mb-1">From (date)</label>
            <input className="w-full rounded-xl border px-3 py-2" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="md:col-span-1">
            <label className="block text-xs font-medium mb-1">To (date)</label>
            <input className="w-full rounded-xl border px-3 py-2" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div className="md:col-span-1">
            <label className="block text-xs font-medium mb-1 flex items-center gap-1">
              <Search size={14}/> Search
            </label>
            <input className="w-full rounded-xl border px-3 py-2" placeholder="topic / agenda / inputs" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
      </Section>
    </div>
  );
}
