import { useMemo, useState } from "react";
import Navbar from "../components/Navbar";
import UploadBox from "../components/UploadBox";
import JobInput from "../components/JobInput";
import MatchPanel from "../components/MatchPanel";
import PdfPreview from "../components/PdfPreview";
import WarningModal from "../components/WarningModal";

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

  const jobText = useMemo(() => {
    return jobMode === "title" ? jobTitle.trim() : jobDesc.trim();
  }, [jobMode, jobTitle, jobDesc]);

  const canGenerate =
    !!file &&
    !!resumeText &&
    !isScanned &&
    !!jobText &&
    !extracting &&
    !matching &&
    !generating;

  async function handleExtract(selectedFile) {
    setFile(selectedFile);
    setExtractError("");
    setIsScanned(false);
    setResumeText("");
    setPdfUrl("");
    setMatchPercent(null);
    setPresentKeywords([]);
    setMissingKeywords([]);
    setMatchNote("");

    if (!selectedFile) {
      setExtractError("Please select a PDF file.");
      return;
    }

    setExtracting(true);

    try {
      const fd = new FormData();
      fd.append("file", selectedFile);

      const res = await fetch("http://127.0.0.1:5000/api/extract", {
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

  async function runMatch() {
    setMatching(true);

    try {
      await new Promise((r) => setTimeout(r, 200));

      const jobKeywords = extractKeywords(jobText);
      const resumeKeywords = new Set(extractKeywords(resumeText));

      const present = jobKeywords.filter((k) => resumeKeywords.has(k));
      const missing = jobKeywords.filter((k) => !resumeKeywords.has(k));

      const percent =
        jobKeywords.length === 0
          ? 0
          : Math.round((present.length / jobKeywords.length) * 100);

      setMatchPercent(percent);
      setPresentKeywords(present);
      setMissingKeywords(missing);

      if (percent < 40) {
        setMatchNote("Low match. Resume not strongly aligned.");
      } else {
        setMatchNote("Good match. Ready to generate.");
      }

      return percent;
    } finally {
      setMatching(false);
    }
  }

  async function generateResume({ force }) {
    setGenerating(true);
    setExtractError("");
    setPdfUrl("");

    try {
      const percent = await runMatch();

      if (percent < 40 && !force) {
        setShowLowMatch(true);
        return;
      }

      const res = await fetch("http://127.0.0.1:5000/api/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText, jobText }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setExtractError(data?.error || "PDF generation failed.");
        return;
      }

      // Edge-friendly stable URL served by backend
      const url = data?.pdf_url || "";
      if (!url) {
        setExtractError("PDF generated, but pdf_url is missing.");
        return;
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
      <Navbar />

      <main className="container">
        <div className="hero">
          <h1>Resume Builder</h1>
          <p>Upload resume → add job description → generate PDF (Groq + pdflatex)</p>
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
            setMode={setJobMode}
            jobTitle={jobTitle}
            setJobTitle={setJobTitle}
            jobDesc={jobDesc}
            setJobDesc={setJobDesc}
          />
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

      <footer className="footer">RoleNavigator (Groq → LaTeX → PDF) Ready</footer>
    </div>
  );
}

/* helpers */

function extractKeywords(text) {
  if (!text) return [];

  const stop = new Set([
    "with","from","that","this","have","has","had","will","your","you","the","and","for","are",
    "was","were","but","not","into","over","than","then","also","only","able","using","use",
    "job","role","resume","work","experience","skills","education"
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

  return uniq.slice(0, 60);
}