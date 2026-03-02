from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import io
import os
import json
import shutil
import subprocess
import tempfile
import pdfplumber
import re

from dotenv import load_dotenv
from groq import Groq

app = Flask(__name__)
CORS(app)

print("✅ Running app from:", __file__)

# ----------------------------
# Config
# ----------------------------
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"), override=True)
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
print("Loaded GROQ_API_KEY prefix:", (GROQ_API_KEY[:12] + "...") if GROQ_API_KEY else "None")
client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

TEMPLATE_PATH = os.path.join("templates", "resume_template.tex")
OUTPUT_DIR = "outputs"
LATEST_PDF = os.path.join(OUTPUT_DIR, "latest_resume.pdf")


# ----------------------------
# Basic routes
# ----------------------------
@app.get("/api/health")
def api_health():
    return jsonify({"status": "ok"})


@app.post("/api/extract")
def api_extract():
    """
    Upload a text-based PDF and extract text using pdfplumber.
    Frontend sends: FormData with key "file"
    """
    if "file" not in request.files:
        return jsonify({"error": "No file provided. Use form-data key 'file'."}), 400

    f = request.files["file"]
    if not (f.filename or "").lower().endswith(".pdf"):
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


# ----------------------------
# Helpers
# ----------------------------
def normalize_text(s: str) -> str:
    if not s:
        return ""
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    while "\n\n\n" in s:
        s = s.replace("\n\n\n", "\n\n")
    return s.strip()


def looks_like_job_title(job_text: str) -> bool:
    jt = (job_text or "").strip()
    if not jt:
        return True
    if len(jt.split()) <= 6:
        return True
    if len(jt) <= 80 and not re.search(r"[.,;:\n]", jt):
        return True
    return False


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


def normalize_url(u: str) -> str:
    u = (u or "").strip()
    if not u:
        return ""
    if re.match(r"^(https?://)", u, re.IGNORECASE):
        return u
    if " " not in u and ("." in u or u.lower().startswith("www.")):
        return "https://" + u
    return u


def latex_escape_url(u: str) -> str:
    if u is None:
        return ""
    return (
        str(u)
        .replace("\\", r"\textbackslash{}")
        .replace("%", r"\%")
        .replace("#", r"\#")
        .replace("&", r"\&")
        .replace("_", r"\_")
        .replace("{", r"\{")
        .replace("}", r"\}")
    )


# ----------------------------
# Job‑tailoring helpers
# ----------------------------
# Keywords and deterministic sorting used to live here, but we now ask
# the LLM to perform those tasks so the Python code stays generic.
# The `reorder_resume_json` function remains as a no‑op for any legacy
# call sites.

def reorder_resume_json(data: dict, role_family: str) -> dict:
    # the model output should already be ordered and have a job‑specific
    # summary; we don't modify anything locally.
    return data


# ----------------------------
# LaTeX builder
# ----------------------------
def make_contact_lines(contact: dict) -> str:
    lines = []
    email = (contact.get("email") or "").strip()
    phone = (contact.get("phone") or "").strip()
    linkedin = (contact.get("linkedin") or "").strip()
    github = (contact.get("github") or "").strip()
    portfolio = (contact.get("portfolio") or "").strip()
    location = (contact.get("location") or "").strip()

    if email:
        safe_email = latex_escape(email)
        href_email = latex_escape_url("mailto:" + email)
        lines.append(rf"Email: \href{{{href_email}}}{{{safe_email}}}")

    if phone:
        lines.append(f"Mobile: {latex_escape(phone)}")

    if linkedin:
        url = normalize_url(linkedin)
        lines.append(rf"LinkedIn: \href{{{latex_escape_url(url)}}}{{{latex_escape(linkedin)}}}")

    if github:
        url = normalize_url(github)
        lines.append(rf"Github: \href{{{latex_escape_url(url)}}}{{{latex_escape(github)}}}")

    if portfolio:
        url = normalize_url(portfolio)
        lines.append(rf"Portfolio: \href{{{latex_escape_url(url)}}}{{{latex_escape(portfolio)}}}")

    if location:
        lines.append(f"{latex_escape(location)}")

    return r"\\ ".join(lines) if lines else ""


def make_paragraph(text: str) -> str:
    text = (text or "").strip()
    return latex_escape(text) if text else ""


def make_skills_table(skills: dict) -> str:
    rows = []
    order = ["Languages", "Frameworks", "Tools", "Platforms", "Soft Skills"]
    for k in order:
        items = skills.get(k) or []
        items = [str(x).strip() for x in items if str(x).strip()]
        if not items:
            continue
        value = latex_escape(", ".join(items))
        rows.append(rf"\textbf{{{latex_escape(k)}:}} & {value} \\")
    if not rows:
        return ""
    return (
        r"\begin{tabularx}{\textwidth}{@{} l X @{} }" + "\n"
        + "\n".join(rows) + "\n"
        + r"\end{tabularx}"
    )


def make_section(title: str, body_tex: str) -> str:
    body_tex = (body_tex or "").strip()
    if not body_tex:
        return ""
    return rf"""
\section{{{latex_escape(title)}}}
\sectionrule
{body_tex}
""".strip()


def make_bullets(items):
    clean = [latex_escape(x) for x in (items or []) if str(x).strip()]
    if not clean:
        return ""
    bullets = "\n".join([rf"\item {x}" for x in clean])
    return rf"\resumeBullets{{{bullets}}}"


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

    return "\n".join(parts)


def make_experience_block(exps):
    parts = []
    for x in (exps or []):
        company = latex_escape(x.get("company", ""))
        title = latex_escape(x.get("title", ""))
        location = latex_escape(x.get("location", ""))
        dates = latex_escape(x.get("dates", ""))

        bullets = make_bullets(x.get("bullets", []))

        if not any([company, title, location, dates, bullets]):
            continue

        parts.append(rf"\resumeEntry{{{company}}}{{{location}}}")
        parts.append(rf"\resumeSub{{{title}}}{{{dates}}}")
        if bullets:
            parts.append(bullets)
        parts.append(r"\vspace{4pt}")

    return "\n".join(parts)


def make_projects_block(projs):
    parts = []
    for p in (projs or []):
        name = latex_escape(p.get("name", ""))
        desc = latex_escape(p.get("desc", ""))
        tech = latex_escape(p.get("tech", ""))

        bullets = make_bullets(p.get("bullets", []))

        if not any([name, desc, tech, bullets]):
            continue

        parts.append(rf"\resumeEntry{{{name}}}{{}}")
        if desc:
            parts.append(rf"{{\small {desc}}}")
        if tech:
            parts.append(rf"{{\small \textit{{Tech:}} {tech}}}")
        if bullets:
            parts.append(bullets)
        parts.append(r"\vspace{4pt}")

    return "\n".join(parts)


def make_extra_sections(extra_sections):
    out = []
    for sec in (extra_sections or []):
        title = (sec.get("title") or "").strip()
        items = sec.get("items") or []
        items = [str(x).strip() for x in items if str(x).strip()]
        if not title or not items:
            continue
        block = make_bullets(items)
        section_tex = make_section(title.upper(), block)
        if section_tex:
            out.append(section_tex)
    return "\n\n".join(out)


def fill_latex_template(data: dict) -> str:
    if not os.path.exists(TEMPLATE_PATH):
        raise FileNotFoundError(f"Template not found: {TEMPLATE_PATH}")

    with open(TEMPLATE_PATH, "r", encoding="utf-8") as f:
        template = f.read()

    name = latex_escape(data.get("name", "YOUR NAME"))
    contact_lines = make_contact_lines(data.get("contact", {}))

    summary_text = make_paragraph(data.get("summary", ""))
    summary_section = make_section("SUMMARY", summary_text)

    edu_block = make_education_block(data.get("education", []))
    skills_table = make_skills_table(data.get("skills", {}))
    exp_block = make_experience_block(data.get("experience", []))
    proj_block = make_projects_block(data.get("projects", []))
    extra_block = make_extra_sections(data.get("extra_sections", []))

    edu_section = make_section("EDUCATION", edu_block)
    skills_section = make_section("SKILLS SUMMARY", skills_table)
    exp_section = make_section("EXPERIENCE", exp_block)
    proj_section = make_section("PROJECTS", proj_block)

    out = template
    out = out.replace("<<NAME>>", name)
    out = out.replace("<<CONTACT_LINES>>", contact_lines)
    out = out.replace("<<SUMMARY_SECTION>>", summary_section)
    out = out.replace("<<EDU_SECTION>>", edu_section)
    out = out.replace("<<SKILLS_SECTION>>", skills_section)
    out = out.replace("<<EXP_SECTION>>", exp_section)
    out = out.replace("<<PROJ_SECTION>>", proj_section)
    out = out.replace("<<EXTRA_SECTIONS>>", extra_block)

    return out


def compile_latex_to_pdf_pdflatex(latex: str) -> str:
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    if shutil.which("pdflatex") is None:
        raise RuntimeError(
            "pdflatex not found. Install MiKTeX/TeX Live and ensure 'pdflatex' is in PATH."
        )

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


# ----------------------------
# Groq: generate structured JSON resume
# (ONLY ONE LLM CALL PER GENERATION)
# ----------------------------
def groq_generate_resume_json(resume_text: str, job_text: str) -> dict:
    if not client:
        raise RuntimeError("GROQ_API_KEY not found. Set it in backend/.env")

    # The model now acts as both parser and resume editor. It should:
    # 1. Parse the resume into structured JSON
    # 2. Identify required skills/tech from the job text
    # 3. Reorder experience, projects, and skills to emphasize job relevance
    # 4. Rewrite the summary to highlight qualifications for THIS SPECIFIC JOB
    # The key is that the output must VISIBLY DIFFER for different jobs.
    system_msg = (
        "You are an elite resume parser and job-tailoring expert. Your mission is to create \n"
        "powerful, ATS-optimized, and recruiter-friendly resumes that VISIBLY emphasize \n"
        "job fit for each specific role.\n\n"
        "YOUR TASK:\n"
        "1. Parse the resume into structured JSON.\n"
        "2. IDENTIFY job-critical skills/techs/methodologies from JOB_TEXT.\n"
        "3. CRAFT POWERFUL SUMMARY: Write a compelling 2-3 sentence professional hook that:\n"
        "   - Immediately shows alignment with the specific job role\n"
        "   - Uses industry-relevant Keywords from the job description\n"
        "   - Highlights unique value proposition for THIS JOB\n"
        "   - Backend: Server architecture, database optimization, API design, scalability\n"
        "   - Frontend: Component architecture, UX/UI excellence, responsive design, performance\n"
        "   - Full-Stack: End-to-end ownership, full tech stack proficiency\n"
        "   - Data: Analytics, ML/AI models, data pipelines, insights generation\n"
        "   - DevOps: Infrastructure, CI/CD, monitoring, automation\n"
        "4. REORDER experience: Most relevant role first, then by job-fit relevance.\n"
        "5. REORDER bullets: Highlight achievements matching job requirements at TOP.\n"
        "6. REORDER projects: Feature projects most relevant to job FIRST.\n"
        "7. REORDER skills: Put job-critical skills at TOP of each category.\n"
        "8. ENHANCE visibility: Make bullets action-oriented with quantified results.\n\n"
        "CRITICALITY:\n"
        "- Summary MUST be noticeably different and more powerful for different jobs.\n"
        "- Reorder experience/projects/skills visibly for each job.\n"
        "- Do NOT return the same resume for different job inputs.\n"
        "- Use ONLY resume facts; do NOT invent achievements.\n"
        "- Prioritize IMPACT and RELEVANCE.\n\n"
        "Output STRICT JSON only.\n"
    )

    user_msg = f"""
RESUME_TEXT:
{resume_text}

JOB_TEXT (role/description to tailor for):
{job_text}

TASK:
1. Parse resume into the JSON schema
2. PRIORITIZE job relevance in reordering:
   - Experience: Put role MOST ALIGNED to '{job_text}' FIRST
   - Bullets: Put achievements matching job requirements at TOP of each role
   - Projects: Rank by relevance to job requirements FIRST
   - Skills: List job-critical technical skills and categories at TOP
3. CRAFT powerful summary (2-3 sentences) that:
   - Opens with direct alignment to the job role
   - Incorporates key Terms/skills from job description
   - Highlights relevant achievements and expertise
   - Demonstrates value proposition for THIS JOB
   - Uses strong, action-oriented language
   - For Backend: emphasize API design, database, scalability, server architecture
   - For Frontend: emphasize UI/UX, React/Vue/Angular, responsive design, performance
   - For Full Stack: emphasize end-to-end development, full tech stack
   - For Data/ML: emphasize models, analytics, data pipelines, insights
   - For DevOps: emphasize infrastructure, CI/CD, monitoring, reliability

CRITICAL EXAMPLES: 
- Resume has: "Built React components, designed RESTful APIs, optimized database queries"
- For "Frontend Developer": summary highlights React expertise, component architecture, responsive UI
- For "Backend Developer": summary emphasizes API design, database optimization, scalability
- DIFFERENT JOBS must produce VISIBLY DIFFERENT reordering and summary

Schema:
{{
  "name": "",
  "contact":{{"email":"","phone":"","linkedin":"","github":"","portfolio":"","location":""}},
  "summary": "",
  "education": [{{"school":"","degree":"","dates":"","location":"","details":""}}],
  "skills":{{"Languages":[],"Frameworks":[],"Tools":[],"Platforms":[],"Soft Skills":[]}},
  "experience":[{{"company":"","title":"","location":"","dates":"","bullets":[]}}],
  "projects":[{{"name":"","desc":"","tech":"","bullets":[]}}],
  "extra_sections":[{{"title":"","items":[]}}],
  "job_keywords": [],
  "expanded_job_text": ""
}}

EMIT job_keywords: technical skills/terms from JOB_TEXT that appear in resume
EMIT expanded_job_text: if job was short title, expand it to 1-2 sentences; else echo it back

Return ONLY JSON with no explanation.
""".strip()

    resp = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        temperature=0.4,
        max_tokens=3500,
        messages=[
            {"role": "system", "content": system_msg},
            {"role": "user", "content": user_msg},
        ],
    )

    content = (resp.choices[0].message.content or "").strip()

    try:
        return json.loads(content)
    except Exception:
        start = content.find("{")
        end = content.rfind("}")
        if start == -1 or end == -1:
            raise RuntimeError("Groq did not return JSON.")
        return json.loads(content[start:end + 1])


# ----------------------------
# Generate PDF endpoint
# ----------------------------
@app.post("/api/generate-pdf")
def api_generate_pdf():
    """
    Input JSON: { "resumeText": "...", "jobText": "..." }
    Output JSON: { "pdf_url": "...", "job_mode": "title|desc", "expanded_job_text": "...", "job_keywords": [...] }
    """
    if not client:
        return jsonify({"error": "GROQ_API_KEY not found. Set it in backend/.env"}), 500

    data = request.get_json(silent=True) or {}
    resume_text = normalize_text((data.get("resumeText") or "").strip())
    job_text_raw = (data.get("jobText") or "").strip()

    if not resume_text:
        return jsonify({"error": "resumeText is empty"}), 400
    if not job_text_raw:
        return jsonify({"error": "jobText is empty"}), 400

    job_mode = "title" if looks_like_job_title(job_text_raw) else "desc"
    effective_job_text = normalize_text(job_text_raw)

    try:
        resume_json = groq_generate_resume_json(resume_text, effective_job_text)

        # no-op; the model already ordered everything
        resume_json = reorder_resume_json(resume_json, "")

        # pull metadata that the prompt may have added
        expanded = resume_json.pop("expanded_job_text", "")
        kw = resume_json.pop("job_keywords", [])

        latex = fill_latex_template(resume_json)
        compile_latex_to_pdf_pdflatex(latex)

        pdf_url = request.host_url.rstrip("/") + "/api/latest-pdf"

        resp = {"pdf_url": pdf_url, "job_mode": job_mode}
        if expanded:
            resp["expanded_job_text"] = expanded
        if isinstance(kw, list):
            resp["job_keywords"] = kw
        return jsonify(resp)
    except Exception as e:
        return jsonify({"error": f"PDF generation failed: {str(e)}"}), 500


@app.post("/api/expand-job")
def api_expand_job():
    """
    Accepts { jobText: string, resumeText: string } and returns JSON with
    the following fields:
      - expanded_job_text: job text (possibly expanded if it looked like a
        terse title)
      - job_mode: "title" or "desc"
      - job_keywords: array of skills/terms extracted from the job text
      - present_keywords: subset of job_keywords found or implied in resume
      - missing_keywords: job_keywords not found in resume
      - match_percent: integer 0–100 representing percent of keywords present

    Example:
      Input jobText="Frontend Developer" and resumeText containing
      "built React components and improved UX" may yield
      { job_keywords:["react","components","ux"],
        present_keywords:["react","components","ux"],
        match_percent:100, ... }

    The model should perform semantic matching rather than mere
    substring checks. Output STRICT JSON only.
    """
    if not client:
        return jsonify({"error": "GROQ_API_KEY not found. Set it in backend/.env"}), 500

    data = request.get_json(silent=True) or {}
    job_text = (data.get("jobText") or "").strip()
    resume_text = normalize_text((data.get("resumeText") or "").strip())

    if not job_text:
        return jsonify({"error": "jobText is empty"}), 400

    job_mode = "title" if looks_like_job_title(job_text) else "desc"

    # ask the model to expand and extract keywords and score match
    system_msg = (
        "You are a job requirements analyzer.\n"
        "Given a job title or description and the applicant's resume text,\n"
        "perform the following steps carefully:\n"
        "1. Expand a terse title to a fuller, human‑readable description if the\n"
        "   input looks like a short role name.\n"
        "2. Identify the core skills, technologies, tools, and soft‑skills that the\n"
        "   job text is asking for. Include synonyms or paraphrases when the\n        meaning is the same (e.g. \"UI\" and \"user interface\").\n"
        "3. Examine RESUME_TEXT and determine which of those keywords are\n        actually present or clearly implied in the candidate's experience.\n"
        "   Matching should be semantic, not just literal substring search.\n"
        "4. Compute match_percent as (#present_keywords / #job_keywords) * 100,\n"
        "   rounded to the nearest integer.\n"
        "5. Return arrays present_keywords and missing_keywords accordingly.\n\n"
        "Example expectation:\n"
        "JOB_TEXT: Frontend Developer\n"
        "RESUME_TEXT mentions \"built React components and improved UX\"\n"
        "-> job_keywords might include [\"react\", \"components\", \"ux\"]\n"
        "   present_keywords should list all three and match_percent 100.\n\n"
        "Always output STRICT JSON only, with no extra text or explanation."
    )

    user_msg = f"""
JOB_TEXT:
{job_text}

RESUME_TEXT (for keyword filtering and matching):
{resume_text}

Return JSON with these fields:
{{
  "expanded_job_text": "...",
  "job_mode": "title" or "desc",
  "job_keywords": ["skill1","skill2",...],
  "present_keywords": ["skillA","skillB",...],
  "missing_keywords": ["skillX","skillY",...],
  "match_percent": 0  # integer 0-100
}}

- job_keywords should list important skills/terms from JOB_TEXT.
- present_keywords should be job_keywords that appear (or are clearly implied) in RESUME_TEXT.
- missing_keywords should be the remainder.
- match_percent should be (#present / #job)*100, rounded to nearest integer.

Return ONLY valid JSON.
""".strip()

    resp = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        temperature=0.4,
        max_tokens=800,
        messages=[
            {"role": "system", "content": system_msg},
            {"role": "user", "content": user_msg},
        ],
    )
    content = (resp.choices[0].message.content or "").strip()
    try:
        result = json.loads(content)
        # debug output for developers
        print("[expand-job] job_text=", job_text[:80], "match_percent=", result.get("match_percent"))
        return jsonify(result)
    except Exception:
        # attempt to salvage JSON from text
        start = content.find("{")
        end = content.rfind("}")
        if start == -1 or end == -1:
            return jsonify({"error": "Invalid response from LLM"}), 500
        parsed = json.loads(content[start:end + 1])
        print("[expand-job] parsed fallback, job_text=", job_text[:80])
        return jsonify(parsed)


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