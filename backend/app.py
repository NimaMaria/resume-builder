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
if GROQ_API_KEY:
    print("Loaded GROQ_API_KEY prefix:", f"{GROQ_API_KEY[:10]}...")
else:
    print("Loaded GROQ_API_KEY prefix: None")

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


def handle_bold(s: str) -> str:
    """Converts **text** to \\textbf{text} after escaping."""
    import re
    return re.sub(r"\*\*(.*?)\*\*", r"\\textbf{\1}", s)


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
    parts = []
    email = (contact.get("email") or "").strip()
    phone = (contact.get("phone") or "").strip()
    linkedin = (contact.get("linkedin") or "").strip()
    github = (contact.get("github") or "").strip()
    portfolio = (contact.get("portfolio") or "").strip()
    location = (contact.get("location") or "").strip()

    if location:
        parts.append(handle_bold(latex_escape(location)))

    if email:
        safe_email = latex_escape(email)
        href_email = latex_escape_url("mailto:" + email)
        parts.append(rf"\href{{{href_email}}}{{{safe_email}}}")

    if phone:
        parts.append(latex_escape(phone))

    if linkedin:
        url = normalize_url(linkedin)
        label = linkedin.replace("https://", "").replace("www.", "").rstrip("/")
        parts.append(rf"\href{{{latex_escape_url(url)}}}{{{latex_escape(label)}}}")

    if github:
        url = normalize_url(github)
        label = github.replace("https://", "").replace("www.", "").rstrip("/")
        parts.append(rf"\href{{{latex_escape_url(url)}}}{{{latex_escape(label)}}}")

    if portfolio:
        url = normalize_url(portfolio)
        label = portfolio.replace("https://", "").replace("www.", "").rstrip("/")
        parts.append(rf"\href{{{latex_escape_url(url)}}}{{{latex_escape(label)}}}")

    # Join with a bullet separator
    separator = r" \quad \textbullet \quad "
    return separator.join(parts) if parts else ""


def make_paragraph(text: str) -> str:
    text = (text or "").strip()
    if not text:
        return ""
    return handle_bold(latex_escape(text))


def make_skills_table(skills: dict) -> str:
    rows = []
    order = ["Languages", "Frameworks", "Tools", "Platforms", "Soft Skills"]
    for k in order:
        items = skills.get(k) or []
        items = [str(x).strip() for x in items if str(x).strip()]
        if not items:
            continue
        # Apply handle_bold to skills content
        value = handle_bold(latex_escape(", ".join(items)))
        rows.append(rf"\textbf{{{latex_escape(k)}:}} {value}")
    if not rows:
        return ""
    return "\n".join([rf"{r}\par" for r in rows])


def make_section(title: str, body_tex: str) -> str:
    body_tex = (body_tex or "").strip()
    if not body_tex:
        return ""
    return rf"""
\section{{{latex_escape(title)}}}
{body_tex}
""".strip()


def make_bullets(items):
    # We want to escape most things but allow \hfill which we might have added manually
    def escape_if_needed(x):
        if "\\hfill" in str(x):
            # If it has \hfill, we assume the parts are already escaped or handled
            return x
        return handle_bold(latex_escape(x))

    clean = [escape_if_needed(x) for x in (items or []) if str(x).strip()]
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
        details = e.get("details", "")

        if not any([school, degree, location, dates, details]):
            continue

        # Extract CGPA/Grade from details if it looks like a single metric
        right_side = ""
        if isinstance(details, str) and details.strip() and not any(x in str(details) for x in ["\n", "•", "*"]):
            upper_details = details.upper()
            if "CGPA" in upper_details or "%" in upper_details or "PERCENT" in upper_details or "SCORE" in upper_details:
                right_side = latex_escape(details.strip())
                details = ""

        # Line 1: Institution: (Dates) \hfill Grade
        label = school
        if dates:
            label = rf"{school}: ({dates})"
        
        parts.append(rf"\resumeEntry{{{label}}}{{{right_side}}}")
        
        # Line 2: Degree (Italics)
        if degree:
            parts.append(rf"{{\textit{{{degree}}}}}\par")
            if details:
                parts.append(r"\vspace{2pt}")

        # Line 3+: Details (Bullets, e.g., for School Grades)
        if details:
            items = []
            if isinstance(details, list):
                items = [str(x) for x in details if x]
            elif isinstance(details, str) and details.strip():
                # Split and listify
                items = [re.sub(r"^[•\*\-\s]+", "", x).strip() for x in re.split(r"[\n•\*]+", details) if x.strip()]

            if items:
                formatted_items = []
                for item in items:
                    item_str = str(item)
                    # Delimiters: ':' or ' - ' or '--' or '  '
                    delim = None
                    if ":" in item_str: delim = ":"
                    elif " - " in item_str: delim = " - "
                    elif " -- " in item_str: delim = " -- "
                    elif "  " in item_str: delim = "  "
                    
                    if delim:
                        p = item_str.split(delim, 1)
                        # Escape BEFORE join
                        l = latex_escape(p[0].strip())
                        r = latex_escape(p[1].strip())
                        # Auto-bold board names in parentheses, e.g. (ISC)
                        l = re.sub(r"(\(.*?\))", r"\\textbf{\1}", l)
                        formatted_items.append(rf"{l} \hfill {r}")
                    else:
                        formatted_items.append(latex_escape(item_str))
                parts.append(make_bullets(formatted_items))

        parts.append(r"\vspace{4pt}")

    return "\n".join(parts)


def make_experience_block(exps):
    parts = []
    for x in (exps or []):
        company = latex_escape(x.get("company", ""))
        title = handle_bold(latex_escape(x.get("title", "")))
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
        link = normalize_url((p.get("link") or "").strip())
        desc = handle_bold(latex_escape(p.get("desc", "")))
        tech = handle_bold(latex_escape(p.get("tech", "")))

        bullets = make_bullets(p.get("bullets", []))

        if not any([name, desc, tech, bullets, link]):
            continue

        # Header with link if present
        if link:
            # We want the link to be clickable but maybe show a nice name
            safe_link = latex_escape_url(link)
            parts.append(rf"\resumeEntry{{\href{{{safe_link}}}{{{name} \externalLink}}}}{{}}")
        else:
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

    # Header Data
    name = latex_escape(data.get("name", "YOUR NAME"))
    
    contact = data.get("contact", {})
    header_vals = []
    if contact.get("phone"): header_vals.append(rf"\faPhone\ {latex_escape(contact['phone'])}")
    if contact.get("email"): header_vals.append(rf"\faEnvelope\ {latex_escape(contact['email'])}")
    if contact.get("linkedin"):
        li = str(contact["linkedin"]).split("/")[-1].strip("/")
        header_vals.append(rf"\faLinkedin\ {latex_escape(li)}")
    if contact.get("github"):
        gh = str(contact["github"]).split("/")[-1].strip("/")
        header_vals.append(rf"\faGithub\ {latex_escape(gh)}")
    if contact.get("location"): header_vals.append(rf"\faMapMarker*\ {latex_escape(contact['location'])}")
    
    contact_line = " \\enspace | \\enspace ".join(header_vals)

    # --- Build Single Column Body ---
    body_parts = []
    
    # Summary
    summary = data.get("summary", "")
    if summary:
        body_parts.append(r"\section*{SUMMARY}")
        body_parts.append(latex_escape(summary))

    # Experience
    exp_block = make_experience_block(data.get("experience", []))
    if exp_block:
        body_parts.append(r"\section*{EXPERIENCE}")
        body_parts.append(exp_block)

    # Projects
    proj_block = make_projects_block(data.get("projects", []))
    if proj_block:
        body_parts.append(r"\section*{PROJECTS}")
        body_parts.append(proj_block)

    # Education
    edu_block = make_education_block(data.get("education", []))
    if edu_block:
        body_parts.append(r"\section*{EDUCATION}")
        body_parts.append(edu_block)

    # Skills
    skills_table = make_skills_table(data.get("skills", {}))
    if skills_table:
        body_parts.append(r"\section*{SKILLS}")
        body_parts.append(skills_table)

    # Extras
    extras = data.get("extra_sections", [])
    if isinstance(extras, list):
        for sec in extras:
            # Escape the title as it may contain '&' (e.g., ACHIEVEMENTS & CERTIFICATIONS)
            t = latex_escape((sec.get("title") or "").upper())
            items = [str(x) for x in (sec.get("items") or []) if x]
            if not items: continue
            
            body_parts.append(rf"\section*{{{t}}}")
            body_parts.append(make_bullets(items))

    body_content = "\n\n".join(body_parts)

    # Fill final template
    out = template
    out = out.replace("<<NAME>>", name)
    out = out.replace("<<CONTACT_LINE>>", contact_line)
    out = out.replace("<<BODY>>", body_content)

    return out


def compile_latex_to_pdf_pdflatex(latex: str) -> str:
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    if shutil.which("pdflatex") is None:
        raise RuntimeError(
            "pdflatex not found. Install MiKTeX/TeX Live and ensure 'pdflatex' is in PATH."
        )

    workdir = tempfile.mkdtemp(prefix="latex_")
    import time
    job_id = int(time.time() * 1000)
    tex_filename = f"resume_{job_id}.tex"
    tex_path = os.path.join(workdir, tex_filename)

    with open(tex_path, "w", encoding="utf-8") as f:
        f.write(latex)

    cmd = ["pdflatex", "-interaction=nonstopmode", "-halt-on-error", tex_filename]

    run1 = subprocess.run(cmd, cwd=workdir, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    if run1.returncode != 0:
        stdout_msg = run1.stdout or ""
        raise RuntimeError("pdflatex failed:\n" + stdout_msg[-2000:])

    run2 = subprocess.run(cmd, cwd=workdir, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    if run2.returncode != 0:
        stdout_msg = run2.stdout or ""
        raise RuntimeError("pdflatex failed (2nd run):\n" + stdout_msg[-2000:])

    pdf_filename = f"resume_{job_id}.pdf"
    pdf_path = os.path.join(workdir, pdf_filename)
    if not os.path.exists(pdf_path):
        raise RuntimeError("PDF not produced.")

    shutil.copyfile(pdf_path, LATEST_PDF)
    return LATEST_PDF


# ----------------------------
# Groq: generate structured JSON resume
# (ONLY ONE LLM CALL PER GENERATION)
# ----------------------------
def groq_generate_resume_json(resume_text: str, job_text: str) -> dict:
    print(f"--- [groq_generate_resume_json] Input lengths: resume={len(resume_text)}, job={len(job_text)}")
    if not client:
        raise RuntimeError("GROQ_API_KEY not found. Set it in backend/.env")


    # The model now acts as both parser and resume editor. It should:
    # 1. Parse the resume into structured JSON
    # 2. Identify required skills/tech from the job text
    # 3. Reorder experience, projects, and skills to emphasize job relevance
    # 4. Rewrite the summary to highlight qualifications for THIS SPECIFIC JOB
    # The key is that the output must VISIBLY DIFFER for different jobs.
    system_msg = (
        "You are an Elite Resume Architect & Professional Editor. Your mission is to produce a flawless, tailored resume in valid JSON.\n\n"
        "STRICT CONTENT RULES:\n"
        "1. **ZERO TOLERANCE FOR REPETITION**: You MUST NOT repeat any action verb. Each bullet point across the entire resume must start with a unique, high-impact verb. If you use 'Engineered', you cannot use it again anywhere. Use 'Architected', 'Spearheaded', 'Optimized', 'Pioneered', 'Scalability-focused', etc.\n"
        "2. **QUANTIFIABLE METRICS (MANDATORY)**: EVERY single bullet point in 'experience' and 'projects' MUST include a specific, hard number (e.g., 20%, $50k, 500+ users, 30 ms). If the input text lacks numbers, generate a realistic, conservative estimation based on standard industry metrics for the role. NEVER use vague terms like 'improved performance'; use 'improved performance by 35%'.\n"
        "3. **PHRASE DIVERSITY**: Do NOT repeat multi-word phrases. If you use 'scaled distributed systems' in one bullet, do not use it again. Constantly vary your descriptive language.\n"
        "4. **BUZZWORD & JARGON BAN**: Strictly avoid vague, overused clichés. Prohibited terms include: 'results-oriented', 'team player', 'passionate', 'self-starter', 'thought leader', 'synergy', 'dynamic', 'expert', 'best-in-class', 'detail-oriented', 'hardworking', 'proven track record', 'highly skilled'. Replace these with concrete evidence.\n"
        "5. **SEMANTIC DIVERSITY**: Do not repeat technical tools in every bullet point. If 'React' is in the skills section, only mention it in experience if you are describing a *specific* high-impact implementation. Avoid 'Used React to build X' repeatedly.\n"
        "6. **ULTRA-STRICT BOLDING**: Do NOT bold any text in bullet points. Use plain text everywhere except section headers and institution/role names defined in the schema logic.\n"
        "7. **EDUCATION STRUCTURE (CRITICAL)**: For university, college, and high schools: map the institution name to 'school' and the degree title to 'degree'. For grades (CGPA/Percentage), place them in the 'details' field.\n"
        "8. **NO FILLER**: Avoid generic summaries. Focus on specific impact for the target JOB_TEXT. Every sentence must add new information.\n"
        "9. **FLAWLESS PROOFREADING**: Catch every single spelling and grammar mistake. Use professional US English.\n"
        "10. **JSON INTEGRITY**: Return valid JSON. Do NOT include LaTeX backslashes or commands like \\hfill or \\textbf in the values.\n"
        "11. **RICH EXTRA SECTIONS**: If the candidate has Certifications, Achievements, or relevant Awards, put them in 'extra_sections' with appropriate titles ('CERTIFICATIONS', 'ACHIEVEMENTS').\n"
        "12. **PROJECT LINKS**: If a project has a link (GitHub, Live Demo), extract it to the 'link' field.\n"
        "Produce ONLY valid JSON according to the schema."

    )

    user_msg = f"""
RESUME_TEXT:
{resume_text}
JOB_TEXT (tailor for):
{job_text}

1. Create an elite, highly-tailored resume in JSON format.
2. SUMMARY: Craft a compelling 3-4 sentence professional summary. It MUST start with a strong hook, lead into specific high-impact achievements (use metrics like %, $), and explicitly state how the candidate's unique background solves the specific problems mentioned in the JOB_TEXT. Avoid generic filler.
3. EXPERIENCE: Rewrite experience bullets using the 'Action Verb + Task + Result' formula. Ensure zero repetition of action verbs.
4. FLAWLESS POLISH: Ensure 100% correct grammar, professional vocabulary, and perfect spelling.
5. REORDER: Lead with the most relevant experience and projects for THIS job.

Schema:
{{
  "name": "",
  "contact":{{"email":"","phone":"","linkedin":"","github":"","portfolio":"","location":""}},
  "summary": "",
  "education": [{{"school":"","degree":"","dates":"","location":"","details":""}}],
  "skills":{{"Languages":[],"Frameworks":[],"Tools":[],"Platforms":[],"Soft Skills":[]}},
  "experience":[{{"company":"","title":"","location":"","dates":"","bullets":[]}}],
  "projects":[{{"name":"","desc":"","tech":"","link":"","bullets":[]}}],

  "extra_sections":[{{"title":"","items":[]}}]
}}

Return ONLY JSON.
""".strip()

    resp = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        temperature=0.0,
        max_tokens=3500,
        messages=[
            {"role": "system", "content": system_msg},
            {"role": "user", "content": user_msg},
        ],
    )

    content = (resp.choices[0].message.content or "").strip()

    # Clean up common invalid JSON escapes returned by some LLMs (e.g. \$ or \%)
    content_clean = (content
        .replace(r"\$", "$")
        .replace(r"\%", "%")
        .replace(r"\&", "&")
        .replace(r"\_", "_")
        .replace(r"\#", "#")
        .replace(r"\{", "{")
        .replace(r"\}", "}")
    )

    try:
        print(f"--- [groq_generate_resume_json] Attempting JSON parse...")
        return json.loads(content_clean)
    except Exception as e:
        print(f"--- [groq_generate_resume_json] Standard JSON parse failed: {str(e)}")
        # Fallback: extract JSON from larger text output

        start = content_clean.find("{")
        end = content_clean.rfind("}")
        if start == -1 or end == -1:
            print("--- INVALID PAYLOAD ---")
            print(content)
            print("--- END ---")
            raise RuntimeError("Groq did not return JSON.")
        json_str = content_clean[start : end + 1]
        try:
            return json.loads(json_str)
        except Exception as e:
            print("--- JSON ERROR ---")
            print(json_str)
            print("Error details:", str(e))
            print("--- END ---")
            raise e


# ----------------------------
# Generate PDF endpoint
# ----------------------------
@app.post("/api/generate-pdf")
def api_generate_pdf():
    """
    Input JSON: { "resumeText": "...", "jobText": "...", "resumeData": {...} }
    Output JSON: { "pdf_url": "...", "job_mode": "title|desc" }
    """
    if not client:
        return jsonify({"error": "GROQ_API_KEY not found. Set it in backend/.env"}), 500

    data = request.get_json(silent=True) or {}
    resume_json = data.get("resumeData")

    if not resume_json:
        # Fallback to the one-shot extraction flow if no structured data provided
        resume_text = normalize_text((data.get("resumeText") or "").strip())
        job_text_raw = (data.get("jobText") or "").strip()

        if not resume_text:
            return jsonify({"error": "resumeText is empty"}), 400
        if not job_text_raw:
            return jsonify({"error": "jobText is empty"}), 400

        effective_job_text = normalize_text(job_text_raw)
        try:
            resume_json = groq_generate_resume_json(resume_text, effective_job_text)
        except Exception as e:
            return jsonify({"error": f"LLM parsing failed: {str(e)}"}), 500
    
    job_mode = data.get("job_mode") or "desc"

    try:
        latex = fill_latex_template(resume_json)
        compile_latex_to_pdf_pdflatex(latex)

        pdf_url = request.host_url.rstrip("/") + "/api/latest-pdf"

        resp = {"pdf_url": pdf_url, "job_mode": job_mode}
        return jsonify(resp)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"PDF generation failed: {str(e)}"}), 500



@app.post("/api/parse-resume")
def api_parse_resume():
    """
    Converts raw resume text and job description into structured JSON.
    """
    if not client:
        return jsonify({"error": "GROQ_API_KEY not found."}), 500

    data = request.get_json(silent=True) or {}
    resume_text = normalize_text((data.get("resumeText") or "").strip())
    job_text = normalize_text((data.get("jobText") or "").strip())

    if not resume_text:
        return jsonify({"error": "resumeText is empty"}), 400

    try:
        resume_json = groq_generate_resume_json(resume_text, job_text)
        return jsonify(resume_json)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.post("/api/ai-edit")
def api_ai_edit():
    """
    Rewrites a specific resume section/sentence based on an instruction.
    """
    if not client:
        return jsonify({"error": "GROQ_API_KEY not found."}), 500

    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    instruction = (data.get("instruction") or "").strip()
    job_context = (data.get("jobContext") or "").strip()

    if not text:
        return jsonify({"error": "text is empty"}), 400

    system_msg = (
        "You are a Senior Career Coach and Expert Editor.\n"
        "Your goal is to rewrite the provided resume content to make it HIGHER IMPACT and precisely tailored.\n"
        "Rules:\n"
        "1. Follow the instruction EXACTLY.\n"
        "2. Keep the length similar unless the instruction says otherwise.\n"
        "3. Use active, punchy verbs.\n"
        "4. Fix any grammar or spelling.\n"
        "5. Output ONLY the rewritten text. NO preamble like 'Here is the edited text:'."
    )
    user_msg = f"""
CONTENT TO EDIT: {text}
INSTRUCTION: {instruction}
JOB CONTEXT: {job_context} (use this to tailor keywords)

Provide the rewritten content:
""".strip()

    try:
        resp = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            temperature=0.0,
            max_tokens=1000,
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
        )
        return jsonify({"editedText": (resp.choices[0].message.content or "").strip()})
    except Exception as e:
        return jsonify({"error": str(e)}), 500



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
        "You are a generous, industry-aware Job Matching Expert.\n"
        "Your goal is to evaluate the match between a job and a resume with 'MERCY' and semantic insight.\n\n"
        "SCORING RULES:\n"
        "1. **SEMANTIC MATCHING (SHOW MERCY)**: Do not look for exact keyword matches. If a candidate uses a related word, a synonym, or demonstrates a concept that implies the skill, count it as PRESENT. Examples:\n"
        "   - 'Redux' or 'Provider' => Match for 'State Management'\n"
        "   - 'REST' or 'GraphQL' => Match for 'APIs'\n"
        "   - 'Vite' or 'Webpack' => Match for 'Build Tools'\n"
        "   - 'Clean Architecture' or 'SOLID' => Match for 'Software Design'\n"
        "2. **INCLUSIVE SKILL EXTRACTION**: Extract core high-level skills from the JOB_TEXT. Don't be pedantic about versions or minor tools.\n"
        "3. **RESUME QUALITY**: Be encouraging. If the resume is professional and readable, give a high quality score.\n"
        "4. **CALCULATION**: Match Percent = (#present / #total_job_keywords) * 100. Be generous with rounding.\n\n"
        "Output ONLY valid JSON."
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
  "match_percent": 0,  # integer 0-100
  "resume_quality_score": 0  # integer 0-100
}}

- job_keywords: important skills/terms from JOB_TEXT.
- present_keywords: job_keywords that appear (or are clearly implied) in RESUME_TEXT.
- missing_keywords: the remainder.
- match_percent: (#present / #job)*100.
- resume_quality_score: Based on grammar, vocabulary variety (no repetition), and polish.

Return ONLY valid JSON.
""".strip()

    try:
        resp = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            temperature=0.0,
            max_tokens=800,
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
        )
    except Exception as e:
        error_msg = str(e)
        if "billing" in error_msg.lower() or "quota" in error_msg.lower():
            return jsonify({
                "error": "Groq API quota exceeded or billing issue. Please check https://console.groq.com/settings/billing"
            }), 503
        return jsonify({"error": f"LLM Match Score Engine Error: {error_msg}"}), 500
    content = (resp.choices[0].message.content or "").strip()
    try:
        result = json.loads(content)
        # debug output for developers
        job_log = job_text[:80] if job_text else ""
        print("[expand-job] job_text=", job_log, "match_percent=", result.get("match_percent"))
        return jsonify(result)
    except Exception:
        # attempt to salvage JSON from text
        start = content.find("{")
        end = content.rfind("}")
        if start == -1 or end == -1:
            return jsonify({"error": "Invalid response from LLM"}), 500
        parsed = json.loads(content[start:end + 1])
        job_log = job_text[:80] if job_text else ""
        print("[expand-job] parsed fallback, job_text=", job_log)
        return jsonify(parsed)

@app.post("/api/analyze-resume")
def api_analyze_resume():
    """
    Accepts { resumeText: string, jobText: string } and returns detailed
    content analysis: score, repetition, weak_verbs, grammar, impact.
    """
    if not client:
        return jsonify({"error": "GROQ_API_KEY not found."}), 500

    data = request.get_json(silent=True) or {}
    resume_text = (data.get("resumeText") or "").strip()
    job_text = (data.get("jobText") or "").strip()

    if not resume_text:
        return jsonify({"error": "resumeText is empty"}), 400

    system_msg = (
        "You are a Senior Strategic Career Consultant and Resume Expert.\n"
        "Your task is to provide a deep-dive analysis of a resume's content quality.\n"
        "Be constructive, specific, and focus on high-impact improvements.\n"
        "Return STRICT JSON only."
    )

    user_msg = f"""
    Evaluate the following resume against the target job requirements:
    RESUME: {resume_text}
    TARGET JOB: {job_text}

    Analyze the following criteria:
    1. Score (0-100): An overall professional index based on completeness, impact, and relevance.
    2. Repetition: Identify overused words, techniques, or phrases.
    3. Weak_verbs: Find passive or generic verbs and suggest dynamic alternatives.
    4. Grammar: List specific syntax, spelling, or punctuation errors.
    5. Impact: Provide actionable advice on how to quantify achievements and improve the 'hook' for this specific role.

    Return JSON format:
    {{
      "score": 0-100,
      "repetition": [],
      "weak_verbs": [],
      "grammar": [],
      "impact": []
    }}
    """
    try:
        resp = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            temperature=0.0,
            max_tokens=1500,
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg},
            ],
        )
        # Fix: correctly extract content from response
        raw_content = resp.choices[0].message.content or ""
        content_str = str(raw_content).strip()
        start = content_str.find("{")
        end = content_str.rfind("}")
        
        if start != -1 and end != -1:
            json_str = content_str[start : end + 1]
            return jsonify(json.loads(json_str))
        
        return jsonify({"error": "No JSON found in response"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.get("/api/latest-pdf")
def api_latest_pdf():
    if not os.path.exists(LATEST_PDF):
        return jsonify({"error": "No PDF generated yet"}), 404

    # If ?download=1 is passed, force download
    should_download = request.args.get("download") == "1"

    return send_file(
        LATEST_PDF,
        mimetype="application/pdf",
        as_attachment=should_download,
        download_name="resume.pdf"
    )


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)