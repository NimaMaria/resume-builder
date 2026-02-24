import { useMemo, useState } from "react";
import Navbar from "../components/Navbar";
import UploadBox from "../components/UploadBox";
import JobInput from "../components/JobInput";
import MatchPanel from "../components/MatchPanel";
import PdfPreview from "../components/PdfPreview";
import TemplateModal from "../components/TemplatePicker";
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

  // Template
  const [templateChosen, setTemplateChosen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [openTemplate, setOpenTemplate] = useState(false);

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
    templateChosen &&
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

    setExtracting(true);

    try {

      // Demo extraction (temporary)
      await new Promise((r) => setTimeout(r, 500));

      const demoText =
        "Skills: Python, Flask, HTML, CSS, JavaScript, React, SQL, Git\nProjects: Resume Builder\nEducation: B.Tech";

      setResumeText(demoText);

      const scanned = selectedFile?.name?.toLowerCase().includes("scanned");
      setIsScanned(scanned);

      if (scanned) {
        setExtractError(
          "This looks like a scanned PDF. Upload a proper text-based PDF."
        );
      }

    } catch {
      setExtractError("Extraction failed.");
    } finally {
      setExtracting(false);
    }
  }

  async function runMatch() {

    setMatching(true);

    try {

      await new Promise((r) => setTimeout(r, 400));

      const jobKeywords = extractKeywords(jobText);
      const resumeKeywords = new Set(extractKeywords(resumeText));

      const present = jobKeywords.filter((k) =>
        resumeKeywords.has(k)
      );

      const missing = jobKeywords.filter((k) =>
        !resumeKeywords.has(k)
      );

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
    setPdfUrl("");

    try {

      const percent = await runMatch();

      if (percent < 40 && !force) {
        setShowLowMatch(true);
        return;
      }

      await new Promise((r) => setTimeout(r, 600));

      const html = makeDemoHtmlResume({
        name: "Generated Resume",
        templateName,
        matchPercent: percent
      });

      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);

      setPdfUrl(url);

    } finally {
      setGenerating(false);
    }
  }

  function downloadFile() {

    if (!pdfUrl) return;

    const a = document.createElement("a");
    a.href = pdfUrl;
    a.download = "resume.html";
    a.click();
  }

  return (

    <div className="app">

      {/* NAVBAR */}
      <Navbar />

      <main className="container">

        <div className="hero">
          <h1>Resume Builder</h1>
          <p>Upload resume → choose template → generate</p>
        </div>

        {/* Upload */}
        <div className="card">

          <div className="cardHeader">
            <h3>Upload Resume PDF</h3>
          </div>

          <UploadBox
            file={file}
            extracting={extracting}
            onExtract={handleExtract}
          />

          {extractError &&
            <div className="alert danger">
              {extractError}
            </div>
          }

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

        {/* Template */}
        <div className="card">

          <div className="cardHeader">
            <h3>Template</h3>
          </div>

          <div className="row">

            <button
              className="btn outline"
              onClick={() => setOpenTemplate(true)}
            >
              Choose Template
            </button>

            {templateChosen
              ? <div className="pill">
                  Selected: {templateName}
                </div>
              : <div className="muted">
                  No template selected
                </div>
            }

          </div>

        </div>

        {/* Generate */}
        <div className="generateWrap">

          <button
            className={`btn primary big ${!canGenerate ? "disabledBlur" : ""}`}
            disabled={!canGenerate}
            onClick={() => generateResume({ force: false })}
          >
            {generating ? "Generating..." : "Generate Resume"}
          </button>

        </div>

        {/* Match */}
        {matchPercent !== null &&

          <MatchPanel
            matchPercent={matchPercent}
            presentKeywords={presentKeywords}
            missingKeywords={missingKeywords}
            note={matchNote}
          />

        }

        {/* Preview */}
        <div className="card">

          <div className="cardHeader">
            <h3>Preview</h3>
          </div>

          <PdfPreview pdfUrl={pdfUrl} />

          <div className="exportRow">

            <button
              className="btn secondary"
              disabled={!pdfUrl}
            >
              View PDF
            </button>

            <button
              className="btn secondary"
              disabled={!pdfUrl}
              onClick={downloadFile}
            >
              Download PDF
            </button>

          </div>

        </div>

        {/* Template modal */}
        <TemplateModal
          open={openTemplate}
          onClose={() => setOpenTemplate(false)}
          onSelect={(name) => {
            setTemplateChosen(true);
            setTemplateName(name);
            setOpenTemplate(false);
          }}
        />

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

      <footer className="footer">
        RollNavigator Resume Builder UI Ready
      </footer>

    </div>
  );
}

/* helpers */

function extractKeywords(text) {

  return text
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 40);

}

function makeDemoHtmlResume({ name, templateName, matchPercent }) {

  return `
<html>
<body>
<h1>${name}</h1>
<p>Template: ${templateName}</p>
<p>Match: ${matchPercent}%</p>
</body>
</html>
`;

}