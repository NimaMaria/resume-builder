import React, { useState } from "react";

export default function ResumeEditor({ data, onSave, onCancel, jobContext }) {
    const [formData, setFormData] = useState(data);
    const [activeSection, setActiveSection] = useState("Summary");
    const [aiLoading, setAiLoading] = useState(null); // id of field being edited
    const [aiPrompt, setAiPrompt] = useState("");
    const [showAiInput, setShowAiInput] = useState(null); // id of field

    const sections = [
        "Summary",
        "Experience",
        "Projects",
        "Education",
        "Skills",
        "Extra Sections"
    ];

    const handleFieldChange = (path, value) => {
        const newData = { ...formData };
        let current = newData;
        const keys = path.split(".");
        for (let i = 0; i < keys.length - 1; i++) {
            current = current[keys[i]];
        }
        current[keys[keys.length - 1]] = value;
        setFormData(newData);
    };

    const handleAiEdit = async (path, originalText) => {
        if (!aiPrompt) return;
        setAiLoading(path);
        try {
            const res = await fetch("http://127.0.0.1:5000/api/ai-edit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text: originalText,
                    instruction: aiPrompt,
                    jobContext: jobContext
                })
            });
            const result = await res.json();
            if (res.ok && result.editedText) {
                handleFieldChange(path, result.editedText);
                setShowAiInput(null);
                setAiPrompt("");
            }
        } catch (e) {
            console.error("AI Edit failed", e);
        } finally {
            setAiLoading(null);
        }
    };

    return (
        <div className="modalOverlay" style={{ zIndex: 1100 }}>
            <div className="modalCard" style={{ width: 'min(1000px, 95%)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
                <div className="modalHeader" style={{ padding: '24px 32px', borderBottom: '1px solid var(--border)', marginBottom: 0 }}>
                    <div>
                        <h2 className="modalTitle">Review & Refine Resume</h2>
                        <p className="subtext">Make manual tweaks or ask AI to rewrite specific parts.</p>
                    </div>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '12px' }}>
                        <button className="btn secondary" onClick={onCancel}>Cancel</button>
                        <button className="btn primary" onClick={() => onSave(formData)}>Apply Changes & Generate PDF</button>
                    </div>
                </div>

                <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                    {/* Sidebar */}
                    <div style={{ width: '220px', borderRight: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)', padding: '16px' }}>
                        {sections.map(s => (
                            <button
                                key={s}
                                className={`tab ${activeSection === s ? 'active' : ''}`}
                                style={{ width: '100%', textAlign: 'left', marginBottom: '8px', display: 'block' }}
                                onClick={() => setActiveSection(s)}
                            >
                                {s}
                            </button>
                        ))}
                    </div>

                    {/* Main Content */}
                    <div style={{ flex: 1, padding: '32px', overflowY: 'auto' }}>
                        {activeSection === "Summary" && (
                            <div className="field">
                                <label>Professional Summary</label>
                                <AiWrapper
                                    id="summary"
                                    value={formData.summary}
                                    onChange={(v) => handleFieldChange("summary", v)}
                                    onAiEdit={(prompt) => handleAiEdit("summary", formData.summary)}
                                    loading={aiLoading === "summary"}
                                    isMultiline
                                />
                            </div>
                        )}

                        {activeSection === "Experience" && (
                            <div>
                                {Array.isArray(formData.experience) && formData.experience.map((exp, idx) => (
                                    <div key={idx} className="card" style={{ padding: '20px', marginBottom: '20px' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                                            <div className="field">
                                                <label>Company</label>
                                                <input value={exp.company} onChange={e => handleFieldChange(`experience.${idx}.company`, e.target.value)} />
                                            </div>
                                            <div className="field">
                                                <label>Title</label>
                                                <input value={exp.title} onChange={e => handleFieldChange(`experience.${idx}.title`, e.target.value)} />
                                            </div>
                                        </div>
                                        <div className="field">
                                            <label>Bullets</label>
                                            {Array.isArray(exp.bullets) && exp.bullets.map((b, bIdx) => (
                                                <AiWrapper
                                                    key={bIdx}
                                                    id={`exp.${idx}.${bIdx}`}
                                                    value={b}
                                                    onChange={(v) => {
                                                        const newBullets = [...exp.bullets];
                                                        newBullets[bIdx] = v;
                                                        handleFieldChange(`experience.${idx}.bullets`, newBullets);
                                                    }}
                                                    onAiEdit={(prompt) => {
                                                        setAiPrompt(prompt);
                                                        handleAiEdit(`experience.${idx}.bullets.${bIdx}`, b);
                                                    }}
                                                    loading={aiLoading === `experience.${idx}.bullets.${bIdx}`}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}


                        {activeSection === "Projects" && (
                            <div>
                                {formData.projects.map((proj, idx) => (
                                    <div key={idx} className="card" style={{ padding: '20px', marginBottom: '20px' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                                            <div className="field">
                                                <label>Project Name</label>
                                                <input value={proj.name} onChange={e => handleFieldChange(`projects.${idx}.name`, e.target.value)} />
                                            </div>
                                            <div className="field">
                                                <label>Project Link</label>
                                                <input value={proj.link || ""} placeholder="https://github.com/..." onChange={e => handleFieldChange(`projects.${idx}.link`, e.target.value)} />
                                            </div>
                                        </div>
                                        <div className="field">
                                            <label>Bullets</label>
                                            {Array.isArray(proj.bullets) && proj.bullets.map((b, bIdx) => (
                                                <AiWrapper
                                                    key={bIdx}
                                                    id={`proj.${idx}.${bIdx}`}
                                                    value={b}
                                                    onChange={(v) => {
                                                        const newBullets = [...proj.bullets];
                                                        newBullets[bIdx] = v;
                                                        handleFieldChange(`projects.${idx}.bullets`, newBullets);
                                                    }}
                                                    onAiEdit={(prompt) => {
                                                        setAiPrompt(prompt);
                                                        handleAiEdit(`projects.${idx}.bullets.${bIdx}`, b);
                                                    }}
                                                    loading={aiLoading === `projects.${idx}.bullets.${bIdx}`}
                                                />
                                            ))}
                                        </div>

                                    </div>
                                ))}
                            </div>
                        )}

                        {activeSection === "Education" && (
                            <div>
                                {formData.education.map((edu, idx) => (
                                    <div key={idx} className="card" style={{ padding: '20px', marginBottom: '20px' }}>
                                        <div className="field">
                                            <label>School</label>
                                            <input value={edu.school} onChange={e => handleFieldChange(`education.${idx}.school`, e.target.value)} />
                                        </div>
                                        <div className="field">
                                            <label>Degree</label>
                                            <input value={edu.degree} onChange={e => handleFieldChange(`education.${idx}.degree`, e.target.value)} />
                                        </div>
                                        <div className="field">
                                            <label>Details</label>
                                            <AiWrapper
                                              id={`edu.${idx}.details`}
                                              value={edu.details}
                                              onChange={(v) => handleFieldChange(`education.${idx}.details`, v)}
                                              onAiEdit={(prompt) => handleAiEdit(`education.${idx}.details`, edu.details)}
                                              loading={aiLoading === `education.${idx}.details`}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {activeSection === "Skills" && (
                            <div>
                                {Object.entries(formData.skills).map(([cat, items]) => (
                                    <div key={cat} className="field" style={{ marginBottom: '20px' }}>
                                        <label>{cat}</label>
                                        <input
                                            value={items.join(", ")}
                                            onChange={e => handleFieldChange(`skills.${cat}`, e.target.value.split(",").map(s => s.trim()))}
                                            placeholder="Skill, Skill, Skill..."
                                        />
                                    </div>
                                ))}
                            </div>
                        )}

                        {activeSection === "Extra Sections" && (
                            <div>
                                {formData.extra_sections.map((sec, idx) => (
                                    <div key={idx} className="card" style={{ padding: '20px', marginBottom: '20px' }}>
                                        <div className="field">
                                            <label>Section Title</label>
                                            <input value={sec.title} onChange={e => handleFieldChange(`extra_sections.${idx}.title`, e.target.value)} />
                                        </div>
                                        <div className="field">
                                            <label>Items</label>
                                            {sec.items.map((item, iIdx) => (
                                                <AiWrapper
                                                    key={iIdx}
                                                    id={`extra.${idx}.${iIdx}`}
                                                    value={item}
                                                    onChange={(v) => {
                                                        const newItems = [...sec.items];
                                                        newItems[iIdx] = v;
                                                        handleFieldChange(`extra_sections.${idx}.items`, newItems);
                                                    }}
                                                    onAiEdit={(prompt) => {
                                                        setAiPrompt(prompt);
                                                        handleAiEdit(`extra_sections.${idx}.items.${iIdx}`, item);
                                                    }}
                                                    loading={aiLoading === `extra_sections.${idx}.items.${iIdx}`}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function AiWrapper({ id, value, onChange, onAiEdit, loading, isMultiline = false }) {
    const [showInput, setShowInput] = useState(false);
    const [prompt, setPrompt] = useState("");

    return (
        <div style={{ position: 'relative', marginBottom: '12px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
                {isMultiline ? (
                    <textarea
                        style={{ flex: 1, minHeight: '120px' }}
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                    />
                ) : (
                    <input
                        style={{ flex: 1 }}
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                    />
                )}
                <button
                    className={`btn secondary ${loading ? 'animatePulse' : ''}`}
                    style={{ padding: '0 12px', height: '48px', minWidth: '48px', border: '1px solid var(--blue-500)', color: 'var(--blue-500)' }}
                    onClick={() => setShowInput(!showInput)}
                    title="AI Edit"
                    disabled={loading}
                >
                    {loading ? "..." : "✨"}
                </button>
            </div>

            {showInput && (
                <div style={{
                    marginTop: '8px',
                    padding: '12px',
                    background: 'rgba(59, 130, 246, 0.1)',
                    border: '1px solid var(--blue-500)',
                    borderRadius: '12px',
                    display: 'flex',
                    gap: '8px',
                    animation: 'slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                }}>
                    <input
                        autoFocus
                        style={{ flex: 1, background: 'rgba(0,0,0,0.3)', border: 'none', height: '36px', padding: '0 12px', fontSize: '13px' }}
                        placeholder="Tell AI how to rewrite (e.g. 'Make it more professional', 'Add metrics')"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            onAiEdit(prompt);
                            setShowInput(false);
                          }
                        }}
                    />
                    <button className="btn primary sm" style={{ padding: '0 16px', height: '36px', fontSize: '13px' }} onClick={() => {
                        onAiEdit(prompt);
                        setShowInput(false);
                    }}>
                        Apply
                    </button>
                    <button className="btn ghost sm" onClick={() => setShowInput(false)}>✕</button>
                </div>
            )}
        </div>
    );
}
