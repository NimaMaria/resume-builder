import { useRef } from "react";

export default function UploadBox({ file, extracting, onExtract }) {
  const inputRef = useRef(null);

  function onPick() {
    inputRef.current?.click();
  }

  function onChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".pdf")) {
      alert("Upload a PDF file only.");
      return;
    }
    onExtract(f);
  }

  function onDrop(e) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".pdf")) {
      alert("Upload a PDF file only.");
      return;
    }
    onExtract(f);
  }

  return (
    <div
      className={["uploadBox", extracting ? "disabled" : ""].join(" ")}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <div className="uploadIcon">📄</div>
      <div className="uploadTitle">Drag & drop your resume PDF here</div>
      <div className="uploadSub">or browse from your device</div>

      <div className="uploadRow">
        <button className="btn primary" onClick={onPick} disabled={extracting} type="button">
          {extracting ? "Extracting..." : "Browse PDF"}
        </button>
        {file ? <div className="filePill">{file.name}</div> : null}
      </div>

      <input ref={inputRef} type="file" accept="application/pdf" hidden onChange={onChange} />
    </div>
  );
}