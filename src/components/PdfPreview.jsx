export default function PdfPreview({ pdfUrl }) {
  if (!pdfUrl) {
    return (
      <div className="previewEmpty">
        <div className="previewIcon">🧾</div>
        <div className="previewText">No preview yet</div>
      </div>
    );
  }

  // Optional: hide toolbar. You can remove the #... part if you want toolbar.
  const src = `${pdfUrl}#toolbar=0&navpanes=0&scrollbar=0`;

  return (
    <iframe
      title="resume-preview"
      className="previewFrame"
      src={src}
      loading="lazy"
    />
  );
}