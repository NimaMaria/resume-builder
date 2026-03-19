import { useMemo, useState } from "react";

import UploadBox from "../components/UploadBox";
import JobInput from "../components/JobInput";
import MatchModal from "../components/MatchModal";
import PdfPreview from "../components/PdfPreview";
import AnalysisPanel from "../components/AnalysisPanel";

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

  // Analysis
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);

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
    if (!resumeText || !jobText) return 0;
    setMatching(true);

    try {
      const res = await fetch("http://127.0.0.1:5000/api/expand-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText, jobText }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Match failed");

      const percent = data?.match_percent ?? 0;
      setMatchPercent(percent);
      setPresentKeywords(data?.present_keywords || []);
      setMissingKeywords(data?.missing_keywords || []);

      if (percent < 40) {
        setMatchNote("Low match. Resume not strongly aligned.");
      } else if (percent < 70) {
        setMatchNote("Moderate match. Could be improved.");
      } else {
        setMatchNote("Strong match! Ready to generate.");
      }

      return percent;
    } catch (e) {
      console.error("Match error:", e);
      return 0;
    } finally {
      setMatching(false);
    }
  }

  async function runContentAnalysis() {
    if (!resumeText) return;
    setAnalyzing(true);
    try {
      const res = await fetch("http://127.0.0.1:5000/api/analyze-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText, jobText }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setAnalysis(data);
      }
    } catch (e) {
      console.error("Analysis failed", e);
    } finally {
      setAnalyzing(false);
    }
  }

  async function generateResume({ force }) {
    setExtractError("");
    
    // 1. Direct generation if forced
    if (force) {
      setGenerating(true);
      try {
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
      return;
    }

    // 2. Initial check flow
    setGenerating(true);
    setPdfUrl("");

    try {
      const percent = await runMatch();

      if (percent > 70) {
        // High match: auto-generate
        await generateResume({ force: true });
      } else {
        // Low/Moderate match: show modal to decision
        setShowLowMatch(true);
        setGenerating(false);
      }
    } catch (e) {
      setExtractError("Match calculation failed.");
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
          <h1>Career Catalyst</h1>
          <p>Optimize your resume with AI. Align your skills with any job description in seconds.</p>
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

        {/* Content Analysis */}
        {(resumeText) && (
          <AnalysisPanel
            analysis={analysis}
            loading={analyzing}
            onAnalyze={runContentAnalysis}
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

        {/* Match modal */}
        <MatchModal
          open={showLowMatch}
          matchPercent={matchPercent ?? 0}
          onClose={() => setShowLowMatch(false)}
          onGenerateAnyway={() => {
            setShowLowMatch(false);
            generateResume({ force: true });
          }}
          onGoAnalyzer={() => {
            setShowLowMatch(false);
            const el = document.getElementById("resume-analyzer");
            if (el) el.scrollIntoView({ behavior: 'smooth' });
            runContentAnalysis();
          }}
        />
      </main>

      <footer className="footer">Career Catalyst (AI Resume Alignment) Ready</footer>
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

  return uniq.slice(0, 60);
}