export default function TemplateModal({ open, onClose, onSelect }) {
  if (!open) return null;

  const options = ["Template 1", "Template 2", "Template 3"];

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalCard" onClick={(e) => e.stopPropagation()}>
        <div className="modalTitleRow">
          <div className="warnIcon">🧩</div>
          <div>
            <div className="modalTitle">Choose Template</div>
            <div className="modalSub">
              Templates will be designed later. For now select one placeholder.
            </div>
          </div>
        </div>

        <div className="modalList">
          {options.map((t) => (
            <button
              key={t}
              type="button"
              className="listItem"
              onClick={() => onSelect(t)}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="modalActions">
          <button className="btn primary" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}