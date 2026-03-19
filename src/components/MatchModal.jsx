export default function MatchModal({
  open,
  matchPercent,
  onClose,
  onGenerateAnyway,
  onGoAnalyzer,
}) {
  if (!open) return null;

  const isBlocked = matchPercent <= 30;

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalCard" onClick={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <div className="modalIcon">{isBlocked ? "❌" : "⚡"}</div>
          <div className="modalTitle">
            {isBlocked ? "Match Score Optimization" : "Resume Alignment"}
          </div>
        </div>

        <div className="modalBody">
          <div className="scoreHighlight">
            <span className="scoreValue" style={{
              background: isBlocked ? 'linear-gradient(135deg, #fff 30%, #fecaca)' : undefined,
              webkitTextFillColor: isBlocked ? '#ef4444' : undefined
            }}>
              {matchPercent}%
            </span>
            <span className="scoreText">Match Score</span>
          </div>

          <p className="modalMsg">
            {isBlocked
              ? "Your current resume doesn't meet the target keyword alignment (30%). Please use the Resume Analyzer to identify missing skills or update your resume for better results."
              : `Your resume has ${matchPercent}% alignment with the job requirements.`
            }
          </p>
        </div>

        <div className="modalActionsContainer">
          {!isBlocked && (
            <div className="modalPrimaryActions">
              <button className="btn secondary" type="button" onClick={onGoAnalyzer}>
                Go to Resume Analyzer
              </button>
              <button className="btn primary" type="button" onClick={onGenerateAnyway}>
                Generate Anyway
              </button>
            </div>
          )}
          <div className="modalSecondaryActions">
            <button className="btn ghost" type="button" onClick={onClose}>
              {isBlocked ? "Close" : "Cancel"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}