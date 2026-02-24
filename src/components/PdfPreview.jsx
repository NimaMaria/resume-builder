export default function PdfPreview({ pdfUrl }) {
  if (!pdfUrl) {
    return (
      <div className="previewEmpty">
        <div className="previewIcon">🧾</div>
        <div className="previewText">No preview yet</div>
      </div>
    );
  }

  return <iframe title="resume-preview" className="previewFrame" src={pdfUrl} />;
}