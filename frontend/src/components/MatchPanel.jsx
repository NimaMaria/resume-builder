export default function MatchPanel({ matchPercent, presentKeywords, missingKeywords, note }) {
  const percent = typeof matchPercent === "number" ? matchPercent : 0;

  return (
    <div className="matchWrap">
      <div className="matchTop">
        <div>
          <div className="matchTitle">Keyword Match</div>
          <div className="matchSub">{note || "Match results"}</div>
        </div>
        <div className="matchScore">
          <div className="scoreNum">{matchPercent === null ? "--" : `${percent}%`}</div>
          <div className="scoreLabel">Match</div>
        </div>
      </div>

      <div className="bar">
        <div className="barFill" style={{ width: `${percent}%` }} />
      </div>

      <div className="kwGrid">
        <div className="kwBlock">
          <div className="kwHead">Present keywords</div>
          <div className="chips">
            {presentKeywords?.length ? (
              presentKeywords.map((k) => (
                <span key={k} className="chip ok">{k}</span>
              ))
            ) : (
              <span className="muted">-</span>
            )}
          </div>
        </div>

        <div className="kwBlock">
          <div className="kwHead">Missing keywords</div>
          <div className="chips">
            {missingKeywords?.length ? (
              missingKeywords.map((k) => (
                <span key={k} className="chip warn">{k}</span>
              ))
            ) : (
              <span className="muted">-</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}