import { useMemo, useState } from "react";
import UploadBox from "../components/UploadBox";
import JobInput from "../components/JobInput";
import MatchModal from "../components/WarningModal";
import PdfPreview from "../components/PdfPreview";
import ResumeEditor from "../components/ResumeEditor";


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

  // Match results
  const [matching, setMatching] = useState(false);
  const [matchPercent, setMatchPercent] = useState(null);
  const [showLowMatch, setShowLowMatch] = useState(false);

  // Generate state
  const [generating, setGenerating] = useState(false);
  const [pdfUrl, setPdfUrl] = useState("");

  // Editor State
  const [resumeData, setResumeData] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);


  const jobText = useMemo(() => {
    return jobMode === "title" ? jobTitle.trim() : jobDesc.trim();
  }, [jobMode, jobTitle, jobDesc]);

  const canGenerate =
    !!file &&
    !!resumeText &&
    !isScanned &&
    !!jobText &&
    !extracting &&
    !generating;

  async function handleExtract(selectedFile) {
    setFile(selectedFile);
    setExtractError("");
    setIsScanned(false);
    setResumeText("");
    setPdfUrl("");
    setMatchPercent(null);
    setExtracting(true);

    if (!selectedFile) {
      setExtractError("Please select a PDF file.");
      setExtracting(false);
      return;
    }

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
      setResumeData(null); // Clear previous structured data

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

  async function parseResume() {
    if (!resumeText || !jobText) return;
    setParsing(true);
    try {
      const res = await fetch(`${API}/api/parse-resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText, jobText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Parsing failed");
      setResumeData(data);
      setIsEditing(true);
    } catch (e) {
      console.error("Parse error:", e);
      setExtractError("Failed to prepare editor. Check your connection.");
    } finally {
      setParsing(false);
    }
  }


  async function runMatch() {
    if (!resumeText || !jobText) return 0;
    setMatching(true);

    try {
      const res = await fetch(`${API}/api/expand-job`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText, jobText }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Match failed");

      const percent = data?.match_percent ?? 0;
      setMatchPercent(percent);
      return percent;
    } catch (e) {
      console.error("Match error:", e);
      return 0;
    } finally {
      setMatching(false);
    }
  }

  async function generateResume({ force }) {
    setExtractError("");
    
    // 1. Direct generation if forced
    if (force) {
      setGenerating(true);
      try {
        const res = await fetch(`${API}/api/generate-pdf`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resumeText, jobText, resumeData: resumeData }),
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
    // Force download by adding query param
    const downloadUrl = pdfUrl.includes("?") ? `${pdfUrl}&download=1` : `${pdfUrl}?download=1`;
    a.href = downloadUrl;
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

        {/* Generate & Edit */}
        <div className="generateWrap" style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <button
            className={`btn primary big ${!canGenerate ? "disabledBlur" : ""}`}
            disabled={!canGenerate}
            onClick={() => generateResume({ force: false })}
          >
            {generating ? "Generating..." : "Generate PDF Resume"}
          </button>

          <button
            className={`btn secondary big ${!canGenerate || parsing ? "disabledBlur" : ""}`}
            disabled={!canGenerate || parsing}
            onClick={() => {
              if (resumeData) setIsEditing(true);
              else parseResume();
            }}
          >
            {parsing ? "Preparing Editor..." : "Review & Edit Content"}
          </button>
        </div>


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

        {/* Resume Editor modal */}
        {isEditing && resumeData && (
          <ResumeEditor
            data={resumeData}
            jobContext={jobText}
            onSave={(newData) => {
              setResumeData(newData);
              setIsEditing(false);
              generateResume({ force: true }); // Auto-generate PDF after edit
            }}
            onCancel={() => setIsEditing(false)}
          />
        )}


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
          }}
        />
      </main>

      <footer className="footer">Career Catalyst (AI Resume Alignment) Ready</footer>
    </div>
  );
}