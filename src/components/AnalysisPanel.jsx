import React from "react";

export default function AnalysisPanel({ analysis, loading, onAnalyze }) {
    if (loading) {
        return (
            <div id="resume-analyzer" className="card animatePulse">
                <div className="cardHeader">
                    <h3>Analyzing Resume Content...</h3>
                </div>
                <div className="cardBody">
                    <p>Scrutinizing vocabulary, verbs, and impact metrics...</p>
                </div>
            </div>
        );
    }

    if (!analysis) {
        return (
            <div id="resume-analyzer" className="card">
                <div className="cardHeader">
                    <h3>Resume Quality Check</h3>
                </div>
                <div className="cardBody center">
                    <p className="subtext">Want to ensure your resume is error-free and high-impact?</p>
                    <button className="btn secondary" onClick={onAnalyze}>
                        Run Content Analysis
                    </button>
                </div>
            </div>
        );
    }

    const { score, repetition, weak_verbs, grammar, impact } = analysis;

    const getScoreColor = (s) => {
        if (s >= 80) return "#10b981"; // green
        if (s >= 60) return "#f59e0b"; // orange
        return "#ef4444"; // red
    };

    return (
        <div id="resume-analyzer" className="card">
            <div className="cardHeader between">
                <h3>Content Analysis</h3>
                <span
                    className="badge"
                    style={{
                        backgroundColor: getScoreColor(score),
                        color: 'white',
                        padding: '4px 12px',
                        borderRadius: '20px',
                        fontWeight: 'bold'
                    }}
                >
                    Score: {score}/100
                </span>
            </div>

            <div className="cardBody">
                <div className="analysisGrid">
                    <Section title="Repetition" items={repetition} icon="🔄" empty="No major repetition found." />
                    <Section title="Action Verbs" items={weak_verbs} icon="⚡" empty="Great use of active verbs!" />
                    <Section title="Grammar & Polish" items={grammar} icon="✍️" empty="No errors detected." />
                    <Section title="Impact & Metrics" items={impact} icon="📈" empty="Achievements are well-quantified." />
                </div>

                <div className="center mt-4">
                    <button className="btn outline sm" onClick={onAnalyze}>
                        Re-run Analysis
                    </button>
                </div>
            </div>
        </div>
    );
}

function Section({ title, items, icon, empty }) {
    return (
        <div className="analysisSection">
            <h4>{icon} {title}</h4>
            {items && items.length > 0 ? (
                <ul>
                    {items.map((item, i) => (
                        <li key={i}>{item}</li>
                    ))}
                </ul>
            ) : (
                <p className="success-text">{empty}</p>
            )}
        </div>
    );
}
