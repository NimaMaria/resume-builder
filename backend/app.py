from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import io
import os
import json
import shutil
import subprocess
import tempfile
import pdfplumber

from dotenv import load_dotenv
from groq import Groq

app = Flask(__name__)
CORS(app)

load_dotenv()
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
client = Groq(api_key=GROQ_API_KEY)

TEMPLATE_PATH = os.path.join("templates", "resume_template.tex")
OUTPUT_DIR = "outputs"
LATEST_PDF = os.path.join(OUTPUT_DIR, "latest_resume.pdf")


@app.get("/api/health")
def api_health():
    return jsonify({"status": "ok"})


@app.post("/api/extract")
def api_extract():
    if "file" not in request.files:
        return jsonify({"error": "No file provided. Use form-data key 'file'."}), 400

    f = request.files["file"]
    if not f.filename.lower().endswith(".pdf"):
        return jsonify({"error": "Only PDF files are allowed."}), 400

    try:
        pdf_bytes = f.read()
        text_parts = []
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page in pdf.pages:
                text_parts.append(page.extract_text() or "")

        full_text = "\n".join(text_parts).strip()

        return jsonify({
            "text": full_text,
            "is_scanned": (full_text == "")
        })
    except Exception as e:
        return jsonify({"error": f"Extraction failed: {str(e)}"}), 500


def groq_generate_resume_json(resume_text: str, job_text: str) -> dict:
    """
    Groq outputs STRICT JSON only.
    """
    system_msg = (
        "You are an ATS resume rewriting assistant.\n"
        "Hard rules:\n"
        "- Use ONLY facts present in RESUME_TEXT.\n"
        "- Do NOT invent companies, degrees, dates, tools, metrics.\n"
        "- If missing, use empty string.\n"
        "- Output ONLY valid JSON (no markdown, no explanation).\n"
    )

    user_msg = f"""
RESUME_TEXT:
{resume_text}

JOB_DESCRIPTION:
{job_text}

Return JSON with exactly these keys:
{{
  "name": "",
  "email": "",
  "phone": "",
  "portfolio": "",
  "github": "",
  "education": [{{"school":"","degree":"","location":"","dates":"","details":""}}],
  "skills": {{
    "Languages": [],
    "Frameworks": [],
    "Tools": [],
    "Platforms": [],
    "Soft Skills": []
  }},
  "experience": [
    {{
      "company":"",
      "title":"",
      "location":"",
      "dates":"",
      "bullets":[]
    }}
  ],
  "projects": [
    {{
      "name":"",
      "desc":"",
      "tech":"",
      "bullets":[]
    }}
  ]
}}

Notes:
- Keep bullets concise, ATS-friendly, job-relevant.
- Do not duplicate.
- If something isn't in resume text, keep it blank.
""".strip()

    resp = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        temperature=0.2,
        max_tokens=2200,
        messages=[
            {"role": "system", "content": system_msg},
            {"role": "user", "content": user_msg},
        ],
    )

    content = (resp.choices[0].message.content or "").strip()

    # Parse JSON safely
    try:
        data = json.loads(content)
    except Exception:
        # If Groq outputs extra text, try to extract JSON object
        start = content.find("{")
        end = content.rfind("}")
        if start == -1 or end == -1:
            raise ValueError("Groq did not return JSON.")
        data = json.loads(content[start:end+1])

    return data


def latex_escape(s: str) -> str:
    if s is None:
        return ""
    rep = {
        "\\": r"\textbackslash{}",
        "&": r"\&",
        "%": r"\%",
        "$": r"\$",
        "#": r"\#",
        "_": r"\_",
        "{": r"\{",
        "}": r"\}",
        "~": r"\textasciitilde{}",
        "^": r"\textasciicircum{}",
    }
    out = ""
    for ch in str(s):
        out += rep.get(ch, ch)
    return out


def make_education_block(education_list):
    parts = []
    for e in (education_list or []):
        school = latex_escape(e.get("school", ""))
        degree = latex_escape(e.get("degree", ""))
        location = latex_escape(e.get("location", ""))
        dates = latex_escape(e.get("dates", ""))
        details = latex_escape(e.get("details", ""))

        if not any([school, degree, location, dates, details]):
            continue

        parts.append(rf"\resumeEntry{{{school}}}{{{location}}}")
        parts.append(rf"\resumeSub{{{degree}}}{{{dates}}}")
        if details:
            parts.append(rf"{{\small {details}}}")
        parts.append(r"\vspace{6pt}")
    return "\n".join(parts) if parts else r"\resumeEntry{ }{ }"


def make_skills_block(skills):
    # Render like the screenshot: label on left, list on right
    def join_list(arr):
        return latex_escape(", ".join(arr or []))

    langs = join_list((skills or {}).get("Languages", []))
    fr = join_list((skills or {}).get("Frameworks", []))
    tools = join_list((skills or {}).get("Tools", []))
    plat = join_list((skills or {}).get("Platforms", []))
    soft = join_list((skills or {}).get("Soft Skills", []))

    return rf"""
\begin{{tabularx}}{{\textwidth}}{{@{{}} l X @{{}}}}
\textbf{{Languages:}} & {langs} \\
\textbf{{Frameworks:}} & {fr} \\
\textbf{{Tools:}} & {tools} \\
\textbf{{Platforms:}} & {plat} \\
\textbf{{Soft Skills:}} & {soft} \\
\end{{tabularx}}
""".strip()


def make_bullets(bullets):
    items = []
    for b in (bullets or []):
        b = latex_escape(b)
        if b.strip():
            items.append(rf"\item {b}")
    if not items:
        items = [r"\item "]
    return "\n".join(items)


def make_experience_block(exps):
    parts = []
    for x in (exps or []):
        company = latex_escape(x.get("company", ""))
        title = latex_escape(x.get("title", ""))
        location = latex_escape(x.get("location", ""))
        dates = latex_escape(x.get("dates", ""))

        if not any([company, title, location, dates]):
            continue

        parts.append(rf"\resumeEntry{{{company}}}{{{location}}}")
        parts.append(rf"\resumeSub{{{title}}}{{{dates}}}")
        parts.append(rf"\resumeBullets{{{make_bullets(x.get('bullets', []))}}}")
        parts.append(r"\vspace{4pt}")
    return "\n".join(parts) if parts else r"\resumeEntry{ }{ }"


def make_projects_block(projs):
    parts = []
    for p in (projs or []):
        name = latex_escape(p.get("name", ""))
        desc = latex_escape(p.get("desc", ""))
        tech = latex_escape(p.get("tech", ""))

        if not any([name, desc, tech]):
            continue

        right = ""
        parts.append(rf"\resumeEntry{{{name}}}{{{right}}}")
        if desc:
            parts.append(rf"{{\small {desc}}}")
        if tech:
            parts.append(rf"{{\small \textit{{Tech:}} {tech}}}")
        parts.append(rf"\resumeBullets{{{make_bullets(p.get('bullets', []))}}}")
        parts.append(r"\vspace{4pt}")
    return "\n".join(parts) if parts else r"\resumeEntry{ }{ }"


def fill_latex_template(data: dict) -> str:
    if not os.path.exists(TEMPLATE_PATH):
        raise FileNotFoundError(f"Template not found: {TEMPLATE_PATH}")

    with open(TEMPLATE_PATH, "r", encoding="utf-8") as f:
        template = f.read()

    name = latex_escape(data.get("name", "YOUR NAME"))
    email = latex_escape(data.get("email", ""))
    phone = latex_escape(data.get("phone", ""))
    portfolio = latex_escape(data.get("portfolio", ""))
    github = latex_escape(data.get("github", ""))

    education_block = make_education_block(data.get("education", []))
    skills_block = make_skills_block(data.get("skills", {}))
    experience_block = make_experience_block(data.get("experience", []))
    projects_block = make_projects_block(data.get("projects", []))

    # Replace placeholders
    out = template
    out = out.replace("<<NAME>>", name)
    out = out.replace("<<EMAIL>>", email)
    out = out.replace("<<PHONE>>", phone)
    out = out.replace("<<PORTFOLIO>>", portfolio)
    out = out.replace("<<GITHUB>>", github)
    out = out.replace("<<EDUCATION_BLOCK>>", education_block)
    out = out.replace("<<SKILLS_BLOCK>>", skills_block)
    out = out.replace("<<EXPERIENCE_BLOCK>>", experience_block)
    out = out.replace("<<PROJECTS_BLOCK>>", projects_block)

    return out


def compile_latex_to_pdf_pdflatex(latex: str) -> str:
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    workdir = tempfile.mkdtemp(prefix="latex_")
    tex_path = os.path.join(workdir, "resume.tex")

    with open(tex_path, "w", encoding="utf-8") as f:
        f.write(latex)

    cmd = ["pdflatex", "-interaction=nonstopmode", "-halt-on-error", "resume.tex"]

    run1 = subprocess.run(cmd, cwd=workdir, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    if run1.returncode != 0:
        raise RuntimeError("pdflatex failed:\n" + run1.stdout[-2000:])

    run2 = subprocess.run(cmd, cwd=workdir, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    if run2.returncode != 0:
        raise RuntimeError("pdflatex failed (2nd run):\n" + run2.stdout[-2000:])

    pdf_path = os.path.join(workdir, "resume.pdf")
    if not os.path.exists(pdf_path):
        raise RuntimeError("PDF not produced.")

    shutil.copyfile(pdf_path, LATEST_PDF)
    return LATEST_PDF


@app.post("/api/generate-pdf")
def api_generate_pdf():
    if not GROQ_API_KEY:
        return jsonify({"error": "GROQ_API_KEY not found. Set it in backend/.env"}), 500

    data = request.get_json(silent=True) or {}
    resume_text = (data.get("resumeText") or "").strip()
    job_text = (data.get("jobText") or "").strip()

    if not resume_text:
        return jsonify({"error": "resumeText is empty"}), 400
    if not job_text:
        return jsonify({"error": "jobText is empty"}), 400

    try:
        resume_json = groq_generate_resume_json(resume_text, job_text)
        latex = fill_latex_template(resume_json)
        compile_latex_to_pdf_pdflatex(latex)

        return jsonify({"pdf_url": "http://127.0.0.1:5000/api/latest-pdf"})
    except Exception as e:
        return jsonify({"error": f"PDF generation failed: {str(e)}"}), 500


@app.get("/api/latest-pdf")
def api_latest_pdf():
    if not os.path.exists(LATEST_PDF):
        return jsonify({"error": "No PDF generated yet"}), 404

    return send_file(
        LATEST_PDF,
        mimetype="application/pdf",
        as_attachment=False,
        download_name="resume.pdf"
    )


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)