export default function WarningModal({
  open,
  matchPercent,
  onClose,
  onGenerateAnyway,
  onGoAnalyzer,
}) {
  if (!open) return null;

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalCard" onClick={(e) => e.stopPropagation()}>
        <div className="modalTitleRow">
          <div className="warnIcon">⚠️</div>
          <div>
            <div className="modalTitle">Low Keyword Match</div>
            <div className="modalSub">
              Your resume matches only <b>{matchPercent}%</b> of job keywords.
            </div>
          </div>
        </div>

        <div className="modalMsg">
          Go to <b>Resume Analyzer</b> to see what skills/keywords are missing — or generate anyway.
        </div>

        <div className="modalActions">
          <button className="btn ghost" type="button" onClick={onGoAnalyzer}>
            Go to Resume Analyzer
          </button>
          <button className="btn outline" type="button" onClick={onGenerateAnyway}>
            Generate Anyway
          </button>
          <button className="btn primary" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}