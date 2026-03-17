import { useMemo, useState } from "react";

import UploadBox from "../components/UploadBox";
import JobInput from "../components/JobInput";
import MatchPanel from "../components/MatchPanel";
import PdfPreview from "../components/PdfPreview";
import WarningModal from "../components/WarningModal";

const API = "http://127.0.0.1:5000";

export default function ResumeBuilder() {
  // Upload
  const [file, setFile] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [resumeText, setResumeText] = useState("");
  const [isScanned, setIsScanned] = useState(false);
  const [extractError, setExtractError] = useState("");

  // Job input
  const [jobMode, setJobMode] = useState("title");
  const [jobTitle, setJobTitle] = useState("");
  const [jobDesc, setJobDesc] = useState("");

  // Expanded job info (from backend)
  const [expandedJobText, setExpandedJobText] = useState("");
  const [jobKeywords, setJobKeywords] = useState([]); // filtered keywords present in resume
  const [jobExplain, setJobExplain] = useState("");

  // Match results
  const [matching, setMatching] = useState(false);
  const [matchPercent, setMatchPercent] = useState(null);
  const [presentKeywords, setPresentKeywords] = useState([]);
  const [missingKeywords, setMissingKeywords] = useState([]);
  const [matchNote, setMatchNote] = useState("");

  // Generate/export
  const [generating, setGenerating] = useState(false);
  const [pdfUrl, setPdfUrl] = useState("");
  const [showLowMatch, setShowLowMatch] = useState(false);

  const jobTextRaw = useMemo(() => {
    return jobMode === "title" ? jobTitle.trim() : jobDesc.trim();
  }, [jobMode, jobTitle, jobDesc]);

  const canGenerate =
    !!file &&
    !!resumeText &&
    !isScanned &&
    !!jobTextRaw &&
    !extracting &&
    !matching &&
    !generating;

  function resetMatch() {
    setMatchPercent(null);
    setPresentKeywords([]);
    setMissingKeywords([]);
    setMatchNote("");
  }

  function resetJobExpansion() {
    setExpandedJobText("");
    setJobKeywords([]);
    setJobExplain("");
  }

  async function handleExtract(selectedFile) {
    setFile(selectedFile);
    setExtractError("");
    setIsScanned(false);
    setResumeText("");
    setPdfUrl("");
    resetMatch();
    resetJobExpansion();

    if (!selectedFile) {
      setExtractError("Please select a PDF file.");
      return;
    }

    setExtracting(true);

    try {
      const fd = new FormData();
      fd.append("file", selectedFile);

      const res = await fetch(`${API}/api/extract`, {
        method: "POST",
        body: fd,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setExtractError(data?.error || "Extraction failed.");
        return;
      }

      const text = data?.text || "";
      const scanned = !!data?.is_scanned || text.trim().length === 0;

      setResumeText(text);
      setIsScanned(scanned);

      if (scanned) {
        setExtractError(
          "No selectable text found. This may be a scanned PDF. Upload a proper text-based PDF."
        );
      }
    } catch (e) {
      setExtractError("Extraction failed. Check backend is running.");
    } finally {
      setExtracting(false);
    }
  }

  // ✅ IMPORTANT FIX: /api/expand-job needs resumeText too
  async function ensureExpandedJobText() {
    // Determine input text based on mode
    const inputText = jobMode === "title" ? jobTitle.trim() : jobDesc.trim();
    if (!inputText) {
      resetJobExpansion();
      return { jobTextToUse: "", keywords: [], matchPercent: null, present: [], missing: [] };
    }

    // if resume isn't ready yet, just return input and skip network
    if (!resumeText.trim()) {
      setExpandedJobText(inputText);
      setJobExplain("Using job text directly (resume not extracted yet).");
      return { jobTextToUse: inputText, keywords: [], matchPercent: null, present: [], missing: [] };
    }

    // If we've already generated expansion for this exact input and resume hasn't changed,
    // reuse it. (We don't track resume changes, so this is basic caching.)
    if (expandedJobText && expandedJobText.includes(inputText)) {
      return {
        jobTextToUse: expandedJobText.trim(),
        keywords: jobKeywords,
        matchPercent,
        presentKeywords,
        missingKeywords,
      };
    }

    // Call backend for analysis on both titles and descriptions
    try {
      const res = await fetch(`${API}/api/expand-job`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobText: inputText, resumeText }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setExpandedJobText(inputText);
        setJobExplain("Using job text directly (expand failed).");
        setJobKeywords([]);
        return { jobTextToUse: inputText, keywords: [], matchPercent: null, present: [], missing: [] };
      }

      const expanded = (data?.expanded_job_text || inputText).trim();
      const mode = data?.job_mode || jobMode;
      const kw = Array.isArray(data?.job_keywords) ? data.job_keywords : [];
      const percent = typeof data?.match_percent === "number" ? data.match_percent : null;
      const present = Array.isArray(data?.present_keywords) ? data.present_keywords : [];
      const missing = Array.isArray(data?.missing_keywords) ? data.missing_keywords : [];

      setExpandedJobText(expanded);
      if (kw.length) setJobKeywords(kw);
      if (percent !== null) setMatchPercent(percent);
      setPresentKeywords(present);
      setMissingKeywords(missing);

      if (mode === "title") {
        if (kw.length > 0) {
          setJobExplain(
            `Using expanded job text (filtered to resume). Matched keywords: ${kw.join(", ")}`
          );
        } else {
          setJobExplain(
            "Expanded job title, but none of the typical keywords appear in the uploaded resume (match may be low)."
          );
        }
      } else {
        setJobExplain("Using job description (no expansion needed).");
      }

      return { jobTextToUse: expanded, keywords: kw, matchPercent: percent, present, missing };
    } catch (e) {
      setExpandedJobText(inputText);
      setJobExplain("Using job text directly (expand error).");
      setJobKeywords([]);
      return { jobTextToUse: inputText, keywords: [], matchPercent: null, present: [], missing: [] };
    }
  }

  // ✅ Match via backend LLM analysis. ensureExpandedJobText will call
  // /api/expand-job and return both keywords and an overall match_percent.
  async function runMatch() {
    setMatching(true);

    try {
      // Always rely on the backend to analyse and score the match.
      const r = await ensureExpandedJobText();
      // ensureExpandedJobText already updates matchPercent/present/missing if available
      if (r.matchPercent !== undefined && r.matchPercent !== null) {
        setMatchPercent(r.matchPercent);
      }
      if (Array.isArray(r.present)) setPresentKeywords(r.present);
      if (Array.isArray(r.missing)) setMissingKeywords(r.missing);

      const percent = r.matchPercent != null ? r.matchPercent : matchPercent;
      if (percent < 40) {
        setMatchNote("Low match. Resume not strongly aligned.");
      } else {
        setMatchNote("Good match. Ready to generate.");
      }

      return { percent };
    } finally {
      setMatching(false);
    }
  }

  async function generateResume({ force }) {
    setGenerating(true);
    setExtractError("");
    setPdfUrl("");

    try {
      const { percent } = await runMatch();

      if (percent < 40 && !force) {
        setShowLowMatch(true);
        return;
      }

      // ✅ BEST PRACTICE:
      // Send ORIGINAL jobTextRaw to backend.
      // Backend already expands title-mode + filters safely.
      const res = await fetch(`${API}/api/generate-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeText,
          jobText: jobTextRaw, // ✅ raw input
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setExtractError(data?.error || "PDF generation failed.");
        return;
      }

      const url = data?.pdf_url || "";
      if (!url) {
        setExtractError("PDF generated, but pdf_url is missing.");
        return;
      }

      // If backend gives expanded_job_text (title mode), show it
      if (jobMode === "title" && data?.expanded_job_text) {
        setExpandedJobText(data.expanded_job_text);
        const kw = Array.isArray(data?.job_keywords) ? data.job_keywords : [];
        setJobKeywords(kw);
        if (kw.length > 0) {
          setJobExplain(
            `Using expanded job title (filtered to resume). Matched keywords: ${kw.join(", ")}`
          );
        } else {
          setJobExplain(
            "Expanded job title, but none of the typical keywords appear in the uploaded resume."
          );
        }
      }

      setPdfUrl(url);
    } catch (e) {
      setExtractError("Resume generation failed. Check backend is running.");
    } finally {
      setGenerating(false);
    }
  }

  function downloadPDF() {
    if (!pdfUrl) return;

    const a = document.createElement("a");
    a.href = pdfUrl;
    a.download = "resume.pdf";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function viewPDF() {
    if (!pdfUrl) return;
    window.open(pdfUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="app">


      <main className="container">
        <div className="hero">
          <h1>Convert your Resume into a Career Catalyst</h1>
          <p>AI-powered precision that aligns your skills with any job description in seconds.</p>
        </div>

        {/* Upload */}
        <div className="card">
          <div className="cardHeader">
            <h3>Upload Resume PDF</h3>
          </div>

          <UploadBox file={file} extracting={extracting} onExtract={handleExtract} />

          {extractError && <div className="alert danger">{extractError}</div>}
        </div>

        {/* Job input */}
        <div className="card">
          <div className="cardHeader">
            <h3>Job Title / Description</h3>
          </div>

          <JobInput
            mode={jobMode}
            setMode={(m) => {
              setJobMode(m);
              resetJobExpansion();
              resetMatch();
            }}
            jobTitle={jobTitle}
            setJobTitle={(v) => {
              setJobTitle(v);
              resetJobExpansion();
              resetMatch();
            }}
            jobDesc={jobDesc}
            setJobDesc={(v) => {
              setJobDesc(v);
              resetMatch();
            }}
          />

          {jobMode === "title" && jobExplain && (
            <div className="muted" style={{ marginTop: 8 }}>
              {jobExplain}
            </div>
          )}
        </div>

        {/* Generate */}
        <div className="generateWrap">
          <button
            className={`btn primary big ${!canGenerate ? "disabledBlur" : ""}`}
            disabled={!canGenerate}
            onClick={() => generateResume({ force: false })}
          >
            {generating ? "Generating..." : "Generate PDF Resume"}
          </button>
        </div>

        {/* Match */}
        {matchPercent !== null && (
          <MatchPanel
            matchPercent={matchPercent}
            presentKeywords={presentKeywords}
            missingKeywords={missingKeywords}
            note={matchNote}
          />
        )}

        {/* Preview (PDF) */}
        <div className="card">
          <div className="cardHeader">
            <h3>Preview</h3>
          </div>

          <PdfPreview pdfUrl={pdfUrl} />

          <div className="exportRow">
            <button className="btn secondary" disabled={!pdfUrl} onClick={viewPDF}>
              View PDF
            </button>

            <button className="btn secondary" disabled={!pdfUrl} onClick={downloadPDF}>
              Download PDF
            </button>
          </div>
        </div>

        {/* Warning modal */}
        <WarningModal
          open={showLowMatch}
          matchPercent={matchPercent ?? 0}
          onClose={() => setShowLowMatch(false)}
          onGenerateAnyway={() => {
            setShowLowMatch(false);
            generateResume({ force: true });
          }}
          onGoAnalyzer={() => {
            setShowLowMatch(false);
            alert("Resume Analyzer coming soon");
          }}
        />
      </main>

      <footer className="footer">Career Catalyst | AI Resume Alignment Ready</footer>
    </div>
  );
}

/* helpers */

function extractKeywords(text) {
  if (!text) return [];

  const stop = new Set([
    "with", "from", "that", "this", "have", "has", "had", "will", "your", "you", "the", "and", "for", "are",
    "was", "were", "but", "not", "into", "over", "than", "then", "also", "only", "able", "using", "use",
    "job", "role", "resume", "work", "experience", "skills", "education"
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => w.length >= 3)
    .filter((w) => !stop.has(w));

  const uniq = [];
  const seen = new Set();
  for (const w of words) {
    if (!seen.has(w)) {
      seen.add(w);
      uniq.push(w);
    }
  }

  return uniq.slice(0, 80);
}