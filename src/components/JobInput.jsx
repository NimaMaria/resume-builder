export default function JobInput({
  mode,
  setMode,
  jobTitle,
  setJobTitle,
  jobDesc,
  setJobDesc,
}) {
  return (
    <div className="jobBox">
      <div className="tabs">
        <button
          type="button"
          className={["tab", mode === "title" ? "active" : ""].join(" ")}
          onClick={() => setMode("title")}
        >
          Job Title
        </button>
        <button
          type="button"
          className={["tab", mode === "description" ? "active" : ""].join(" ")}
          onClick={() => setMode("description")}
        >
          Job Description
        </button>
      </div>

      {mode === "title" ? (
        <div className="field">
          <label>Enter job title</label>
          <input
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            placeholder="e.g., Frontend Developer (React)"
          />
        </div>
      ) : (
        <div className="field">
          <label>Paste job description</label>
          <textarea
            value={jobDesc}
            onChange={(e) => setJobDesc(e.target.value)}
            placeholder="Paste the job description here..."
            rows={9}
          />
        </div>
      )}
    </div>
  );
}